-- 20260716b_avatars_teacher_center_write.sql
--
-- ✅ APPLIED 2026-07-16 on Nikolay's go. Pre-flight, read-back and scope smoke all passed.
--
-- PRE-FLIGHT (actual — no rows needed adding):
--   playacademyusa+ridge.cook@gmail.com  → Play Academy Ridge            · is_active=t
--   playacademyusa+pearl.cook@gmail.com  → Play Academy Pearl            · is_active=t
--   playacademyusa+alpha.cook@gmail.com  → Play Academy Highland Heights · is_active=t
--   All three already held an ACTIVE core.user_center_access row for their own centre.
--
-- SCOPE SMOKE (executed sitting in the Ridge cook's seat via request.jwt.claims):
--   Ridge child photo  → ALLOWED
--   Ridge staff photo  → ALLOWED
--   PEARL child photo  → DENIED   ← the centre boundary actually holds
--   malformed path     → resolver returns NULL → denied (no cast error raised)
--
-- ⚠️ ACCEPTED MODEL LIMIT — recorded deliberately, decided with open eyes (Nikolay,
--    2026-07-16). Until a real identity layer exists, ANY person who walks up to a
--    centre's door device can change the photo of ANY child or ANY STAFF MEMBER of
--    that centre. The door login is a shared service account with a hardcoded
--    password; there is no `menumaker.staff.user_id`, so "their own avatar" cannot
--    be expressed and is NOT enforced here. The centre boundary is enforced; the
--    person boundary does not exist. Closing it is the identity pass (teacher PIN →
--    see docs/specs/identity-teacher-spec.md).
--
-- GOAL (order, Part 1c): "teacher write, scoped to their OWN centre — children of
-- their centre + their own avatar."
--
-- ─────────────────────────────────────────────────────────────────────────────
-- THE TRANSLATION PROBLEM — read this before approving
-- ─────────────────────────────────────────────────────────────────────────────
-- The order is written in terms of a `teacher` role. Verified against the live DB
-- on 2026-07-16, that role does not exist as an identity anyone logs in as:
--
--   core.memberships.role  →  cook 3 · director 3 · office_manager 1 · admin 1
--   menumaker.user_roles   →  cook 4 · director 4 · accountant 3 · admin 2 · office_manager 1
--   → ZERO teacher rows in either table.
--
-- The iPad teacher door (`/portal/teacher/<slug>`) logs in as a **shared per-centre
-- COOK service account** — PortalPage.tsx:30-34 maps `teacher: ['cook']`, and the
-- provisioning UI reserves/disables Teacher outright (MealCountAccessSettings.tsx:8).
--
-- So "teacher write" is implemented here as **cook write**. If a real `teacher` role
-- is ever introduced, this policy must be revisited — AND see the trap below.
--
-- ⚠️ TRAP — a real `teacher` role would break Attendance on day one.
--   menumaker.roster and menumaker.guardian each carry a **RESTRICTIVE** policy
--   `deny_teacher`:  NOT core.has_org_role(org_id, ARRAY['teacher'])
--   RESTRICTIVE means it ANDs with everything else. The moment a membership with
--   role='teacher' exists, that user loses ALL access to roster — read included —
--   and the Attendance module (Part 2) dies for them instantly. Whoever introduces a
--   teacher role must retire or narrow `deny_teacher` in the same migration.
--
-- ⚠️ "their own avatar" IS NOT EXPRESSIBLE TODAY. menumaker.staff has **no user_id
--   column** — there is no link from auth.uid() to a staff row. And the portal login
--   is a *shared* service account, so "self" isn't a person at all. Consequence: a
--   cook can write any STAFF avatar in their own centre, not merely their own. That
--   is the honest limit of the current identity model; narrowing it requires
--   staff.user_id + per-person logins, which is a separate decision.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHAT EXISTS TODAY (20260715b_avatars.sql, verified live)
-- ─────────────────────────────────────────────────────────────────────────────
--   avatars_read   : SELECT to authenticated  — bucket_id='avatars', NO centre/org check
--   avatars_insert : INSERT — role in (director, office_manager, admin), NO centre check
--   avatars_update : UPDATE — same three roles, NO centre check
--   (no DELETE policy at all — which is why the UI's "Remove photo" clears the
--    column rather than deleting the object; a delete would fail silently.)
--
-- This migration ADDS cook write, centre-scoped. It deliberately does NOT touch the
-- existing three-role policies: they are unscoped by centre, which is a pre-existing
-- single-org gap flagged in 20260715b's own FOLLOW-UP, and widening this migration to
-- fix that would put a live director flow at risk on a photo change. Separate decision.
--
-- ─────────────────────────────────────────────────────────────────────────────
begin;

-- Resolve which centre an avatar object belongs to, from its path.
-- Path convention (avatars.ts:56): '<entity>/<id>/avatar.webp', entity ∈ child|staff.
-- SECURITY DEFINER so the lookup is not itself filtered by roster/staff RLS.
create or replace function menumaker.avatar_object_center(p_name text)
returns uuid
language sql stable security definer set search_path to ''
as $function$
  with parts as (
    select (storage.foldername(p_name))[1] as entity,
           (storage.foldername(p_name))[2] as oid
  )
  select case
    -- Guard the cast: a malformed path must return NULL (→ deny), never raise.
    when (select oid from parts) !~ '^[0-9a-fA-F-]{36}$' then null
    when (select entity from parts) = 'child' then
      (select r.center_id from menumaker.roster r where r.id = (select oid from parts)::uuid)
    when (select entity from parts) = 'staff' then
      (select s.center_id from menumaker.staff s where s.id = (select oid from parts)::uuid)
    else null
  end
$function$;

revoke execute on function menumaker.avatar_object_center(text) from public, anon;
grant  execute on function menumaker.avatar_object_center(text) to authenticated;

-- Does the caller hold active access to that centre?
create or replace function menumaker.avatar_center_allowed(p_name text)
returns boolean
language sql stable security definer set search_path to ''
as $function$
  select exists (
    select 1
    from core.user_center_access uca
    where uca.user_id  = auth.uid()
      and uca.is_active
      and uca.center_id = menumaker.avatar_object_center(p_name)
      and menumaker.avatar_object_center(p_name) is not null
  )
$function$;

revoke execute on function menumaker.avatar_center_allowed(text) from public, anon;
grant  execute on function menumaker.avatar_center_allowed(text) to authenticated;

-- Cook (= the iPad teacher door) may write avatars ONLY inside their own centre.
-- Permissive policies OR together, so this widens without touching the director path.
create policy avatars_insert_cook on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and menumaker.get_user_role() = 'cook'
    and menumaker.avatar_center_allowed(name)
  );

