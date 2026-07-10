-- Seed 'byod' into policy_documents so onboarding BYOD reads its body from the
-- registry (fetchActiveJdBody) instead of the inline StaffJdOnboarding text —
-- symmetric with the JDs. Body is WITHOUT the $20/month stipend (removed from all
-- BYOD documents per Nikolay). Apply BEFORE the Staff flip so the first real hire
-- onboards from registry text. After apply: drop BYOD_BODY from StaffJdOnboarding
-- and let openDocSign fetch 'byod' like any JD.
--
-- ack line + fields are NOT in the body (SignModal renders them), same as the JDs.
--
-- PREPARED 2026-07-09 — awaiting Nikolay's go (prepare → go → apply).

insert into menumaker.policy_documents
  (org_id, key, version, title, body, status, effective_date, announced_at, activated_at)
values (
  '3a9a290e-7e49-491e-946b-ad86f2399910',
  'byod', 'v1',
  'BYOD Device Use Agreement (§6 Smartphone)',
  $body$**Play Academy Inc. BYOD Device Use Agreement**

**Art.1 Purpose.** Employee voluntarily uses personal device for SafePass and authorized apps. App works ONLY on registered authorized devices.

**Art.2 Obligations.** Keep device charged; enable screen lock; not share credentials; report loss immediately; allow app removal upon termination.

**Art.3 Company Limits.** Play Academy will NOT access personal content. Work data on Company servers only.

**Art.4 Confidentiality.** All child data is confidential. No disclosure to unauthorized persons.

**Art.5 Termination.** Either party may terminate. Employee: written notice. Company: immediately upon violation.

**Art.6 Governing Law.** Ohio law. Cuyahoga County courts.

**Art.7 Push Notifications.** Employee consents to receive work-related Push Notifications through the Play Academy app on their personal device. Notifications may include: CACFP meal count alerts, SafePass child handoff events, schedule reminders, and urgent messages from management. Employee may not disable work notifications during scheduled work hours.$body$,
  'active', current_date, now(), now()
)
on conflict (org_id, key, version) do nothing;
