-- Broaden menu planner write access: admin + office_manager can manage the
-- org-wide menu alongside the central kitchen (cook). Follows 20260705d, which
-- removed 'director' (directors stay view-only).
--
--   menu_cycles / menu_items write: cook, office_manager, admin
--   holidays write: office_manager (already present) — unchanged here.
--
-- get_user_role() returns one role per org (director outranks office_manager
-- outranks cook; 'admin' is lowest-priority). Consistent with the existing
-- published_menus.manage_published_menus policy which already lists 'admin'.

alter policy manage_cycles on menumaker.menu_cycles
  using (menumaker.get_user_role() = any (array['cook'::text, 'office_manager'::text, 'admin'::text]));

alter policy manage_menu_items on menumaker.menu_items
  using (menumaker.get_user_role() = any (array['cook'::text, 'office_manager'::text, 'admin'::text]));
