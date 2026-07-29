-- ============================================================================
-- 20260729b — meal_schedule перестаёт быть публичной.
-- Применено 29.07 утром, при свидетелях, второй в утренней партии.
--
-- ЧТО БЫЛО. Две permissive-политики, и они складываются по ИЛИ:
--   auth_manage   → USING(true) WITH CHECK(true)  TO PUBLIC   ← держит открытым
--   org_isolation → core.is_org_member(org_id)    TO PUBLIC
-- Пока рядом стоит `true`, вторая не удерживает ничего. PUBLIC означает, что
-- расписание кормлений читалось и правилось АНОНИМНЫМ ключом — единственная из
-- четырёх таблиц, доступная не залогиненному.
--
-- ЧЕГО ЗДЕСЬ НЕТ. Персональных данных: classroom_id · slot · start_time ·
-- end_time. 128 строк. Это про закрытие анонимной ЗАПИСИ, а не про приватность.
--
-- ⚠ ПРОВЕРЕНО ДО СУЖЕНИЯ, КАК ЗАКАЗЫВАЛ ВЛАДЕЛЕЦ: зависимости родительской
-- витрины и кита НЕТ. Читают только внутренние страницы — ScheduleHolidaysSettings,
-- MealCountPage, DailyTimeLogPage. В public/embed.js и в form-kit упоминаний нет.
-- Семьям сужение ничего не ломает.
--
-- ФОРМУЛА: свой в организации, по ОБОИМ источникам ролей. Оставить одну
-- org_isolation было НЕЛЬЗЯ — она читает core.memberships, где у бухгалтера
-- строки нет вовсе, и Daily Time Log у него бы опустел молча (замер 29.07).
-- ============================================================================

drop policy if exists auth_manage   on menumaker.meal_schedule;
drop policy if exists org_isolation on menumaker.meal_schedule;

create policy ms_scope on menumaker.meal_schedule
  for all to authenticated
  using      (menumaker.in_org(org_id))
  with check (menumaker.in_org(org_id));

comment on table menumaker.meal_schedule is
  'Область: свой в организации (20260729b). До этого — USING(true) TO PUBLIC, '
  'то есть анонимный ключ мог читать и ПРАВИТЬ расписание кормлений.';
