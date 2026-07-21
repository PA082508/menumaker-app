-- 20260721b_resolve_packet_set.sql — CAMPAIGN/SET BUILDER, ШАГ #2 (серверный резолвер)
--
-- ✅ APPLIED 2026-07-21 на живой базе руками CC по live-DB протоколу (Nikolay GO).
--    Зависит от 20260721_packet_sets.sql (шаг #1, уже применён).
--
-- ЧТО ЭТО. Публичный (anon) резолвер «id набора → состав из БД». Из-за него QR
-- постоянен: storefront (parent-forms.html) при ?set=<uuid> зовёт этот RPC и берёт
-- form_keys из БД, а не из URL и не из статичного enroll-registry. Формы и их издания
-- (current→versions) остаются в реестре — резолвер отдаёт ТОЛЬКО состав набора.
--
-- БЕЗОПАСНОСТЬ:
--   • SECURITY DEFINER — anon НЕ имеет прямых грантов на packet_sets (шаг #1, R5),
--     definer читает от владельца (bypass RLS), доступ сужен WHERE внутри функции.
--   • anon вызывает НАМЕРЕННО (storefront анонимный) — в отличие от mint_prefill_token.
--     Но PUBLIC-дефолт всё равно отзываем и грантим точечно anon + authenticated.
--   • set search_path = '' + всё имя-квалифицировано (anon-callable definer — жёстко).
--
-- СЕМАНТИКА ВОЗВРАТА:
--   • text[] со составом  — набор status='active' И (kind='base' ИЛИ center_id=центр slug'а)
--   • '{}' (пустой массив) — валидный, но пустой набор (school_age до сборки редактором)
--   • NULL                 — не резолвится: архив / чужой центр / нет набора / неизвестный
--                            или неактивный центр. Storefront: NULL → гейт; '{}' → пусто.
--
-- id-ПРОСТРАНСТВО СВЕРЕНО (2026-07-21): core.user_center_access.center_id ==
-- menumaker.centers.id (pearl=881ef4ce…) → center_id у custom-наборов (из my_center_ids)
-- и джойн центра по slug здесь живут в ОДНОМ пространстве. Custom-наборы срезолвятся.

create or replace function menumaker.resolve_packet_set(p_center_slug text, p_set uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $function$
  select ps.form_keys
    from menumaker.packet_sets ps
    join menumaker.centers c
      on c.org_id = ps.org_id
     and c.slug   = p_center_slug
     and c.is_active
   where ps.id = p_set
     and ps.status = 'active'
     and (ps.kind = 'base' or ps.center_id = c.id)
   limit 1
$function$;

-- Точечные гранты: отозвать PUBLIC-дефолт, грантнуть только anon + authenticated.
revoke execute on function menumaker.resolve_packet_set(text, uuid) from public;
grant  execute on function menumaker.resolve_packet_set(text, uuid) to anon, authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- READ-BACK — вердикт колонками
-- ═════════════════════════════════════════════════════════════════════════════
-- (1) функция создана:
--   select exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--     where n.nspname='menumaker' and p.proname='resolve_packet_set') as fn_created;   -- t
-- (2) гранты: anon=true, PUBLIC-дефолт отозван (public=false), authenticated=true:
--   select has_function_privilege('anon','menumaker.resolve_packet_set(text,uuid)','execute') as anon_exec,
--          has_function_privilege('public','menumaker.resolve_packet_set(text,uuid)','execute') as public_exec,
--          has_function_privilege('authenticated','menumaker.resolve_packet_set(text,uuid)','execute') as auth_exec;
--   -- ждём t / f / t
-- (3) функциональный на живых сидах (infant id = db417bb8-…):
--   equivalence: resolve_packet_set('pearl', infant_id) == form_keys строки (18 ключей);
--   unknown center → NULL; bogus set → NULL; архивный/чужой-центр custom → NULL (тест в txn).
-- (4) базовый резолвится для ЛЮБОГО центра орг (center_id null): pearl/ridge/alpha → 18.
