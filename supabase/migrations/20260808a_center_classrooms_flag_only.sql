-- ============================================================================
-- 20260808a_center_classrooms_flag_only.sql — служебность комнаты решает ПРИЗНАК
-- ----------------------------------------------------------------------------
-- ЗАЧЕМ. `safepass_center_classrooms` (вопрос «Which room are you in today?» в App
-- учителя) отбирала детские комнаты ДВУМЯ способами сразу:
--     and coalesce(c.is_roster, true)      -- признак
--     and c.name !~* 'staff'               -- ИМЯ
-- Канон 08.08 (DECISIONS, «СЛУЖЕБНАЯ КОМНАТА ОПОЗНАЁТСЯ ПРИЗНАКОМ, А НЕ СЛОВОМ В
-- НАЗВАНИИ»): имя — это надпись. Фильтр по имени врёт в обе стороны — прячет
-- детскую комнату, в названии которой случилось слово staff, и пропускает
-- служебную, названную иначе. Остаётся ОДИН отбор — `is_roster`.
--
-- ПОЧЕМУ ЭТО БЕЗОПАСНО СЕГОДНЯ. Замер 08.08 по боевой базе: колонка `is_roster`
-- есть (NOT NULL, default true), и у ВСЕХ четырёх служебных строк она уже false —
-- Highland «Staff Room», Pearl «Staff», Ridge «Staff» и Ridge «Staff Room».
-- Значит снятие имени НИЧЕГО не открывает: выдача функции до и после совпадает.
-- Меняется не сегодняшний ответ, а завтрашний — тот, где комнату переименовали.
--
-- ФОРВАРД-ОНЛИ: старая версия не правится, кладётся новая `create or replace`.
--
-- ПРОБА ПОСЛЕ ПРИМЕНЕНИЯ (в т.ч. НЕГАТИВНАЯ, слово владельца 08.08):
--   1) выдача функции до и после — одинакова (11 комнат Ridge, служебных нет);
--   2) комната с «staff» в имени и is_roster = true — ПОКАЗЫВАЕТСЯ;
--   3) служебная комната с любым именем (is_roster = false) — НЕ показывается.
--   Проба ставит временную строку в `classrooms` и снимает её в той же
--   транзакции: боевые данные не меняются.
-- ============================================================================

create or replace function menumaker.safepass_center_classrooms(p_token text)
returns jsonb
language plpgsql
security definer
set search_path to 'menumaker', 'public', 'extensions'
as $function$
declare v_dev record; v_rooms jsonb;
begin
  select * into v_dev from menumaker.safepass_devices
   where token_hash = encode(digest(p_token,'sha256'),'hex') and is_active and revoked_at is null;
  if not found then raise exception 'device not registered'; end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name)
                            order by coalesce(c.sort_order, 0), c.name), '[]'::jsonb)
    into v_rooms
    from menumaker.classrooms c
   where c.center_id = v_dev.center_id
     and c.is_active
     -- ОДИН отбор: признак. Фильтра по имени здесь больше нет — см. шапку.
     and coalesce(c.is_roster, true);

  return v_rooms;
end $function$;
