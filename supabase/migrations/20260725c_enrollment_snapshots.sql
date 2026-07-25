-- 20260725c_enrollment_snapshots.sql — Step 3 Item 1: private bucket + pinning table for the
-- frozen "approved original form" snapshot. APPLIED to prod 2026-07-25 (Nikolay GO, live-DB
-- protocol). Read-back green: bucket public=false · table 12 cols · RLS on · snap_staff_read ·
-- storage enrollment_snapshots_read.
--
-- WHY. Step 3 closes EnrollPulse: at Approve we freeze a client-side, same-origin snapshot of
-- the recognizable government-form replica (with the parent signature + director countersign in
-- place). Display and print of an APPROVED form come FROM the snapshot (fallback = live render).
-- This table PINS each snapshot: form type + replica edition + submission_id + content sha,
-- linked to the sealed submission's content_hash. The sealed submission row is NOT touched.
--
-- PATTERN. Mirrors 20260704_enrollment_scans_bucket: private bucket, authenticated staff SELECT,
-- writes only via the enrollment-snapshot edge function's service-role client (no insert/update/
-- delete policy). Snapshot metadata table is append-only for the app (SELECT-only policy).

-- 1. Private bucket (never public; staff mint short-lived signed URLs).
insert into storage.buckets (id, name, public)
values ('enrollment-snapshots','enrollment-snapshots', false)
on conflict (id) do nothing;

-- 2. Read policy: authenticated staff (Inbox/Documents are staff-only surfaces; org isolation is
--    enforced on the metadata row). NO insert/update/delete → writes only via the edge function.
drop policy if exists enrollment_snapshots_read on storage.objects;
create policy enrollment_snapshots_read on storage.objects
  for select to authenticated using (bucket_id = 'enrollment-snapshots');

-- 3. Pinning / metadata table (append-only; a re-snapshot is a new row).
create table if not exists menumaker.enrollment_snapshots (
  id            uuid primary key default gen_random_uuid(),
  submission_id uuid not null references menumaker.enrollment_submissions(id),
  org_id        uuid not null references core.organizations(id),
  center_id     uuid not null references menumaker.centers(id),
  form_type     text not null,               -- submission_type
  replica_edition text not null,             -- originalFormReplicas version, e.g. 'v7'
  storage_path  text not null,               -- {center_id}/{submission_id}/page-N.png (bucket-relative)
  page_count    int  not null default 1,
  content_sha   text not null,               -- sha-256 of the snapshot PNG bytes
  submission_content_hash text,              -- links to the sealed submission's content_hash
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now()
);
create index if not exists enrollment_snapshots_submission_idx
  on menumaker.enrollment_snapshots (submission_id);

alter table menumaker.enrollment_snapshots enable row level security;
drop policy if exists snap_staff_read on menumaker.enrollment_snapshots;
create policy snap_staff_read on menumaker.enrollment_snapshots
  as permissive for select to authenticated
  using (core.is_org_member(org_id)
         and menumaker.get_user_role() = any(array['director','office_manager','admin']));
-- writes: service_role only (edge function); no authenticated insert/update/delete → append-only.

-- ── READ-BACK (applied 2026-07-25) ──────────────────────────────────────────
-- bucket: [{"id":"enrollment-snapshots","public":false}] · snap_table_cols=12 ·
-- snap_rls_enabled=true · snap_policies=[snap_staff_read] · storage=[enrollment_snapshots_read]
