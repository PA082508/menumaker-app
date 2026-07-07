-- Background duplicate-child detector — EXACT arm (block 8 of refresh_action_items).
-- Approved 2026-07-07. Surfaces likely-duplicate ACTIVE roster records as action items
-- (category data_quality, severity high) so a director can reconcile via the recon table.
-- The detector only READS roster + WRITES action_items — never mutates roster/frp/eligibility.
-- fuzzystrmatch + unaccent are installed here so the FUZZY arm can be added in a follow-up
-- migration without another extension change. This migration ships the EXACT arm only
-- (exact normalized name; DOB equal or one null). Live baseline: 17 pairs, 1 center.

create extension if not exists fuzzystrmatch schema extensions;
create extension if not exists unaccent schema extensions;

-- SQL mirror of the JS normName (gate detector): lower + accent-strip + collapse whitespace.
create or replace function menumaker.norm_name(p text)
returns text
language sql
stable
as $$
  select lower(regexp_replace(trim(extensions.unaccent(coalesce(p,''))), '\s+', ' ', 'g'))
$$;

create or replace function menumaker.refresh_action_items(p_org_id uuid, p_as_of date default current_date)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'menumaker', 'core', 'public'
as $function$
declare
  v_filing int; v_pstart date; v_pend date;
  v_lic int := 0; v_clm int := 0; v_doc int := 0; v_iea int := 0;
  v_sub int := 0; v_appr int := 0; v_licnd int := 0; v_dup int := 0;
  rec record; v_label text; v_month_end date; v_deadline date; v_sev text; v_cm date; v_submitted boolean; v_title text;
