-- 20260722d: back-fill roster.frp_expires from the AUTHORITATIVE income_eligibility
-- (P-default audit, hole #3(a)). GO Nikolay 2026-07-22. Data migration, tighten-only:
-- set roster.frp_expires to max(income_eligibility.frp_expires) per roster_id ONLY where
-- the roster mirror is NULL or LATER than the authoritative expiry — never extend/loosen.
-- This makes the current claim's own guard (compute_monthly_claim reads roster.frp_expires
-- until 20260722c) catch determinations that had already lapsed in income_eligibility.
--
-- APPLIED 2026-07-22 via execute_sql. Read-back (fact):
--   rows_backfilled = 234
--   over-claims (active F/R claiming while authoritative expired): 10 -> 0
--   active F/R still claiming: 186 -> 176 (exactly the 10 dropped)
--   newly-dropped-to-P: exactly 10 ; undocumented-52 untouched (no income_eligibility)
--
-- NOTE: the 52 active F/R with NO income_eligibility are unaffected here (max is NULL) —
-- they are handled by 20260722c (absent -> P) and exported for the IEA renewal campaign
-- (docs/exports/iea-renewal-52-undocumented-frp-2026-07-22.csv).

update menumaker.roster ro
set frp_expires = a.max_exp
from (select roster_id, max(frp_expires) max_exp
      from menumaker.income_eligibility group by roster_id) a
where a.roster_id = ro.id
  and ro.frp in ('F','R')
  and a.max_exp is not null
  and (ro.frp_expires is null or ro.frp_expires > a.max_exp);   -- tighten-only, never extend
