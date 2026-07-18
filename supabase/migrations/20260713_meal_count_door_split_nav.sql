-- ═══════════════════════════════════════════════════════════════════════════
-- Meal Count DOOR SPLIT — nav registry
-- Append to the #23 people-block prepare-script → one DB trip.
--
-- Concurrent-user fix: cook (Kitchen) and director run on separate devices and
-- were colliding on one screen. The module is now two doors:
--   meal_count           → /meal-count           (Kitchen: cook/teacher/admin)
--   meal_count_director  → /meal-count-director  (Director: director/office_manager/admin)
--
-- Idempotent. Admin & office_manager* auto-resolve inside the user_modules RPC:
-- admin via v_is_admin (holds every module), so only director/office_manager
-- need an explicit role_module_access grant for the new Director door.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) Register the Director door as its own nav module.
--    (Kitchen door keeps the existing 'meal_count' row, unchanged.)
insert into menumaker.app_modules (code, label, category, icon, sort_order, active)
values ('meal_count_director', 'Meal Count — Director', 'compliance', null, 91, true)
on conflict (code) do update
  set label      = excluded.label,
      category   = excluded.category,
      sort_order = excluded.sort_order,
      active     = true;

-- 2) Grant the Director door to the roles that own it.
--    role_module_access has no natural unique key (PK = surrogate id), so the
--    grant is guarded by NOT EXISTS to stay idempotent. admin is NOT listed —
--    the RPC grants admins every module automatically.
insert into menumaker.role_module_access (role, module_code, access, org_id)
select v.role, 'meal_count_director', 'edit', null
from (values ('director'), ('office_manager')) as v(role)
where not exists (
  select 1 from menumaker.role_module_access r
  where r.role = v.role
    and r.module_code = 'meal_count_director'
    and r.org_id is null
);

-- 3) (cosmetic, optional) Relabel the Kitchen door in the registry.
--    Sidebar labels come from the app shell (AppLayout SECTIONS / NAV_ITEMS),
--    NOT this row — so this only affects any surface that reads app_modules.label.
-- update menumaker.app_modules set label = 'Meal Count — Kitchen' where code = 'meal_count';

-- ── read-back (run after apply) ─────────────────────────────────────────────
-- select code, label, sort_order, active from menumaker.app_modules
--   where code like 'meal_count%' order by sort_order;
-- select role, module_code, access from menumaker.role_module_access
--   where module_code = 'meal_count_director' order by role;
