-- 20260730a: ставки CACFP на 01.07.2026–30.06.2027 (континентальные штаты, ЦЕНТРЫ)
-- ПОДГОТОВЛЕНО 2026-07-30. НЕ ПРИМЕНЕНО. Ждёт слова владельца.
--
-- Источники (оба проверены по API Federal Register, не по памяти):
--   базовые ставки  — FR 2026-15071, опубликован 27.07.2026, стр. 46894–46896,
--                     effective_on 2026-07-01 (ретроактивно с 1 июля);
--   cash-in-lieu    — FR 2026-14123, опубликован 14.07.2026, стр. 43079–43080,
--                     effective_on 2026-07-01. Значение 32.00 цента за обед и ужин
--                     (было 30.50). Отдельное уведомление, отдельная дата публикации.
--
-- Таблица period-effective по ОДНОЙ дате: compute_monthly_claim берёт
--   effective_date = max(effective_date <= первое число месяца заявки).
-- Значит строки 2025-07-01 НЕ ТРОГАЕМ и НЕ УДАЛЯЕМ: июнь обязан продолжать считаться
-- по ним. Это forward-only — новый год добавляется строками, старый остаётся.

begin;

-- ⚠ 1. ЗАЩИТА ОТ ЗАДВОЕНИЯ — обязательна ДО вставки.
-- В cacfp_rates сегодня только PRIMARY KEY (id). Уникального ключа по
-- (effective_date, slot, category) НЕТ. Повторный прогон этого файла вставил бы
-- второй комплект строк, а meal_rev джойнится по slot+category — сумма возмещения
-- МОЛЧА УДВОИЛАСЬ БЫ. Индекс закрывает это навсегда.
create unique index if not exists cacfp_rates_effective_slot_category_key
  on menumaker.cacfp_rates (effective_date, slot, category);

-- 2. Ставки FY2026-27. 20 строк — та же форма, что у комплекта 2025-07-01.
insert into menumaker.cacfp_rates (effective_date, slot, category, rate) values
  ('2026-07-01','breakfast',    'free',    2.5400),
  ('2026-07-01','breakfast',    'reduced', 2.2400),
  ('2026-07-01','breakfast',    'paid',    0.4200),
  ('2026-07-01','am_snack',     'free',    1.3000),
  ('2026-07-01','am_snack',     'reduced', 0.6500),
  ('2026-07-01','am_snack',     'paid',    0.1200),
  ('2026-07-01','pm_snack',     'free',    1.3000),
  ('2026-07-01','pm_snack',     'reduced', 0.6500),
  ('2026-07-01','pm_snack',     'paid',    0.1200),
  ('2026-07-01','evening_snack','free',    1.3000),
  ('2026-07-01','evening_snack','reduced', 0.6500),
  ('2026-07-01','evening_snack','paid',    0.1200),
  ('2026-07-01','lunch',        'free',    4.7600),
  ('2026-07-01','lunch',        'reduced', 4.3600),
  ('2026-07-01','lunch',        'paid',    0.4500),
  ('2026-07-01','supper',       'free',    4.7600),
  ('2026-07-01','supper',       'reduced', 4.3600),
  ('2026-07-01','supper',       'paid',    0.4500),
  -- cash-in-lieu: строка на lunch — ЕДИНСТВЕННАЯ, которую читает cil_calc
  -- (она умножает lunch+supper на ставку slot='lunch'). Строка supper заведена
  -- для симметрии с комплектом 2025 и сегодня не читается ничем.
  ('2026-07-01','lunch',        'cil',     0.3200),
  ('2026-07-01','supper',       'cil',     0.3200)
on conflict (effective_date, slot, category) do nothing;

commit;

-- ── READ-BACK (выполнять ОТДЕЛЬНО, после применения; сам по себе ничего не пишет) ──
-- 1) ровно 20 строк на 2026-07-01 и 20 на 2025-07-01, ни одной лишней:
--    select effective_date, count(*) from menumaker.cacfp_rates group by 1 order by 1;
-- 2) июнь считается по старым, июль по новым (проверка обеих границ одним запросом):
--    select c.name,
--           (menumaker.compute_monthly_claim(c.id,'2026-06-01')->'reimbursement'->>'total') as june,
--           (menumaker.compute_monthly_claim(c.id,'2026-07-01')->'reimbursement'->>'total') as july
--      from menumaker.centers c
--     where c.name in ('Play Academy Pearl','Play Academy Highland Heights','Play Academy Ridge')
--     order by 1;
--    ОЖИДАЕТСЯ (замер 30.07, по данным на момент замера — числа июля растут, пока месяц идёт):
--      июнь — не изменится ни на цент относительно того, что было до применения;
--      июль — Pearl 4468.90 → 4629.09 · Highland 6195.96 → 6419.74 · Ridge 13161.48 → 13634.75.
--    Если июнь сдвинулся — значит задета строка 2025-07-01, откатывать.
