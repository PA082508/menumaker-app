-- SafePass — scope the shared "door" role (kitchen/classroom service account) to
-- its center. deny_teacher FIX, pass (б). SEPARATE from (а) service-account marking.
--
-- THE BUG (measured 2026-07-16, [[menumaker-identity-teacher]]): the Ridge door sees
-- 621 roster rows org-wide and can UPDATE a Pearl child. Root cause: the door logs in
-- as a shared `cook` account; roster RLS was `org_isolation` (any org member) +
-- `deny_teacher` (blocks the `teacher` MEMBERSHIP only). No one holds a `teacher`
-- membership, so deny_teacher was dormant and nothing scoped the cook to its center.
--
-- ── CONVENTION (accepted 2026-07-18): a DOOR is a MEMBERSHIP role, not a manual mark.
--   Door roles = core.memberships.role in ('cook','teacher'). Identified by
--   core.has_org_role(org_id, ...), which is SECURITY DEFINER and reads memberships.
--   Measured today: +alpha.cook / +pearl.cook / +ridge.cook have membership 'cook';
--   playacademy2 has membership 'director' (its cook grant lives only in
--   menumaker.user_roles, NOT memberships) → NOT a door. So this scopes exactly the
--   three real doors and never the director — trap #1 (person+door hybrid) is closed
--   BY CONSTRUCTION, no step-0 marking needed.
--   ⚠️ A `cook`/`teacher` MEMBERSHIP must NOT be granted to a human without knowing it
--   carries door restrictions (center-scope + no insert/delete + guardian-deny). For a
--   real human cook that profile is also correct; for anyone who needs org-wide reach,
--   give them a director/office_manager/admin membership instead.
--
-- ── TRAP #2 (teacher-day), named and closed:
--   The old deny_teacher had NO UCA subquery — it was NOT core.has_org_role(...,
--   ['teacher']), and has_org_role is SECURITY DEFINER, so it never raises
--   `permission denied` when a real teacher membership lands. There was no crash-mine;
--   the old policy failed CLOSED (teacher → 0 roster = safe). What it lacked was the
--   spec'd behavior (scoped read + write-deny). This pass supplies it: `teacher` now
--   gets center-scoped READ and full WRITE-DENY, unified with `cook` (which also gets
--   scoped write for the photo path). The roster `deny_teacher` is REPLACED by the
--   door_* policies below. Guardian's deny_teacher is preserved (see guardian section).
--   Safe today: both editions match no one (zero teacher memberships) — the read-back
--   benchmark (cook) is unchanged.
--
--   Why my_center_ids(): a policy subquery straight to core.user_center_access raises
--   `permission denied` for authenticated (agent rehearsal). A SECURITY DEFINER helper
--   reads it under the definer and returns the caller's active center_ids.
--
-- READ-BACK EXPECTED (rehearsal benchmark) — run the block at the bottom after apply:
--   Ridge door SELECT roster        → 272   (its center, not 621)
--   Ridge door UPDATE a Pearl child → 0 rows (cross-center blocked)
--   Ridge door UPDATE a Ridge child → 1 row  (own center allowed — the photo path)
--   Ridge door INSERT roster        → 0      (door may not create children)
--   director SELECT roster          → 621    (unaffected)
--
-- SCOPE NOTE: this scopes ROWS. Column-level "write = photo_url only" for the cook is a
-- SEPARATE concern (20260716b) and is NOT enforced here. Flagged for follow-up.
--
-- ⚠️ NOT APPLIED — prepare only. Nikolay applies by hand, then read-back.

-- ── helper: the caller's active center_ids (SECURITY DEFINER) ──────────────────
create or replace function menumaker.my_center_ids()
returns setof uuid
language sql stable security definer
set search_path = core, public as $$
  select center_id from core.user_center_access
   where user_id = auth.uid() and is_active
$$;
revoke execute on function menumaker.my_center_ids() from public;
grant  execute on function menumaker.my_center_ids() to authenticated;

-- ── roster: replace the teacher full-deny with door scoping (cook + teacher) ────
-- READ  : both door roles are center-scoped.
-- UPDATE: cook may write its own center (photo path); teacher is write-denied.
-- INSERT: both door roles denied. DELETE: both door roles denied.
drop policy if exists deny_teacher on menumaker.roster;   -- replaced by door_* below

drop policy if exists door_read_scope on menumaker.roster;
create policy door_read_scope on menumaker.roster
  as restrictive for select to authenticated
  using (not core.has_org_role(org_id, array['cook','teacher'])
         or center_id in (select menumaker.my_center_ids()));

drop policy if exists door_update on menumaker.roster;
create policy door_update on menumaker.roster
  as restrictive for update to authenticated
  using (not core.has_org_role(org_id, array['cook','teacher'])
         or (core.has_org_role(org_id, array['cook'])
             and center_id in (select menumaker.my_center_ids())))
  with check (not core.has_org_role(org_id, array['cook','teacher'])
              or (core.has_org_role(org_id, array['cook'])
                  and center_id in (select menumaker.my_center_ids())));

drop policy if exists door_no_insert on menumaker.roster;
create policy door_no_insert on menumaker.roster
  as restrictive for insert to authenticated
  with check (not core.has_org_role(org_id, array['cook','teacher']));

drop policy if exists door_no_delete on menumaker.roster;
create policy door_no_delete on menumaker.roster
  as restrictive for delete to authenticated
  using (not core.has_org_role(org_id, array['cook','teacher']));

-- ── guardian + child_guardian: a door gets NOTHING ("guardian no exceptions") ──
-- guardian has no center_id (its center is indirect via child_guardian→roster), and
-- it holds PII / trusted-person contacts the door has no business reading. Full deny
-- for BOTH door roles. The director's trusted-persons surface (item 4) is a DIFFERENT,
-- authenticated director path — unaffected. Guardian's existing `deny_teacher` is left
-- in place (redundant with door_deny for teacher, harmless) so nothing is "un-preserved".
drop policy if exists door_deny on menumaker.guardian;
create policy door_deny on menumaker.guardian
  as restrictive for all to authenticated
  using (not core.has_org_role(org_id, array['cook','teacher']))
  with check (not core.has_org_role(org_id, array['cook','teacher']));

drop policy if exists door_deny on menumaker.child_guardian;
create policy door_deny on menumaker.child_guardian
  as restrictive for all to authenticated
  using (not core.has_org_role(org_id, array['cook','teacher']))
  with check (not core.has_org_role(org_id, array['cook','teacher']));

-- ── READ-BACK (run AFTER apply, as the Ridge door session, then as director) ────
-- As a signed-in Ridge cook (or impersonated in the rehearsal transaction):
--   select count(*) from menumaker.roster;                    -- expect 272
--   update menumaker.roster set photo_url = photo_url
--     where center_id = '<pearl center_id>';                  -- expect 0 rows
--   update menumaker.roster set photo_url = photo_url
--     where center_id = '4aed7d5a-00d0-4a4c-ac99-311046ad2027' limit 1; -- expect 1
--   insert into menumaker.roster (org_id,center_id,child_name,is_active)
--     values (...);                                           -- expect 0 (blocked)
--   select count(*) from menumaker.guardian;                  -- expect 0
-- As a director:
--   select count(*) from menumaker.roster;                    -- expect 621
