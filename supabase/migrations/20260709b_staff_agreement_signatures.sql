-- Staff onboarding signature capture (staging) for JD acknowledgments + §6 BYOD.
-- SURFACE = IN-APP, signer variant (в): the NEW HIRE signs PERSONALLY in the
-- DIRECTOR's device/session on day one (like the parent kiosk signature). The new
-- hire needs NO login for onboarding. "Director signs on the employee's behalf" is
-- excluded forever — a signature is a personal act.
--
-- This is a STAGING store: rows land here at signing; at Approve→staff they are
-- carried into the safepass_agreements ledger (status → approved). The signer is
-- identified by person_name + person_role (+ center_id — onboarding is always at a
-- specific center). witnessed_by_auth_id = in WHOSE session it was signed (the
-- director / device operator), NOT the signer.
--
-- Applied to project menumaker (trrmyqfpxntmgxnqkikp) 2026-07-09.

create table menumaker.staff_agreement_signatures (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null default core.current_org() references core.organizations(id),
  center_id             uuid not null references menumaker.centers(id),      -- onboarding is center-specific
  person_name           text not null,                                       -- signer, from §1 staff form
  person_role           text not null,                                       -- §2 role
  policy_code           text not null,                                       -- JD key (e.g. Staff_JD_Director) or 'byod'
  document_version      text not null,                                       -- policy_documents.version signed
  ack_line              text not null,                                       -- audit snapshot of the confirmed wording
  signature_method      text not null check (signature_method in ('drawn','typed','adopted')),
  signature_image       text,                                                -- drawn PNG data URL (null for typed/adopted)
  witnessed_by_auth_id  uuid not null references auth.users(id),             -- session owner / device operator (NOT signer)
  status                text not null default 'pending_approve'
                          check (status in ('pending_approve','approved','cancelled')),
  signed_at             timestamptz not null default now(),
  created_at            timestamptz not null default now()
);

-- Approve→staff queue scans pending by center; person lookup on carry-over.
create index staff_agreement_signatures_pending_idx
  on menumaker.staff_agreement_signatures (org_id, center_id, status);
create index staff_agreement_signatures_person_idx
  on menumaker.staff_agreement_signatures (org_id, person_name, person_role);

-- No composite FK to policy_documents on purpose: policy_code='byod' has no
-- policy_documents row yet (BYOD text still lives in SignModal), and staging is a
-- pre-ledger capture. The app validates policy_code/version against staffJdRegistry.

alter table menumaker.staff_agreement_signatures enable row level security;

-- RLS mirrors safepass_devices: permissive base for authenticated, then restrictive
-- org + staff-role gates AND-ed on top. The new hire is unauthenticated — the row is
-- written inside the director's authenticated session (witnessed_by_auth_id).
create policy auth_manage on menumaker.staff_agreement_signatures
  as permissive for all to authenticated using (true) with check (true);

create policy org_isolation on menumaker.staff_agreement_signatures
  as restrictive for all to authenticated
  using (core.is_org_member(org_id)) with check (core.is_org_member(org_id));

create policy staff_only on menumaker.staff_agreement_signatures
  as restrictive for all to authenticated
  using (menumaker.get_user_role() = any (array['director','office_manager','admin']))
  with check (menumaker.get_user_role() = any (array['director','office_manager','admin']));
