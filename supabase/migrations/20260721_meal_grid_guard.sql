-- 20260721_meal_grid_guard.sql — сетка кухни отсеивает сама, а не «фильтром в браузере»
--
-- ✅ ПРИМЕНЕНА 2026-07-16 по слову Николая («согласен делаем»).
--    ЗАЯВОЧНО-КРИТИЧНАЯ вьюха: из неё повар видит, кому ставить галочку.
--
-- READ-BACK (фактический):
--   WHERE → core.is_org_member(r.org_id) AND COALESCE(r.is_active, true)
--                                        AND COALESCE(r.date_in <= CURRENT_DATE, true)
--   В сетке: ВСЕГО 332 · Highland Heights 119 · Pearl 75 · Ridge 138
--   Было ровно столько же — НИ ОДНОГО не потеряно. Набор колонок не сдвинулся.
--
-- ПРОГОН С ОТКАТОМ ДО ПРАВКИ доказал цену наивного варианта:
--   мой   COALESCE(date_in <= current_date, true) → 332 (119 · 75 · 138)
--   наивный      date_in <= current_date          → 156 (13 · 5 · 138)  ☠️
--   Наивный оставил бы от Highland Heights 13 детей из 119 — тихо, без ошибки.
--
-- ЗАЧЕМ
-- ─────
-- `v_meal_grid` сегодня не фильтрует НИЧЕГО: единственное условие —
-- `core.is_org_member(r.org_id)`. Колонку `is_active` она только отдаёт наружу.
-- Отсеивают её ДВА клиентских фильтра:
--     MealCountPage.tsx        .eq('is_active', true)
--     SafePassTeacherPage.tsx  .eq('is_active', true)
-- А `date_in` не фильтруется НИГДЕ. Значит ребёнок, зачисленный с началом
-- 1 сентября, появится в сетке сегодня, и повар сможет отметить ему обед →
-- это прямо в заявку. Стандарт: «фильтр в браузере не защита».
--
-- ЗАМЕРЕНО ДО ПРАВКИ (2026-07-16):
--   активных детей с будущей датой начала → 0. Живого риска нет, дыра структурная.
--
-- ⚠️ ГЛАВНОЕ: NULL — ЭТО НЕ «ЕЩЁ НЕ НАЧАЛ»
-- ────────────────────────────────────────
-- Наивное `date_in <= current_date` при пустой дате даёт NULL, а не TRUE, и
-- ребёнок ВЫПАДАЕТ из сетки. Замерено:
--   Highland Heights → 106 из 119 активных имеют date_in = NULL
--   Pearl            →  70 из  75
--   Ridge            →   0 из 138
--   ВСЕГО            → 176 из 332
-- То есть наивный фильтр погасил бы кухню в двух центрах из трёх — тихо, без
-- ошибки, ровно как 16 июля. Пустая дата означает «ходит давно, дату не завели»
-- (наследие импорта), а НЕ «ещё не начал». Поэтому:
--     coalesce(r.date_in <= current_date, true)
--
-- ЗАВИСИМОСТИ: проверено через pg_depend — вьюх, зависящих от v_meal_grid, НЕТ.
-- Читателей ровно два, оба уже фильтруют is_active=true → для них поведение не
-- меняется. Клиентские фильтры оставлены намеренно: снимать их — отдельный
-- заход после того, как эта вьюха отработает неделю.
--
-- ПРИЁМ: тело строится ЗАМЕНОЙ над pg_get_viewdef() в транзакции — руками не
-- перенабирается (стандарт). Набор колонок проверяется до commit: если он
-- сдвинулся хоть на одну — транзакция падает, и кухня не узнает.

begin;

do $$
declare
  body        text;
  cols_before text;
  cols_after  text;
  anchor      text := 'WHERE core.is_org_member(r.org_id)';
begin
  select string_agg(attname, ',' order by attnum)
    into cols_before
    from pg_attribute
   where attrelid = 'menumaker.v_meal_grid'::regclass and attnum > 0 and not attisdropped;

  body := pg_get_viewdef('menumaker.v_meal_grid'::regclass, true);

  if position(anchor in body) = 0 then
    raise exception 'ЯКОРЬ НЕ НАЙДЕН в теле v_meal_grid — тело изменилось, правку не применяю';
  end if;

  body := replace(
    body,
    anchor,
    'WHERE core.is_org_member(r.org_id)'
    || ' AND COALESCE(r.is_active, true)'
    -- NULL date_in = ходит давно, дату не завели (176 из 332). НЕ «ещё не начал».
    || ' AND COALESCE(r.date_in <= CURRENT_DATE, true)'
  );

  execute 'create or replace view menumaker.v_meal_grid as ' || body;

  select string_agg(attname, ',' order by attnum)
    into cols_after
    from pg_attribute
   where attrelid = 'menumaker.v_meal_grid'::regclass and attnum > 0 and not attisdropped;

  if cols_before is distinct from cols_after then
    raise exception 'НАБОР КОЛОНОК СДВИНУЛСЯ: было [%], стало [%]', cols_before, cols_after;
  end if;
end $$;

comment on view menumaker.v_meal_grid is
  'Сетка кухни. Отсеивает САМА (20260721): только активные и только те, чья дата начала '
  'уже наступила. COALESCE(date_in <= current_date, true) — пустая дата означает «ходит '
  'давно, дату не завели» (176 из 332 строк), а НЕ «ещё не начал»: наивное сравнение '
  'выключило бы 106 из 119 детей Highland Heights. Потенциальный (заполнил, но не '
  'приступил) живёт в enrollment_submissions и в ростер не попадает до Approve.';

commit;

-- ── READ-BACK ПОСЛЕ ПРИМЕНЕНИЯ (обязателен, кухня живая) ────────────────────
--   select count(*) from menumaker.v_meal_grid;                  → 332 (было 332)
--   select center, count(*) from menumaker.v_meal_grid group by 1;
--     → Highland Heights 119 · Pearl 75 · Ridge 138  — НИ ОДНОГО не потеряно
--   Глазами: /meal-count, Ridge → Red = 9, Highland Heights → Green Room = 10.
--
-- ── ROLLBACK ────────────────────────────────────────────────────────────────
--   Вернуть тело без двух AND — тем же приёмом, заменой над pg_get_viewdef():
--   replace(body, ' AND COALESCE(r.is_active, true) AND COALESCE(r.date_in <= CURRENT_DATE, true)', '')
