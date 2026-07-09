-- Grant table privileges to `authenticated` on the staff-signing tables.
--
-- Root cause of "permission denied for table" during the JD/BYOD onboarding smoke:
-- the menumaker default ACL grants only service_role, so tables reached DIRECTLY via
-- PostgREST (supabase-js as the authenticated role) need an EXPLICIT grant. Working
-- tables (roster, enrollment_submissions, meal_count_settings, safepass_devices…)
-- already have it; the staff-JD tables were created without it →
--   - staff_agreement_signatures: insert (onboarding capture) denied
--   - policy_documents: select (fetchActiveJdBody reads the JD body) denied
--
-- RLS still governs WHICH rows: staff_agreement_signatures.staff_only restricts to
-- director/office_manager/admin; policy_documents.read_policies is `using (true)`.
-- Grants gate table access; RLS gates rows — both are needed.
--
-- NOTE: byod_signatures is intentionally NOT granted here — onboarding BYOD is being
-- re-routed to staff_agreement_signatures (staging, symmetric with JD). The legacy
-- self-service BYOD modal (byod_signatures) is out of scope and unchanged; if it is
-- ever used in-app it will need its own grant (flagged, separate decision).
--
-- Applied to project menumaker (trrmyqfpxntmgxnqkikp) 2026-07-09.

grant select, insert, update on menumaker.staff_agreement_signatures to authenticated;
grant select on menumaker.policy_documents to authenticated;
