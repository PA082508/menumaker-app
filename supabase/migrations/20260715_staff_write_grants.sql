-- ============================================================================
-- 20260715_staff_write_grants.sql   — PART A of the "staff-rights + photo" package
-- ----------------------------------------------------------------------------
-- WHY: StaffSettingsPage edits a staff row directly (UPDATE) and upserts that
-- employee's weekly schedule from the same Save. The owner toggled a Ridge
-- employee Inactive, saw "Saved ✓", and after logout/login the toggle was back
-- to Active; class transfers never stuck either. The whole UPDATE affected 0
-- rows. The payload was correct (is_active + class_primary/secondary all sent),
-- so the write was being refused at the table-privilege / policy layer, not the
-- app layer. The client already carries the SELECT fix (commit 463f0a4) so this
-- refusal is now surfaced instead of hidden — this migration grants the missing
-- privilege so the save actually lands.
--
-- SAFETY — READ BEFORE APPLYING (run these two read-only checks first):
--   1) select relname, relrowsecurity from pg_class
--        where relnamespace = 'menumaker'::regnamespace
--          and relname in ('staff','staff_schedules');
--      -> relrowsecurity MUST be true for BOTH. A GRANT UPDATE to `authenticated`
--         on a table WITHOUT row-level security would let ANY signed-in user edit
--         ANY center's staff. If RLS is off, STOP and enable RLS + a director/org
--         policy first — do not apply the grants alone.
--   2) select policyname, cmd, roles, qual, with_check
--        from pg_policies where schemaname = 'menumaker'
--          and tablename in ('staff','staff_schedules');
--      -> confirm a director/org-scoped policy covers UPDATE (and INSERT for
--         staff_schedules). If a correct policy exists, these grants are the whole
--         fix. If NO write policy exists, the silent-0-row cause is the POLICY,
--         not the grant — add the policy in this same migration before applying.
--
-- This file is INTENTIONALLY grants-only and idempotent. It does NOT enable RLS
-- or create policies blind, because the base `staff` table and its policies were
-- created outside this repo's migrations and cannot be read statically here.
-- ============================================================================

-- staff: the settings page issues UPDATE only. Add Staff goes through the
-- onboarding packet / enrollment_submissions, never a direct client INSERT, and
-- the UI has no staff-delete. So: SELECT + UPDATE only — no INSERT, no DELETE.
grant select, update on menumaker.staff to authenticated;

-- staff_schedules: the same Save upserts rows (INSERT on first save, UPDATE on
-- re-save via onConflict staff_id,day_of_week,effective_from). No delete in UI.
grant select, insert, update on menumaker.staff_schedules to authenticated;

-- NOTE: grants alone take effect only if RLS policies already admit the write.
-- Proof is the read-back scenario in the package doc: change status/class → Save
-- → logout/login → new value, no red banner, plus a SELECT.
