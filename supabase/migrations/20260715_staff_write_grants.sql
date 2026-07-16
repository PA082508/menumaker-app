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
-- WHAT THE PRE-FLIGHT FOUND (read-only, 2026-07-15, project trrmyqfpxntmgxnqkikp).
-- The two tables were broken in DIFFERENT ways, so the fix is not symmetric:
--
--   staff             RLS = OFF. Policy `auth_manage` (ALL, authenticated,
--                     true/true) EXISTS but is inert while RLS is off. Grants
--                     today: anon SELECT, authenticated SELECT. So the table is
--                     wide open — the anon key reads every row, hourly_rate
--                     included, and a bare GRANT UPDATE here would have let any
--                     signed-in user write any center's staff.
--   staff_schedules   RLS = ON with ZERO policies = deny-all. Grants alone would
--                     not have made the upsert land; it needed a policy.
--
-- Hence this file now does three things per table instead of granting blind.
--
-- RE-RUN THESE TWO CHECKS BEFORE APPLYING (expected values as found above):
--   1) select relname, relrowsecurity from pg_class
--        where relnamespace = 'menumaker'::regnamespace
--          and relname in ('staff','staff_schedules');
--      -> EXPECT staff = false, staff_schedules = true.
--         If staff already reads true, someone enabled RLS after this was
--         written — re-read the policy list before trusting this file.
--   2) select policyname, cmd, roles, qual, with_check
--        from pg_policies where schemaname = 'menumaker'
--          and tablename in ('staff','staff_schedules');
--      -> EXPECT exactly one row: staff / auth_manage / ALL / {authenticated}.
--         EXPECT staff_schedules to return NOTHING.
--         If staff_schedules already has a policy, STOP — do not create a second
--         one blind; reconcile first.
--
-- SAFETY OF `ENABLE ROW LEVEL SECURITY` ON staff (checked, not assumed):
--   * The three SECURITY DEFINER functions that touch staff — get_org_staff_users,
--     safepass_confirm_handoff, safepass_set_staff_pin — are all owned by
--     `postgres`, which has rolbypassrls = true, and staff has
--     relforcerowsecurity = false. Enabling RLS therefore cannot break them.
--   * service_role also bypasses RLS, so edge functions / imports are unaffected.
--   * Turning RLS ON is what makes `auth_manage` bind. It also, by itself, ends
--     anon's read of this table (the policy is TO authenticated, so anon gets
--     deny-all). The REVOKE below is defence-in-depth, not the load-bearing part.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- menumaker.staff
-- ---------------------------------------------------------------------------

-- Bind the policy that already exists. Access becomes `authenticated`, matching
-- the rest of the schema. Idempotent: re-enabling an enabled table is a no-op.
alter table menumaker.staff enable row level security;

-- The settings page issues UPDATE only. Add Staff goes through the onboarding
-- packet / enrollment_submissions, never a direct client INSERT, and the UI has
-- no staff-delete. So: SELECT + UPDATE only — no INSERT, no DELETE.
grant select, update on menumaker.staff to authenticated;

-- Close the public read of hourly_rate & co. Verified against the code: the only
-- unauthenticated surfaces are /safepass/parent (SafePassParentPage) and the
-- device kiosk (src/lib/safepassDevice.ts), and both reach the DB exclusively
-- through SECURITY DEFINER RPCs — safepass_has_signed, safepass_sign,
-- safepass_device_context, safepass_device_sessions, safepass_confirm_handoff,
-- safepass_register_device. There is no `.from('staff')` on any anon path; all
-- eight direct staff reads in the app sit behind the authenticated layout.
revoke select on menumaker.staff from anon;

-- ---------------------------------------------------------------------------
-- menumaker.staff_schedules
-- ---------------------------------------------------------------------------

-- RLS is already ON here with no policy at all, which denies everything. Create
-- the schema's standard policy so the upsert is admitted.
drop policy if exists auth_manage on menumaker.staff_schedules;
create policy auth_manage on menumaker.staff_schedules
  for all to authenticated
  using (true) with check (true);

-- The same Save upserts rows (INSERT on first save, UPDATE on re-save via
-- onConflict staff_id,day_of_week,effective_from). No delete in UI.
grant select, insert, update on menumaker.staff_schedules to authenticated;

-- ============================================================================
-- NOT IN THIS PACKAGE — recorded so it is not lost:
--   * staff_schedules also carries a dangling `anon SELECT` grant. It is inert
--     today (RLS on, and the policy above is TO authenticated, so anon stays
--     deny-all), which is why it is not touched here — separate decision.
--   * RLS is likewise off on ohio_ratio_rules, safepass_parent_sessions,
--     safepass_sms_otp, safepass_transport_children (no anon/auth grants, so
--     closed via the API) and urgent_alerts (auth SELECT, no policies).
--     Separate decision — deliberately out of scope for this package.
--
--     ⚠️ CORRECTION (2026-07-16, verified against the live catalog):
--     the parenthetical above is WRONG for two of those tables.
--     safepass_parent_sessions and safepass_sms_otp each carried the FULL anon
--     grant set (SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER) with
--     RLS off — safepass_sms_otp holds an `otp_code` column, so the parent app's
--     whole authentication secret sat behind the public anon key. They were NOT
--     "closed via the API"; they were wide open and merely unused.
--     Closed by 20260716_safepass_close_anon_tables.sql (applied 2026-07-16).
--     ohio_ratio_rules / safepass_transport_children / urgent_alerts were checked
--     and do match the description.
--
--     HOW THE ERROR HAPPENED — worth more than the fix: this line was written
--     from a reading of what the tables were *meant* to be, not from a query of
--     what they *were*. A migration comment is not evidence. When a security
--     claim matters, read pg_class.relrowsecurity + information_schema
--     .role_table_grants at the moment you make the claim, and paste the result.
--
-- READ-BACK AFTER APPLYING: change status/class → Save → logout/login → new
-- value persists, no red banner. Plus re-run check (1): both tables true.
-- ============================================================================
