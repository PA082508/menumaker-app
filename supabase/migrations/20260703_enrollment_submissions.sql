-- Enrollment Approval Loop — foundation (Enrollment_Approval_Loop_Spec.md §0).
--
-- Consolidates enrollment intake onto the menumaker project. Parents (or the
-- office, for photographed paper forms) submit enrollment packet forms; each
-- submission lands here as status='pending' and nothing touches roster/families
-- until a director Approves it in the future Inbox (Phase 1).
--
-- Schema carried over from childcare-core (id, child_id nullable, center_id,
-- submission_type, form_data, signatures, signature_date, status, created_at)
-- plus the spec's new fields: validation, reviewed_by/at, reject_reason,
-- source, paper_signed_at/by. No data backfill — source is empty (confirmed).
--
-- Public form access is via the SECURITY DEFINER RPC submit_enrollment_form
-- ONLY — anon has no table grant and no RLS pass (lesson from safepass_sign).
--
-- This is FOUNDATION ONLY: the packet forms are NOT switched to this endpoint
-- here; the architect ships new form versions pointing at the RPC.
--
-- Applied to project menumaker (trrmyqfpxntmgxnqkikp) 2026-07-03.

create table if not exists menumaker.enrollment_submissions (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references core.organizations(id),
  center_id       uuid not null references menumaker.centers(id),
  -- null until a director matches the submission to an existing child at Approve;
  -- new-applicant submissions carry their placeholder (NEW-...) inside form_data.
  child_id        uuid references menumaker.roster(id),
  submission_type text not null,                       -- validated app-side via childFieldRegistry
  form_data       jsonb not null default '{}'::jsonb,
  signatures      jsonb not null default '{}'::jsonb,
  signature_date  date,
  status          text  not null default 'pending'
                        check (status in ('pending','approved','rejected')),
  -- validation-agent result: {errors:[], warnings:[], missing:[]}
  validation      jsonb not null default '{}'::jsonb,
  source          text  not null default 'online'
                        check (source in ('online','paper_entry')),
  reviewed_by     uuid  references auth.users(id),
  reviewed_at     timestamptz,
  reject_reason   text,
  -- "Paper signed & filed" checkbox at Approve time (paper flow, spec §1)
  paper_signed_at timestamptz,
  paper_signed_by uuid  references auth.users(id),
  created_at      timestamptz not null default now()
);

create index if not exists enrollment_submissions_center_status_idx
  on menumaker.enrollment_submissions (center_id, status);

alter table menumaker.enrollment_submissions enable row level security;

-- RLS mirrors menumaker.roster: one permissive base for authenticated, then
-- restrictive gates AND-ed on top. anon is intentionally excluded (RPC only).
create policy auth_manage on menumaker.enrollment_submissions
  as permissive for all to authenticated using (true) with check (true);

create policy org_isolation on menumaker.enrollment_submissions
  as restrictive for all to authenticated
  using (core.is_org_member(org_id)) with check (core.is_org_member(org_id));

create policy module_cacfp_active on menumaker.enrollment_submissions
  as restrictive for all to authenticated
  using (core.org_has_module('cacfp', org_id))
  with check (core.org_has_module('cacfp', org_id));

-- Enrollment Inbox is staff-only; teachers never see submissions.
create policy staff_only on menumaker.enrollment_submissions
  as restrictive for all to authenticated
  using (menumaker.get_user_role() = any (array['director','office_manager','admin']))
  with check (menumaker.get_user_role() = any (array['director','office_manager','admin']));

-- Public submit path. SECURITY DEFINER so the anon packet forms can insert a
-- pending submission without any direct table grant or RLS pass. Always lands
-- as status='pending', child_id null — approval/matching happens in the Inbox.
create or replace function menumaker.submit_enrollment_form(
  p_org            uuid,
  p_center         uuid,
  p_submission_type text,
  p_form_data      jsonb,
  p_signatures     jsonb default '{}'::jsonb,
  p_signature_date date  default null,
  p_source         text  default 'online'
) returns uuid
language plpgsql security definer set search_path = menumaker, public, core as $$
declare v_id uuid;
begin
  -- guard against cross-org injection: the center must belong to the org
  if not exists (
    select 1 from menumaker.centers c where c.id = p_center and c.org_id = p_org
  ) then
    raise exception 'center % does not belong to org %', p_center, p_org;
  end if;
  if coalesce(p_source, 'online') not in ('online','paper_entry') then
    raise exception 'invalid source %', p_source;
  end if;

  insert into menumaker.enrollment_submissions
    (org_id, center_id, submission_type, form_data, signatures, signature_date, status, source)
  values
    (p_org, p_center, p_submission_type,
     coalesce(p_form_data, '{}'::jsonb), coalesce(p_signatures, '{}'::jsonb),
     p_signature_date, 'pending', coalesce(p_source, 'online'))
  returning id into v_id;

  return v_id;
end $$;

grant execute on function
  menumaker.submit_enrollment_form(uuid, uuid, text, jsonb, jsonb, date, text)
  to anon, authenticated;
