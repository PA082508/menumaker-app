-- =====================================================================================
-- ПРОБА WHEELER ELIZABETH — ПОДГОТОВЛЕНО 01.08.2026. НЕ ПРИМЕНЕНО.
--
-- ⚠️ ЭТОТ ФАЙЛ НИЧЕГО НЕ ПИШЕТ И ПИСАТЬ НЕ ДОЛЖЕН. Здесь только снимок «до», критерии
--    «сошлось / не сошлось» и read-back «после». Само действие делает ЧЕЛОВЕК РУКАМИ
--    через дверь A (карточка ребёнка) — в этом весь смысл пробы: проверяется дорога,
--    которой пользуется директор, а не SQL, который её обходит.
--
-- ЧТО ПРОВЕРЯЕТСЯ. Что определение F/R, введённое через карточку ребёнка, доходит до
-- НОСИТЕЛЯ (`income_eligibility`) и оттуда — в деньги. Замер 31.07 нашёл 32 ребёнка, где
-- витрина и заявка расходятся; Wheeler — тест-ребёнок владельца из стопки B (носитель есть,
-- но истёк 12.06, то есть до начала июля). Цена вопроса измерена: $209.03.
--
-- ПОЧЕМУ ИМЕННО ЭТОТ РЕБЁНОК. Истёкший срок — самый честный случай для пробы: ничего не
-- «чинится» и не переписывается, вносится НОВОЕ определение по новому документу. Forward-only
-- проверяется заодно: старая строка FY2026 обязана уцелеть нетронутой.
-- =====================================================================================

-- ─────────────────────────────────────────────────────────────────────────────────────
-- 0. СНИМОК «ДО» — СНЯТ 01.08.2026, ЗНАЧЕНИЯ ВПИСАНЫ. Пересниматься перед вводом ОБЯЗАН:
--    если Pearl за выходные наотмечали, итог сдвинется сам по себе, и +$209.03 будет не с
--    чем сравнивать. Снимать ПРЯМО ПЕРЕД вводом, а не «утром».
-- ─────────────────────────────────────────────────────────────────────────────────────
--
--   roster.id                a14cd456-fc3a-431d-9d01-5bd8b8ac590f
--   ребёнок                  Wheeler Elizabeth · Play Academy Pearl · Orange 1 Room
--   roster.frp               F,  frp_expires = 2026-06-12
--   income_eligibility       ОДНА строка: FY2026 · F · expires 2026-06-12
--                            source='MasterListFood' · determined_by_name = NULL
--                            determined_at = NULL · determination_log пуст (0 записей)
--   июль считает её как      P            ← срок истёк до 01.07
--   Pearl, июль, итог        $4 768.23
--
--   ОЖИДАЕМЫЙ ИТОГ ПОСЛЕ:    $4 977.26   ( 4768.23 + 209.03 )

-- Пересъёмка «до» (выполнить перед вводом):
select 'roster' as part, ro.id::text, ro.child_name, ro.frp, ro.frp_expires::text,
       cl.name as room, c.name as center
from menumaker.roster ro
left join menumaker.classrooms cl on cl.id = ro.classroom_id
left join menumaker.centers   c  on c.id  = ro.center_id
where ro.id = 'a14cd456-fc3a-431d-9d01-5bd8b8ac590f';

select 'carrier' as part, fiscal_year, eligibility, frp_expires::text, source,
       determined_by_name, determined_at::text,
       jsonb_array_length(coalesce(determination_log,'[]'::jsonb)) as log_entries
from menumaker.income_eligibility
where roster_id = 'a14cd456-fc3a-431d-9d01-5bd8b8ac590f'
order by determined_at desc nulls last;

select 'pearl july total' as part,
       (menumaker.compute_monthly_claim(
          (select id from menumaker.centers where name='Play Academy Pearl'),'2026-07-01')
        ->'reimbursement'->>'total') as total;


