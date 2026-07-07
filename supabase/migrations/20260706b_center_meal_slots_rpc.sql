-- get_center_meal_slots — anon-readable "which meals does this center serve?"
--
-- Purpose: the public CACFP enrollment form (embed + standalone, hosted on
-- pa082508.github.io) and the Director's Inbox both need to know a center's
-- active Meal Slots so a parent can't request a meal the center doesn't serve.
--   • Form (v10, later pass): grey out + disable + tooltip the checkboxes for
--     meals outside `active`, and uncheck them on center change. RPC error /
--     offline → FAIL-OPEN (all checkboxes live), so the form never breaks on a
--     slots outage.
--   • Review (this pass): validateCacfp raises a 🟡 warning when a parent checked
--     a meal outside the center's active slots. Advisory only — never blocks
--     Approve.
--
-- Source of truth: menumaker.meal_count_settings.active_slots, keyed by center_id
-- (managed in Settings → Meal Count; frozen by is_locked after agency approval).
-- Slots are stable, but reading them live via this RPC beats a static copy baked
-- into the embed registry — one edit in Settings and every surface is correct.
--
-- Security: SECURITY DEFINER + anon grant, exactly like safepass_device_context /
-- submit_enrollment_form. The only thing exposed is the list of meals a center
-- serves by public slug — non-sensitive, and already implied by the printed form.
-- No table grant to anon; the RPC is the sole read path.

create or replace function menumaker.get_center_meal_slots(p_center_slug text)
returns jsonb
language sql
stable
security definer
set search_path = menumaker, public
as $$
  select jsonb_build_object(
    'slug',      c.slug,
    'center_id', c.id,
    -- Live config if a settings row exists; otherwise the CACFP default set so a
    -- center with no row yet is treated as serving the standard meals (fail-open
    -- on the config side — never hides a meal because Settings wasn't filled in).
    'active',    coalesce(
                   (select mcs.active_slots
                      from menumaker.meal_count_settings mcs
                     where mcs.center_id = c.id),
                   array['breakfast','am_snack','lunch','supper']
                 ),
    'locked',    coalesce(
                   (select mcs.is_locked
                      from menumaker.meal_count_settings mcs
                     where mcs.center_id = c.id),
                   false
                 )
  )
  from menumaker.centers c
  where lower(c.slug) = lower(p_center_slug)
  limit 1;
$$;

-- Unknown slug → the query returns no row → the function returns NULL. Callers
-- treat NULL as "couldn't resolve" and fail open (form) / skip the slot check
-- (review), never as "serves nothing".

grant execute on function menumaker.get_center_meal_slots(text) to anon, authenticated;
