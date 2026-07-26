-- 20260727c_staff_time_events_door_vocabulary.sql
-- PREPARE — НЕ ПРИМЕНЕНО. Ждёт go Николая.
--
-- ⚠️ НОМЕР: заказ назывался «миграция 20260727b», но это имя уже занято применённой
--    transport_school_per_tap_and_capacity_20260727b (ход 2-Т, шаг (а)). Здесь 20260727c.
--
-- ── ЧТО СЛОМАЛОСЬ (смоук хода 1, шаг 2, 27.07)
-- PIN Carolyn → красная ошибка на планшете:
--   new row for relation "staff_time_events" violates check constraint …
-- Причина, измерена:
--   staff_time_events_event_type_check  CHECK (event_type = ANY (ARRAY[
--     'clock_in', 'break_start', 'break_end', 'clock_out']))
-- То есть таблица пришла из ТАБЕЛЬНОГО (DTL) рельса со своим словарём смены, а
-- safepass_staff_check_in пишет ДВЕРНЫЕ значения 'check_in' / 'check_out' — вне списка.
-- Вставляемая строка (из тела RPC):
--   (org_id, center_id, staff_id, classroom_id, event_type='check_in', event_at=now(), device_id)
--
-- ── ВТОРОЙ ДЕФЕКТ, КОТОРЫЙ НАШЁЛСЯ ПО ДОРОГЕ (тихий, важнее первого)
-- Единственный потребитель таблицы, кроме нашей RPC, — вьюха menumaker.v_staff_time_summary.
-- Она НЕ фильтрует event_type: группирует ВСЕ события по (staff, date) и считает clock_in/
-- clock_out/breaks через CASE. Значит, как только дверные события начнут писаться, табель
-- получит ФАНТОМНЫЕ СТРОКИ: день, где учитель только чек-нулся в комнату, появится в сводке
-- с clock_in_at = NULL, clock_out_at = NULL, gross_hours = NULL.
-- Это ровно то смешение двери и табеля, которое ход 1 обещал не допускать.
-- Канон: «миграция владеет всеми читателями колонок, которых касается» — поэтому вьюха
-- чинится ТЕМ ЖЕ ходом, а не «потом».
--
-- ── РЕШЕНИЕ (выбор из двух, обоснование)
-- (A) писать 'clock_in'/'clock_out' из дверной RPC — ОТВЕРГНУТО: это и есть смешение
--     двери с табелем; один тап в комнате стал бы началом смены в сводке часов.
-- (B) расширить словарь ДВЕРНЫМИ значениями + научить табельную вьюху их игнорировать —
--     ПРИНЯТО: DTL-семантика не меняется ни на йоту, её потребители читают ровно то же.
--
-- Тело вьюхи правится replace()-ом над pg_get_viewdef() в транзакции, с проверкой якоря —
-- канон «тело живой вьюхи не перенабирать руками».

begin;

-- (1) Словарь: к табельным значениям добавляются ДВЕРНЫЕ. Старые значения не тронуты.
alter table menumaker.staff_time_events
  drop constraint if exists staff_time_events_event_type_check;

alter table menumaker.staff_time_events
  add constraint staff_time_events_event_type_check
  check (event_type = any (array[
    -- табель (DTL) — как было, порядок и значения не меняются
    'clock_in', 'break_start', 'break_end', 'clock_out',
    -- дверь (SafePass, ход 1) — комната, не смена
    'check_in', 'check_out'
  ]));

-- (2) Табельная вьюха читает ТОЛЬКО табельный словарь. Без этого дверные события
--     породили бы фантомные строки в сводке часов.
do $$
declare v_def text; v_new text;
begin
  v_def := pg_get_viewdef('menumaker.v_staff_time_summary'::regclass, true);
  v_new := replace(
    v_def,
    '  GROUP BY e.org_id',
    '  WHERE e.event_type = ANY (ARRAY[''clock_in''::text, ''break_start''::text, ''break_end''::text, ''clock_out''::text])' || chr(10) ||
    '  GROUP BY e.org_id');
  if v_new = v_def then
    raise exception 'anchor "GROUP BY e.org_id" not found in v_staff_time_summary — body changed, fix by hand';
  end if;
  execute 'create or replace view menumaker.v_staff_time_summary as ' || v_new;
end $$;

commit;

-- ── READ-BACK (сразу после apply)
-- R1. Констрейнт содержит все шесть значений, включая check_in/check_out.
-- R2. v_staff_time_summary содержит WHERE по табельному словарю.
-- R3. Дверной insert проходит: safepass_staff_check_in больше не падает (проверяется
--     живым прогоном на планшете — п.2 чеклиста).
-- R4. Табель не изменился: v_staff_time_summary на дверных событиях даёт 0 строк.
