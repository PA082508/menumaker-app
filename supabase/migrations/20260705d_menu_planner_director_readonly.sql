-- Menu = view-only for directors (central kitchen owns the planner).
--
-- The menu planner writes directly to menu_cycles / menu_items / holidays from
-- the client, so RLS is the real enforcement boundary. Previously the write
-- (ALL) policies granted 'director' alongside the planner owner, which let a
-- director mutate the org-wide menu. Directors are now view-only: they keep
-- Current Menu + official print (SELECT policies are untouched) but the DB
-- rejects any planner write from them, even outside the app UI.
--
-- Central kitchen (cook) retains menu_cycles/menu_items write; office_manager
-- retains holidays write. WITH CHECK is left unset on these ALL policies, so it
-- continues to fall back to the USING expression (covers INSERT/UPDATE).
--
-- NOTE: get_user_role() returns the single highest-priority role for the org
-- (director outranks cook), so a user who is BOTH director and cook is treated
-- as director → view-only here. The central-kitchen operator must hold 'cook'
-- (not also 'director') to keep planner write.

alter policy manage_cycles on menumaker.menu_cycles
  using (menumaker.get_user_role() = any (array['cook'::text]));

alter policy manage_menu_items on menumaker.menu_items
  using (menumaker.get_user_role() = any (array['cook'::text]));

alter policy manage_holidays on menumaker.holidays
  using (menumaker.get_user_role() = any (array['office_manager'::text]));
