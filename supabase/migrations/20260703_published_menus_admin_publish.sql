-- Fix Publish gating mismatch on menumaker.published_menus.
--
-- Frontend canPublish (MenuPrintOfficialPage) allows
--   director || office_manager || admin
-- but the manage_published_menus RLS policy only allowed
--   director || office_manager
-- so an admin saw the Publish button yet the INSERT was rejected by RLS.
-- admin is the org owner — not weaker than office_manager — so extend the
-- write policy to include admin, matching the frontend.
--
-- Applied to project menumaker (trrmyqfpxntmgxnqkikp) 2026-07-03.
drop policy if exists manage_published_menus on menumaker.published_menus;

create policy manage_published_menus on menumaker.published_menus
  for all using (menumaker.get_user_role() = any (array['director','office_manager','admin']))
  with check (menumaker.get_user_role() = any (array['director','office_manager','admin']));
