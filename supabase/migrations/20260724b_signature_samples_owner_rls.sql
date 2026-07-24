-- 20260724b — signature_samples: owner-scoped RLS (Phase 0 security fix)
--
-- WHY. The original policies (20260722) enforced only tenant + coarse role:
--     core.is_org_member(org_id) AND get_user_role() ∈ {director,office_manager,admin}
-- No clause referenced the owner. Consequence: any director/office_manager/admin
-- in the org could SELECT the raw signature_image of EVERY sample — including the
-- General Director's `sponsor` counter-signature stamp and every other director's
-- `director` stamp — and WITH CHECK (true) let them INSERT a sample under someone
-- else's owner_auth_id. That is exactly the authority-signature forgery the shelves
-- were meant to prevent; the shelves stopped accidental client fallback, not a
-- deliberate cross-read. This migration binds the login-backed shelves to the owner.
--
-- OWNER MODEL (unchanged): director/sponsor own via owner_auth_id (= auth.uid, a login);
-- parent owns via owner_guardian_id, staff via owner_staff_id (neither has a login).
--
-- SERVICE PATHS kept, by minimum:
--   1. Owner self-service on the login shelves (director/sponsor): read+write ONLY
--      your own row (owner_auth_id = auth.uid()). This is the only read the countersign
--      feature needs — loadSample/adoptSample always key to the logged-in reviewer.
--   2. On-behalf management of the no-login shelves (parent/staff) by center staff
--      (role ∈ {director,office_manager,admin}), org-fenced. These shelves have NO
--      in-app caller today (parents apply their sample through a SECURITY DEFINER RPC,
--      which bypasses RLS); the path is retained so a future staff-on-behalf flow is
--      not killed. The writer must stamp themselves (adopted_by = auth.uid()).
--   3. service_role (edge functions / backend snapshot rendering) bypasses RLS as
--      before — unchanged, and the only non-owner read of a login shelf that exists.
-- No admin backdoor to the login shelves is granted.
--
-- Table is empty at apply time (0 rows) → no lockout, purely forward-looking.
-- DELETE stays ungranted: a sample is revoked (revoked_at), never deleted — it is
-- evidence of who signed with what. Forward-only.

alter table menumaker.signature_samples enable row level security;

drop policy if exists auth_manage   on menumaker.signature_samples;
drop policy if exists org_isolation on menumaker.signature_samples;
drop policy if exists staff_only    on menumaker.signature_samples;
drop policy if exists owner_login       on menumaker.signature_samples;
drop policy if exists onbehalf_nonlogin on menumaker.signature_samples;

-- Tenant fence (retained): the row's org must be one the caller belongs to.
create policy org_isolation on menumaker.signature_samples
  as restrictive for all to authenticated
  using (core.is_org_member(org_id))
  with check (core.is_org_member(org_id));

-- Login shelves: only the owner (director / sponsor) may read or write their sample.
create policy owner_login on menumaker.signature_samples
  as permissive for all to authenticated
  using (
    scope = any (array['director','sponsor'])
    and owner_auth_id = auth.uid()
  )
  with check (
    scope = any (array['director','sponsor'])
    and owner_auth_id = auth.uid()
  );

-- No-login shelves: parent/staff samples have no auth.uid owner; center staff manage
-- them on behalf, org-fenced by org_isolation above, stamping themselves as adopter.
create policy onbehalf_nonlogin on menumaker.signature_samples
  as permissive for all to authenticated
  using (
    scope = any (array['parent','staff'])
    and menumaker.get_user_role() = any (array['director','office_manager','admin'])
  )
  with check (
    scope = any (array['parent','staff'])
    and menumaker.get_user_role() = any (array['director','office_manager','admin'])
    and adopted_by = auth.uid()
  );

-- Grants unchanged: authenticated keeps SELECT/INSERT/UPDATE, never DELETE; anon nothing.
grant select, insert, update on menumaker.signature_samples to authenticated;
revoke all on menumaker.signature_samples from anon;