-- ─────────────────────────────────────────────────────────────────────────────────────
-- 1. ДЕЙСТВИЕ ЧЕЛОВЕКА — ДВЕРЬ A, КАРТОЧКА РЕБЁНКА. SQL здесь НЕТ намеренно.
-- ─────────────────────────────────────────────────────────────────────────────────────
--
--   Children → Play Academy Pearl → Wheeler Elizabeth → карточка:
--     · Meal Status (FRP)  = F
--     · срок (frp_expires) ≥ 2026-07-01  — по канону 12 месяцев от ДАТЫ ДОКУМЕНТА
--     · провенанс: документ и дата с него
--     · Save
--
--   ⛔ НЕ вводить через «➕ Add Child» (дверь B): с 01.08 она пишет только `P` и носитель
--      не трогает — это и есть вариант «б», применённый в тот же день.
--   ⛔ НЕ вводить SQL'ем. Проба, обошедшая экран, не проверяет ничего, кроме SQL.


-- ─────────────────────────────────────────────────────────────────────────────────────
-- 2. READ-BACK «ПОСЛЕ». Сошлось = ВСЕ ЧЕТЫРЕ пункта, а не «деньги сошлись».
-- ─────────────────────────────────────────────────────────────────────────────────────
--
--   (1) появилась НОВАЯ строка носителя:  FY2026-27 · F · expires ≥ 2026-07-01
--                                         source='profile_edit'
--                                         determined_by_name = кто вводил (НЕ NULL)
--                                         determination_log +1
--   (2) старая строка FY2026 цела и НЕ тронута — forward-only. Если она изменилась,
--       проба ПРОВАЛЕНА, даже если деньги сошлись: правило важнее числа.
--   (3) июль по ребёнку:  P → F
--   (4) Pearl, июль:      +$209.03 против пересмотренного «до»

select 'carrier AFTER' as part, fiscal_year, eligibility, frp_expires::text, source,
       determined_by_name, determined_at::text,
       jsonb_array_length(coalesce(determination_log,'[]'::jsonb)) as log_entries
from menumaker.income_eligibility
where roster_id = 'a14cd456-fc3a-431d-9d01-5bd8b8ac590f'
order by determined_at desc nulls last;

-- Как июль считает её ТЕПЕРЬ (ожидается 'F'):
select 'counted as AFTER' as part,
       case when ie.eligibility in ('F','R')
             and (ie.frp_expires is null or ie.frp_expires >= date '2026-07-01')
            then ie.eligibility else 'P' end as counted_as
from menumaker.roster ro
left join lateral (
  select e.eligibility, e.frp_expires from menumaker.income_eligibility e
  where e.roster_id = ro.id
  order by e.frp_expires desc nulls last, e.determined_at desc nulls last limit 1
) ie on true
where ro.id = 'a14cd456-fc3a-431d-9d01-5bd8b8ac590f';

select 'pearl july total AFTER' as part,
       (menumaker.compute_monthly_claim(
          (select id from menumaker.centers where name='Play Academy Pearl'),'2026-07-01')
        ->'reimbursement'->>'total') as total;


-- ─────────────────────────────────────────────────────────────────────────────────────
-- 3. ЕСЛИ НЕ СОШЛОСЬ — ЧТО ЭТО ЗНАЧИТ. Написано заранее, чтобы результат не толковался
--    задним числом под желаемое.
-- ─────────────────────────────────────────────────────────────────────────────────────
--
--   носителя нет вовсе          → карточка пишет только roster.frp: дверь A ТОЖЕ течёт,
--                                 и тогда чинить надо её, а не Quick Add. Это меняет
--                                 приоритет всего блока F/R/P.
--   носитель есть, деньги нет   → расходятся правило носителя и правило заявки
--                                 (`compute_monthly_claim`): смотреть срок и fiscal_year.
--   старая строка изменилась    → нарушен forward-only. Останавливаться и разбираться
--                                 здесь, ничего больше не вводя: это дефект правила, а
--                                 не одного ребёнка.
--   деньги сошлись, но log пуст → определение не оставило следа: доказуемость перед
--                                 проверкой потеряна, хотя число верное.
--
-- ⚠️ ОДИН РЕБЁНОК — ЭТО ПРОБА, А НЕ ЗАЧИСТКА. Остальные 31 (стопки A и B, $3 972.95)
--    вводятся ТОЛЬКО после того, как эта проба сошлась по всем четырём пунктам.
--    Разбор стопок — docs/plans/2026-07-31c-frp-carrier-and-claim-surfaces.md §11.
