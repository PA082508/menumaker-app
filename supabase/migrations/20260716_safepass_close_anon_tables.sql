-- 20260716_safepass_close_anon_tables.sql
--
-- ✅ APPLIED 2026-07-16 on Nikolay's go. Read-back + anon smoke below both passed.
--
-- READ-BACK (actual):
--   safepass_sms_otp         rls_on=t · policies=0 · anon/auth grants: none
--   safepass_parent_sessions rls_on=t · policies=0 · anon/auth grants: none
--   safepass_sessions        UNTOUCHED — rls_on=t · policies=2 · anon:SELECT
--   safepass_trusted_persons UNTOUCHED — rls_on=t · policies=4 · anon:SELECT
--
-- ANON SMOKE (executed from anon's own seat, not inferred from grants):
--   read safepass_trusted_persons  → OK   (live parent app still works)
--   read safepass_sessions         → OK   (live parent app still works)
--   read safepass_sms_otp          → DENIED
--   read safepass_parent_sessions  → DENIED
--
-- WHAT THIS CLOSES
-- ────────────────
-- Two SafePass tables were created out-of-band (never through a repo migration) and
-- carry FULL anon table grants with RLS off and zero policies:
--
--   menumaker.safepass_sms_otp
--     (id, org_id, phone, otp_code, device_id, expires_at, used_at, attempts, created_at)
--     RLS: off · policies: 0 · rows: 2
--     anon: SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
--     → anon can read `otp_code` for any `phone`. This is the whole authentication
--       secret of the parent app sitting behind the public anon key.
--
--   menumaker.safepass_parent_sessions
--     (id, org_id, phone, device_id, person_name, verified_at, expires_at, last_used_at, is_active)
--     RLS: off · policies: 0 · rows: 0
--     anon: SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
--     → anon can mint itself a verified, non-expiring parent session for any phone.
--
-- PRE-FLIGHT — what was actually verified (2026-07-16, live DB + full repo grep)
-- ─────────────────────────────────────────────────────────────────────────────
--   1. Zero code references. Neither table is touched by any .from() or .rpc() in
--      src/, public/, or the storefront. The only mention in the whole tree is the
--      comment in 20260715_staff_write_grants.sql:96-97.
--   2. Zero RPC references. No function in schema `menumaker` (prokind='f') mentions
--      either table in its body.
--   3. Not used by any view (pg_depend/pg_rewrite: 0 dependents each). Both are
--      relkind='r' — real tables, not views.
--   4. => Nothing today reads or writes them. There is no live exploit path, and
--      closing them cannot break a running flow. They are loaded guns, not open wounds:
--      the moment the parent app is wired to them, the bypass ships with it.
--
--   CORRECTION to 20260715_staff_write_grants.sql:96-97, which claimed these tables have
--   "no anon/auth grants, so closed via the API". That is FALSE for both — they carry
--   the full anon grant set. That comment should not be trusted as a security record.
--
-- NAMING HAZARD (checked, and it is why this migration touches neither)
-- ────────────────────────────────────────────────────────────────────
--   `safepass_parent_sessions` is NOT `safepass_sessions`. The live parent app uses
--   `safepass_sessions` (RLS on, 2 policies, anon:SELECT only) and
--   `safepass_trusted_persons` (RLS on, 4 policies, anon:SELECT, 4 rows) directly as
--   anon from SafePassParentPage.tsx. Those are deliberately NOT touched here —
--   revoking the look-alike would have broken the live parent entry. Separate decision.
--
-- APPROACH
-- ────────
--   Full close, per the safepass_devices precedent (20260706_safepass_device_kiosk.sql:13-14):
--   "Access is via token-gated SECURITY DEFINER RPCs ONLY — anon gets NO table grant
--   and NO RLS policy."
--
--   Since nothing consumes these tables yet, we close them completely rather than
--   guessing at a policy shape. No anon grant, no policy. RLS on as defence-in-depth
--   so a future stray grant still fails closed. service_role bypasses RLS, so any
--   future server-side/RPC writer keeps working. When the parent PWA is actually
--   built on these, it gets SECURITY DEFINER RPCs, exactly like the kiosk.
--
--   An OTP table must never be readable by the role that is trying to authenticate.

begin;

-- ── safepass_sms_otp ────────────────────────────────────────────────────────────
revoke all on menumaker.safepass_sms_otp from anon;
revoke all on menumaker.safepass_sms_otp from authenticated;

alter table menumaker.safepass_sms_otp enable row level security;
-- No policies on purpose: no role reaches this table directly. An OTP secret is
-- verified server-side (SECURITY DEFINER / edge function) or not at all.

-- ── safepass_parent_sessions ────────────────────────────────────────────────────
revoke all on menumaker.safepass_parent_sessions from anon;
revoke all on menumaker.safepass_parent_sessions from authenticated;

alter table menumaker.safepass_parent_sessions enable row level security;
-- No policies on purpose: minting a parent session is a server-side act.

commit;

-- ── READ-BACK (run after apply; expected: rls_on=t, policies=0, grants=null) ─────
-- select c.relname, c.relrowsecurity as rls_on,
--        (select count(*) from pg_policy p where p.polrelid=c.oid) as policies,
--        (select string_agg(distinct g.grantee||':'||g.privilege_type, ', ')
--           from information_schema.role_table_grants g
--          where g.table_schema='menumaker' and g.table_name=c.relname
--            and g.grantee in ('anon','authenticated')) as grants
-- from pg_class c join pg_namespace n on n.oid=c.relnamespace
-- where n.nspname='menumaker'
--   and c.relname in ('safepass_sms_otp','safepass_parent_sessions');
--
-- ── ROLLBACK (only if something unexpectedly depended on these) ──────────────────
-- alter table menumaker.safepass_sms_otp         disable row level security;
-- alter table menumaker.safepass_parent_sessions disable row level security;
-- grant select, insert, update, delete on menumaker.safepass_sms_otp         to anon;
-- grant select, insert, update, delete on menumaker.safepass_parent_sessions to anon;
