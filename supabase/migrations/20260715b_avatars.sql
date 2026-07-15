-- ============================================================================
-- 20260715b_avatars.sql   — PART B of the "staff-rights + photo" package
-- ----------------------------------------------------------------------------
-- Child / staff photos. A private Storage bucket served through short-lived
-- signed URLs; the row just stores the object PATH, never a public URL.
--
-- ORDER: apply this BEFORE deploying the Part B code. The roster/staff SELECTs
-- start requesting photo_url immediately on deploy, and a SELECT of a missing
-- column errors — so the column must exist first.
-- ============================================================================

-- 1. Path columns (store the Storage object path, e.g. 'staff/<uuid>/avatar.webp')
alter table menumaker.roster add column if not exists photo_url text;
alter table menumaker.staff  add column if not exists photo_url text;

-- 2. Private bucket. public=false → objects are ONLY reachable via a signed URL,
--    which is the security boundary for children's faces.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', false)
on conflict (id) do nothing;

-- 3. Storage RLS on storage.objects, scoped to bucket 'avatars'.
--    Path convention (enforced by the app): '<entity>/<id>/<file>.webp'
--      entity ∈ {staff, child}, id = staff.id | roster.id
--
--    READ (create signed URL): any authenticated user. Every signed-in account
--    is a Play Academy staff member (single org); the private bucket + ~1h TTL
--    is the boundary. FOLLOW-UP if this ever goes multi-org: derive org from the
--    <id> segment and gate on core.is_org_member(...).
--    WRITE: director / office_manager / admin only (self-service upload lives in
--    the settings pages, which those roles reach).
drop policy if exists avatars_read   on storage.objects;
drop policy if exists avatars_insert on storage.objects;
drop policy if exists avatars_update on storage.objects;

create policy avatars_read on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars');

create policy avatars_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and menumaker.get_user_role() = any (array['director','office_manager','admin'])
  );

create policy avatars_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and menumaker.get_user_role() = any (array['director','office_manager','admin'])
  )
  with check (
    bucket_id = 'avatars'
    and menumaker.get_user_role() = any (array['director','office_manager','admin'])
  );

-- roster.photo_url / staff.photo_url are written by the same UPDATE the settings
-- pages already issue, so they ride the Part A grants — no extra column grant.
