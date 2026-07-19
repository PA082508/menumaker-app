-- ============================================================================
-- 20260719b — лицензионные тоталы центра: свести ДВЕ пары в одну
-- APPLIED: 2026-07-18  (claim — verify before building on it)
-- READ-BACK: Ridge 215/215 · Pearl 158/158 · Highland 106/106 · under2_5 = NULL ×3
-- VERIFY:   select count(*) = 0 as totals_agree
--             from menumaker.centers
--            where license_capacity is not null
--              and license_total_max is distinct from license_capacity;
-- ⚠️ «до 2½» НАМЕРЕННО пусто — ждёт трёх чисел с бумажных лицензий DCY.
--    Старая пара НЕ снесена: пока она единственный носитель under-2.
--
-- ⚠️ ЗАКАЗ ИСПОЛНЕН НЕ БУКВАЛЬНО — прошу решение до применения.
--
-- Заказ был: «истина = заполненная старая пара (license_capacity/_under2),
-- страницу перевести на неё, пустую новую пару снести; если у новой пары была
-- отличная семантика — назвать до сноса».
--
-- Семантика ОТЛИЧАЕТСЯ, и не в пользу старой пары. Поэтому сношу НЕ ту.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- §0 ЧТО ИЗМЕРЕНО (из миграций, не из имён колонок)
--
-- 20260705_capacity_ratio_and_center_license.sql завёл пару как
--     license_under3_max  — максимум детей ДО 3 лет
--     license_3plus_max   — максимум детей 3 года И СТАРШЕ
--   и там же прямо записано про старую пару:
--     «legacy license_capacity (total) / license_capacity_under2 (under-2)
--      already exist … with a DIFFERENT split — reconcile later».
--
-- 20260705b_center_license_rename_under2_5_total.sql переименовал их:
--     license_under3_max → license_under2_5_max
--     license_3plus_max  → license_total_max
--   с объяснением: «DCY license actually limits "Total Under 2½ Years" and
--   "Total Capacity" (boundary 2.5yr = 30 months by birthday), NOT under-3 / 3+».
--
-- Итого три РАЗНЫХ порога жили в четырёх колонках:
--
--   колонка                    смысл                     Ridge
--   license_capacity           ВСЕГО                     215
--   license_capacity_under2    до 2 лет                   57
--   license_total_max          ВСЕГО (после переим.)     NULL
--   license_under2_5_max       до 2½ лет                 NULL
--
-- ---------------------------------------------------------------------------
-- §1 ВЫВОД
--
-- «Всего»:      license_capacity  ==  license_total_max  — один и тот же смысл.
--               Данные есть в старой. Переносится механически.
--
-- «До 2½ лет»:  license_capacity_under2 — это **до 2 ЛЕТ**, а бланк DCY просит
--               **Total Under 2½ Years**. Это РАЗНЫЕ числа: детей до 2½ лет
--               всегда НЕ МЕНЬШЕ, чем до 2. Ridge 57 — это ответ на другой
--               вопрос.
--
-- Поэтому перевести страницу на старую пару значит подставить под поле
-- «Under 2½» число, посчитанное по границе 2 года, и разойтись с бумажной
-- лицензией молча — ровно тот класс ошибки, от которого мы держим стандарт
-- «ярлык ≠ содержание». Правильная семантика у НОВОЙ пары; у старой — данные.
--
-- ---------------------------------------------------------------------------
-- §2 ЧТО ПРЕДЛАГАЮ (и почему это дешевле)
--
--   1. Перенести «всего»: license_capacity → license_total_max. Механически.
--   2. license_under2_5_max НЕ заполнять из license_capacity_under2.
--      Это единственное поле, которое действительно надо прочитать с бумажной
--      лицензии DCY — по одному числу на центр, три числа всего.
--   3. Старую пару снести ПОСЛЕ шага 2 — отдельным заходом, когда 2½ заполнено.
--      Сегодня она единственный носитель данных, сносить её нечем заменить.
--
-- Страницу переводить никуда не нужно: она уже читает правильную пару.
-- Николай в UI по-прежнему ничего не вводит — кроме трёх чисел «Under 2½»
-- с бумаги, когда дойдут руки.
-- ---------------------------------------------------------------------------

begin;

-- Шаг 1 — только «всего», только там, где новая колонка пуста.
update menumaker.centers
   set license_total_max = license_capacity
 where license_total_max is null
   and license_capacity is not null;

-- Страховка: смысл «всего» обязан совпасть везде, где заполнены обе.
do $$
declare n int;
begin
  select count(*) into n from menumaker.centers
   where license_total_max is not null and license_capacity is not null
     and license_total_max <> license_capacity;
  if n <> 0 then
    raise exception 'у % центров license_total_max <> license_capacity — это не механический перенос, откат', n;
  end if;
end $$;

commit;

-- ---------------------------------------------------------------------------
-- §3 READ-BACK
--   select name, license_total_max, license_capacity,
--          license_under2_5_max, license_capacity_under2
--     from menumaker.centers where license_capacity is not null order by name;
--   ожидаем: Ridge 215/215/NULL/57 · Pearl 158/158/NULL/36 · Highland 106/106/NULL/42
--   то есть «всего» сошлось, «до 2½» ОСТАЛОСЬ ПУСТЫМ — намеренно, см. §2 п.2.
--
-- §4 НЕ ДЕЛАЕТСЯ ЭТИМ ЗАХОДОМ
--   · снос license_capacity / license_capacity_under2 — после заполнения 2½
--   · заполнение license_under2_5_max — только с бумажной лицензии, руками
-- ============================================================================

-- ============================================================================
-- §5 ПРОДОЛЖЕНИЕ (18.07, вечер) — имя колонки врало, значения верны
--
-- Николай перечитал БУМАЖНУЮ лицензию Pearl, дословно:
--   «total capacity of 158; of this, 36 may be under 2 1/2 years»
-- → license_capacity_under2 = 36 это under-2½, а НЕ under-2.
--   Переименование 20260705b было верным; «третья семантика» из §0 снята
--   владельцем. Врало ИМЯ колонки, содержимое всё это время было лицензионным.
--
-- ЧЕГО ЖДЁМ: Николай сверяет две оставшиеся бумаги —
--   Ridge     215 / 57 ?
--   Highland  106 / 42 ?
--
-- ПРИ ДВУХ ПОДТВЕРЖДЕНИЯХ выполняется §6. Ручной ввод трёх чисел ОТМЕНЯЕТСЯ.
-- ЕСЛИ КАКАЯ-ТО БУМАГА РАЗОЙДЁТСЯ С БАЗОЙ — истина БУМАГА, точечная правка
-- по слову Николая, и §6 не запускается целиком.
-- ============================================================================

-- §6 — НЕ ПРИМЕНЯТЬ до двух подтверждений с бумаги.
-- begin;
--   update menumaker.centers
--      set license_under2_5_max = license_capacity_under2
--    where license_under2_5_max is null
--      and license_capacity_under2 is not null;
--
--   do $$
--   declare n int;
--   begin
--     select count(*) into n from menumaker.centers
--      where license_capacity_under2 is not null
--        and license_under2_5_max is distinct from license_capacity_under2;
--     if n <> 0 then raise exception 'под-2½ не сошлось у % центров, откат', n; end if;
--   end $$;
-- commit;
--
-- READ-BACK: Ridge 215/57 · Pearl 158/36 · Highland 106/42 в НОВОЙ паре.
-- В историю версии колонки: «old column name lied; values verified against
-- paper licenses by owner 2026-07-18».
-- ПОСЛЕ этого — снос старой пары отдельным заходом, как и планировалось.
