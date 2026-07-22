-- 20260722c: compute_monthly_claim resolves eligibility from the AUTHORITATIVE,
-- period-effective income_eligibility row (not the roster.frp mirror). NULL / expired /
-- absent determination => 'P'. GO Nikolay 2026-07-22 (P-default audit, hole #3(b)).
-- APPLIED to prod 2026-07-22 via apply_migration.
--
-- Only the `catmap` CTE changed vs the prior definition (which read ro.frp/ro.frp_expires).
-- Read-back (June 2026, per center, before -> after):
--   Highland F25->18 P57->64 reimb 6665.25->5739.05
--   Pearl    F25->23 P22->24 reimb 3603.13->3480.02
--   Ridge    F44->34 P65->75 reimb 6999.66->6487.84
--   Net F -19 / P +19 (R unchanged; the undocumented-52 are all F), enrolled stable,
--   reimb -$1561.13/mo org-wide — the intended conservative correction (undocumented /
--   expired no longer claim F). Restore F legitimately via the renewal campaign (52-file).
-- Rollback: restore the prior catmap reading (ro.frp / ro.frp_expires).
CREATE OR REPLACE FUNCTION menumaker.compute_monthly_claim(p_center_id uuid, p_month date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
with bounds as (
  select date_trunc('month', p_month)::date as m_start,
         (date_trunc('month', p_month) + interval '1 month')::date as m_end
),
unpiv as (
  select r.child_name, r.classroom, (r.monday_date + d.off) as dt,
         d.b, d.a, d.l, d.p, d.s, d.e
  from menumaker.meal_week_records r
  cross join bounds bo
  left join menumaker.classrooms cl on cl.id = r.classroom_id
  cross join lateral (values
    (0, r.mon_b, r.mon_as, r.mon_l, r.mon_ps, r.mon_su, r.mon_es),
    (1, r.tue_b, r.tue_as, r.tue_l, r.tue_ps, r.tue_su, r.tue_es),
    (2, r.wed_b, r.wed_as, r.wed_l, r.wed_ps, r.wed_su, r.wed_es),
    (3, r.thu_b, r.thu_as, r.thu_l, r.thu_ps, r.thu_su, r.thu_es),
    (4, r.fri_b, r.fri_as, r.fri_l, r.fri_ps, r.fri_su, r.fri_es)
  ) as d(off, b, a, l, p, s, e)
  where r.center_id = p_center_id
    and r.monday_date is not null
    and (r.monday_date + d.off) >= bo.m_start
    and (r.monday_date + d.off) <  bo.m_end
    and coalesce(cl.is_roster, true) = true
),
catmap as (
  -- period-effective authoritative eligibility (20260722c): the current determination
  -- per child = income_eligibility row with the furthest frp_expires; valid iff null or
  -- >= the claim month start. Absent / expired / non-F-R => 'P'.
  select distinct on (ro.child_name) ro.child_name,
         case when ie.eligibility in ('F','R')
                   and (ie.frp_expires is null or ie.frp_expires >= (select m_start from bounds))
              then ie.eligibility else 'P' end as eff
  from menumaker.roster ro
  left join lateral (
    select e.eligibility, e.frp_expires
    from menumaker.income_eligibility e
    where e.roster_id = ro.id
    order by e.frp_expires desc nulls last, e.determined_at desc nulls last
    limit 1
  ) ie on true
  where ro.center_id = p_center_id
  order by ro.child_name, ro.is_active desc nulls last
),
reimb_cd as (
  select coalesce(c.eff,'P') as eff,
         (u.b*(1-(u.b*u.l*u.s)))::int as bre_r,
         u.a::int as am_r, u.l::int as lun_r, u.s::int as sup_r,
         (u.p*(1-u.a))::int as pm_r,
         (u.e*(1-u.a)*(1-u.p))::int as eve_r
  from unpiv u
  left join catmap c on c.child_name = u.child_name
),
tot as (
  select coalesce(sum(bre_r),0) breakfast, coalesce(sum(am_r),0) am_snack,
         coalesce(sum(lun_r),0) lunch,     coalesce(sum(pm_r),0) pm_snack,
         coalesce(sum(sup_r),0) supper,    coalesce(sum(eve_r),0) evening_snack
  from reimb_cd
),
mbc as (
  select eff, sum(bre_r) breakfast, sum(am_r) am_snack, sum(lun_r) lunch,
         sum(pm_r) pm_snack, sum(sup_r) supper, sum(eve_r) evening_snack
  from reimb_cd group by eff
),
meal_long as (
  select 'breakfast'::text slot, eff, breakfast cnt from mbc
  union all select 'am_snack', eff, am_snack from mbc
  union all select 'lunch', eff, lunch from mbc
  union all select 'pm_snack', eff, pm_snack from mbc
  union all select 'supper', eff, supper from mbc
  union all select 'evening_snack', eff, evening_snack from mbc
),
rates as (
  select slot, category, rate
  from menumaker.cacfp_rates
  where effective_date = (
    select max(effective_date) from menumaker.cacfp_rates
    where effective_date <= (select m_start from bounds)
  )
),
meal_rev as (
  select coalesce(sum(ml.cnt * r.rate),0) as meal_reimb
  from meal_long ml
  join rates r on r.slot = ml.slot
   and r.category = case ml.eff when 'F' then 'free' when 'R' then 'reduced' else 'paid' end
),
cil_calc as (
  select (t.lunch + t.supper) *
         coalesce((select rate from rates where slot='lunch' and category='cil'),0) as cil_reimb
  from tot t
),
by_class as (
  select classroom,
         sum(b) sb, sum(a) sa, sum(l) sl, sum(p) sp, sum(s) ss, sum(e) se,
         count(distinct dt) filter (where (b+a+l+p+s+e) > 0) as opdays
  from unpiv group by classroom
),
ada_class as (
  select ceil(greatest(sb,sa,sl,sp,ss,se)::numeric / nullif(opdays,0)) as ada_c, opdays
  from by_class
),
ada_tot as (
  select coalesce(sum(ada_c),0)::int as ada, coalesce(max(opdays),0) as days_op
  from ada_class
),
eaters as (
  select distinct on (u.child_name) u.child_name, coalesce(c.eff,'P') eff
  from unpiv u
  left join catmap c on c.child_name = u.child_name
  where (u.b+u.a+u.l+u.p+u.s+u.e) > 0
  order by u.child_name
),
cat_counts as (
  select count(*) filter (where eff='F') as free,
         count(*) filter (where eff='R') as reduced,
         count(*) filter (where eff='P') as paid,
         count(*) as total_enrolled
  from eaters
),
lic as (
  select capacity from menumaker.center_licenses
  where center_id = p_center_id and license_type='child_care' and is_current
  order by issued_date desc nulls last limit 1
)
select jsonb_build_object(
  'center_id', p_center_id,
  'claim_month', to_char((select m_start from bounds), 'YYYY-MM'),
  'attendance', jsonb_build_object(
     'days_of_operation', (select days_op from ada_tot),
     'ada',               (select ada from ada_tot),
     'total_attendance',  (select ada * days_op from ada_tot),
     'number_of_shifts',  1
  ),
  'categories', jsonb_build_object(
     'free', cc.free, 'reduced', cc.reduced, 'paid', cc.paid,
     'total_enrolled', cc.total_enrolled,
     'free_pct',    round(100.0*cc.free   /nullif(cc.total_enrolled,0),2),
     'reduced_pct', round(100.0*cc.reduced/nullif(cc.total_enrolled,0),2),
     'paid_pct',    round(100.0*cc.paid   /nullif(cc.total_enrolled,0),2),
     'free_reduced_count', cc.free+cc.reduced,
     'free_reduced_eligibility_pct', round(100.0*(cc.free+cc.reduced)/nullif(cc.total_enrolled,0),4),
     'license_capacity', (select capacity from lic)
  ),
  'meals', jsonb_build_object(
     'breakfast', t.breakfast, 'am_snack', t.am_snack, 'lunch', t.lunch,
     'pm_snack', t.pm_snack, 'supper', t.supper, 'evening_snack', t.evening_snack,
     'total_reimbursable', t.breakfast+t.am_snack+t.lunch+t.pm_snack+t.supper+t.evening_snack
  ),
  'meals_by_category', (
     select jsonb_object_agg(slot, cats) from (
       select slot,
         jsonb_build_object(
           'free',    coalesce(sum(cnt) filter (where eff='F'),0),
           'reduced', coalesce(sum(cnt) filter (where eff='R'),0),
           'paid',    coalesce(sum(cnt) filter (where eff='P'),0),
           'total',   coalesce(sum(cnt),0)
         ) cats
       from meal_long group by slot
     ) q
  ),
  'reimbursement', jsonb_build_object(
     'meal_reimbursement', round((select meal_reimb from meal_rev),2),
     'cil_reimbursement',  round((select cil_reimb from cil_calc),2),
     'total',              round((select meal_reimb from meal_rev)+(select cil_reimb from cil_calc),2)
  )
)
from tot t, cat_counts cc;
$function$;