create policy avatars_update_cook on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and menumaker.get_user_role() = 'cook'
    and menumaker.avatar_center_allowed(name)
  )
  with check (
    bucket_id = 'avatars'
    and menumaker.get_user_role() = 'cook'
    and menumaker.avatar_center_allowed(name)
  );

commit;

-- ─────────────────────────────────────────────────────────────────────────────
-- PRE-FLIGHT BEFORE APPLYING — the cook service accounts need centre access rows.
--   The policy keys on core.user_center_access (6 rows today). If a cook service
--   account has NO active row for its centre, this policy denies it and the camera
--   fails honestly with the red banner — the feature simply won't work for them.
--   CHECK FIRST:
--
--   select m.role, u.email, uca.center_id, uca.is_active
--   from core.memberships m
--   join auth.users u on u.id = m.user_id
--   left join core.user_center_access uca on uca.user_id = m.user_id
--   where m.role = 'cook';
--
-- READ-BACK (after apply):
--   select polname, case polpermissive when true then 'PERMISSIVE' else 'RESTRICTIVE' end,
--          polcmd, pg_get_expr(polwithcheck, polrelid)
--   from pg_policy where polrelid = 'storage.objects'::regclass and polname like '%avatar%';
--
-- SMOKE (must be run as a cook session, not as postgres — postgres bypasses RLS):
--   1. cook at Ridge photographs a Ridge child   → saves.
--   2. cook at Ridge photographs a Pearl child   → denied (red banner, nothing written).
--   3. director photographs anyone               → still saves (unchanged path).
--
-- ROLLBACK:
--   drop policy if exists avatars_insert_cook on storage.objects;
--   drop policy if exists avatars_update_cook on storage.objects;
--   drop function if exists menumaker.avatar_center_allowed(text);
--   drop function if exists menumaker.avatar_object_center(text);
