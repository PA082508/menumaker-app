-- 20260722e: income_determination_status() re-sourced onto the AUTHORITATIVE per-child
-- income_eligibility (roster_id), status='on_file' ONLY for a period-effective determination
-- (frp_expires null or >= current month start — same semantics as compute_monthly_claim.catmap
-- 20260722c). Expired / absent => no row => no chip (the director honestly sees packet
-- incompleteness, never the reason). Content-free (no F/R/P, no IEA-vs-waiver) and self-scoped
-- exactly as before (GD = org, director = own centers). GO Nikolay 2026-07-22 (Ф3). APPLIED.
--
-- WHY: the prior version read enrollment_submissions.child_id, which is ALWAYS NULL for IEA
-- (a household app covers many children; approveIea writes the per-child determination to
-- income_eligibility.roster_id, not to submission.child_id). So the chip could never render.
--
-- Read-back: fn reads income_eligibility · returns 'on_file' · no ie.eligibility leak ·
-- core period-effective count = 247 of 260 (13 expired-only + 52 undocumented → no row).
-- (A direct fn call via a service role returns 0 — self-scope needs a real JWT; expected.)
CREATE OR REPLACE FUNCTION menumaker.income_determination_status()
 RETURNS TABLE(child_id uuid, domain text, status text)
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select distinct ie.roster_id as child_id, 'income'::text as domain, 'on_file'::text as status
    from menumaker.income_eligibility ie
   where ie.roster_id is not null
     and (ie.frp_expires is null
          or ie.frp_expires >= date_trunc('month', current_date)::date)   -- period-effective only
     and ( menumaker.is_org_owner(ie.org_id)
           or ie.center_id = any (menumaker.my_center_ids()) )            -- self-scope preserved
$function$;