begin
  if auth.uid() is not null and not core.is_org_member(p_org_id) then
    raise exception 'not a member of org %', p_org_id using errcode = '42501';
  end if;

  select (value #>> '{}')::int into v_filing from menumaker.app_settings
   where key='claim_filing_window_days' and (org_id=p_org_id or org_id is null)
   order by (org_id is null) limit 1;
  v_filing := coalesce(v_filing, 60);

  -- ===== 1) LICENSES (with date) =====
  update menumaker.action_items set status='resolved', resolved_at=now(), updated_at=now()
   where org_id=p_org_id and source='license_scan' and status='open';
  for rec in
    select cl.id, cl.license_type, cl.expires_date, cl.issuing_authority, c.name center_name
    from menumaker.center_licenses cl left join menumaker.centers c on c.id=cl.center_id
    where cl.org_id=p_org_id and cl.expires_date is not null
  loop
    v_label := case rec.license_type
      when 'food_service' then 'Food service license'
      when 'child_care' then 'Child care license'
      else initcap(replace(rec.license_type,'_',' ')) end;
    if rec.expires_date < p_as_of then
      perform menumaker.raise_action_item(p_org_id,'license','urgent',
        v_label||' expired — '||coalesce(rec.center_name,'?'),
        'Expired '||to_char(rec.expires_date,'MM/DD/YYYY')||'. '||coalesce(rec.issuing_authority,'')||'. Renewal required.',
        'license_scan','center_licenses',rec.id,'license:'||rec.id||':expiry',rec.expires_date);
      v_lic := v_lic+1;
    elsif rec.expires_date <= p_as_of + 60 then
      perform menumaker.raise_action_item(p_org_id,'license','high',
        v_label||' expiring soon — '||coalesce(rec.center_name,'?'),
        'Expires '||to_char(rec.expires_date,'MM/DD/YYYY')||'. '||coalesce(rec.issuing_authority,'')||'.',
        'license_scan','center_licenses',rec.id,'license:'||rec.id||':expiry',rec.expires_date);
      v_lic := v_lic+1;
    end if;
  end loop;

  -- ===== 2) CLAIM FILING DEADLINES =====
  update menumaker.action_items set status='resolved', resolved_at=now(), updated_at=now()
   where org_id=p_org_id and source='claim_deadline_scan' and status='open';
  for rec in
    select mwr.center_id, c.name center_name,
           coalesce(mwr.period_month, date_trunc('month',mwr.monday_date)::date) cm
    from menumaker.meal_week_records mwr left join menumaker.centers c on c.id=mwr.center_id
    where mwr.org_id=p_org_id and coalesce(mwr.period_month, mwr.monday_date) is not null
    group by 1,2,3
  loop
    v_cm := rec.cm;
    if v_cm >= date_trunc('month',p_as_of)::date then continue; end if;
    v_month_end := (v_cm + interval '1 month - 1 day')::date;
    v_deadline  := v_month_end + v_filing;
    select exists(select 1 from menumaker.monthly_claims mc
       where mc.center_id=rec.center_id and mc.claim_year=extract(year from v_cm)::int
         and mc.claim_month=extract(month from v_cm)::int and mc.submitted_at is not null)
      into v_submitted;
    if v_submitted then continue; end if;
    if p_as_of > v_deadline then v_sev := 'urgent';
    elsif v_deadline - p_as_of <= 14 then v_sev := 'high';
    else v_sev := 'normal'; end if;
    perform menumaker.raise_action_item(p_org_id,'claim',v_sev,
      'CACFP claim not filed — '||to_char(v_cm,'MM/YYYY')||' ('||coalesce(rec.center_name,'?')||')',
      'Filing due by '||to_char(v_deadline,'MM/DD/YYYY')||' ('||v_filing||' days after month end).',
      'claim_deadline_scan','monthly_claims',null,
      'claim:'||rec.center_id||':'||to_char(v_cm,'YYYY-MM'),v_deadline);
    v_clm := v_clm+1;
  end loop;

  -- ===== 3) MISSING REQUIRED DOCUMENTS =====
  update menumaker.action_items set status='resolved', resolved_at=now(), updated_at=now()
   where org_id=p_org_id and source='document_scan' and status='open';
  v_pstart := date_trunc('month',(p_as_of - interval '1 month'))::date;
  v_pend   := (date_trunc('month',p_as_of)::date - 1);
  for rec in
    select coalesce(scope,'sponsor') scope, count(*) n, string_agg(name, ', ' order by name) names
    from menumaker.claim_packet_manifest(p_org_id, null, v_pstart, v_pend)
    where required and not present
    group by 1
  loop
    perform menumaker.raise_action_item(p_org_id,'document','high',
      'Required documents not uploaded: '||rec.n||' ('||rec.scope||')',
      'Missing from registry ('||rec.scope||'): '||rec.names,
      'document_scan','documents',null,'doc:scope:'||rec.scope,null);
    v_doc := v_doc+1;
  end loop;

  -- ===== 4) IEA / FRP ELIGIBILITY =====
  update menumaker.action_items set status='resolved', resolved_at=now(), updated_at=now()
   where org_id=p_org_id and source='eligibility_scan' and status='open';
  for rec in
    select r.center_id, ct.name center_name,
      case when r.frp_expires is null then 'missing'
           when r.frp_expires < p_as_of then 'expired'
           else 'soon' end as st,
      count(*) n, string_agg(r.child_name, ', ' order by r.child_name) names
    from menumaker.roster r left join menumaker.centers ct on ct.id=r.center_id
    where r.org_id=p_org_id and r.frp in ('F','R') and coalesce(r.is_active,true)
      and (r.frp_expires is null or r.frp_expires <= p_as_of + 30)
    group by 1,2,3
  loop
    v_sev := case rec.st when 'expired' then 'urgent' else 'high' end;
    v_title := case rec.st
      when 'expired' then 'IEA expired (Free/Reduced): '||rec.n||' ('||coalesce(rec.center_name,'?')||')'
      when 'soon'    then 'IEA expiring in 30 days or less (Free/Reduced): '||rec.n||' ('||coalesce(rec.center_name,'?')||')'
      else 'No valid IEA date (Free/Reduced): '||rec.n||' ('||coalesce(rec.center_name,'?')||')' end;
    perform menumaker.raise_action_item(p_org_id,'eligibility',v_sev, v_title,
      'Without a valid IEA the child is claimed as Paid (lost reimbursement + audit risk). Children: '||rec.names,
      'eligibility_scan','roster',null,'iea:'||rec.center_id||':'||rec.st,null);
    v_iea := v_iea+1;
  end loop;

  -- ===== 5) MILK SUBSTITUTION WITHOUT MEDICAL FORM =====
  update menumaker.action_items set status='resolved', resolved_at=now(), updated_at=now()
   where org_id=p_org_id and source='substitution_scan' and status='open';
  for rec in
    select r.center_id, ct.name center_name, count(*) n,
           string_agg(r.child_name, ', ' order by r.child_name) names
    from menumaker.roster r left join menumaker.centers ct on ct.id=r.center_id
    where r.org_id=p_org_id and coalesce(r.is_active,true)
      and coalesce(r.substitute_milk,'')<>'' and r.substitution_form_id is null
    group by 1,2
  loop
    perform menumaker.raise_action_item(p_org_id,'data_quality','high',
      'Milk substitution without medical form: '||rec.n||' ('||coalesce(rec.center_name,'?')||')',
      'A fluid-milk substitution requires a medical statement/form on file, otherwise the portion may be non-reimbursable. Children: '||rec.names,
      'substitution_scan','roster',null,'milksub:'||rec.center_id,null);
    v_sub := v_sub+1;
  end loop;

  -- ===== 6) WEEKS WITHOUT DIRECTOR SIGNATURE (90 days) =====
  update menumaker.action_items set status='resolved', resolved_at=now(), updated_at=now()
   where org_id=p_org_id and source='approval_scan' and status='open';
  for rec in
    select mwr.center_id, ct.name center_name, count(distinct mwr.monday_date) n
    from menumaker.meal_week_records mwr left join menumaker.centers ct on ct.id=mwr.center_id
    where mwr.org_id=p_org_id
      and mwr.monday_date >= p_as_of - 90
      and mwr.friday_date < p_as_of
      and coalesce(mwr.director_initials,'')=''
      and lower(coalesce(mwr.classroom,'')) <> 'staff'
    group by 1,2
  loop
    perform menumaker.raise_action_item(p_org_id,'claim','high',
      'Weeks without director signature: '||rec.n||' ('||coalesce(rec.center_name,'?')||')',
      'Completed weeks are awaiting director review and signature before the claim is filed.',
      'approval_scan','meal_week_records',null,'approval:'||rec.center_id,null);
    v_appr := v_appr+1;
  end loop;

  -- ===== 7) LICENSE WITHOUT EXPIRY DATE =====
  update menumaker.action_items set status='resolved', resolved_at=now(), updated_at=now()
   where org_id=p_org_id and source='license_nodate_scan' and status='open';
  for rec in
    select cl.id, cl.license_type, c.name center_name
    from menumaker.center_licenses cl left join menumaker.centers c on c.id=cl.center_id
    where cl.org_id=p_org_id and cl.expires_date is null
  loop
    v_label := case rec.license_type
      when 'food_service' then 'Food service license'
      when 'child_care' then 'Child care license'
      else initcap(replace(rec.license_type,'_',' ')) end;
    perform menumaker.raise_action_item(p_org_id,'data_quality','normal',
      v_label||' — no expiry date — '||coalesce(rec.center_name,'?'),
      'No license expiry date on file. Add a date to track renewals.',
      'license_nodate_scan','center_licenses',rec.id,'licnodate:'||rec.id,null);
    v_licnd := v_licnd+1;
  end loop;

  -- ===== 8) DUPLICATE ROSTER CHILDREN (exact name; fuzzy arm added separately) =====
  update menumaker.action_items set status='resolved', resolved_at=now(), updated_at=now()
   where org_id=p_org_id and source='duplicate_scan' and status='open';
  for rec in
    with active as (
      select r.id, r.center_id, r.child_name, r.birthday,
             menumaker.norm_name(r.child_name) as nn
      from menumaker.roster r
      where r.org_id=p_org_id and coalesce(r.is_active,true)
        and (r.date_out is null or r.date_out >= p_as_of)
    ),
    pairs as (
      select a.center_id, a.id id_lo, b.id id_hi,
             a.child_name name_a, b.child_name name_b,
             a.birthday dob_a, b.birthday dob_b
      from active a
      join active b on a.center_id=b.center_id and a.id < b.id
      where coalesce(a.nn,'') <> '' and a.nn = b.nn
        -- exact name: DOBs equal, or one null (classic skeleton vs full record)
        and (a.birthday is null or b.birthday is null or a.birthday = b.birthday)
    )
    select p.*, ct.name center_name
    from pairs p left join menumaker.centers ct on ct.id = p.center_id
  loop
    perform menumaker.raise_action_item(
      p_org_id, 'data_quality', 'high',
      'Possible duplicate child: '||rec.name_a||' / '||rec.name_b||' ('||coalesce(rec.center_name,'?')||')',
      'Two active roster records look like the same child'||
        case when rec.dob_a is null or rec.dob_b is null
               then ' (one has no birthday — likely a skeleton record).'
             else ' (matching birthday '||to_char(coalesce(rec.dob_a,rec.dob_b),'MM/DD/YYYY')||').' end||
        ' Reconcile: keep one record, merge, and repoint eligibility. Do not delete without review.',
      'duplicate_scan', 'roster', rec.id_hi,
      'dup:'||rec.center_id||':'||rec.id_lo||':'||rec.id_hi, null);
    v_dup := v_dup + 1;
  end loop;

  return jsonb_build_object('licenses',v_lic,'claims',v_clm,'documents',v_doc,'eligibility',v_iea,
                            'substitutions',v_sub,'approvals',v_appr,'licenses_no_date',v_licnd,
                            'duplicates',v_dup);
end $function$;
