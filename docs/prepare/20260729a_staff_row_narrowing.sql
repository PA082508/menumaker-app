-- ============================================================================
-- ПОДГОТОВЛЕНО, НЕ ПРИМЕНЕНО. Применять УТРОМ, при свидетелях, по слову.
-- 20260729a — staff и staff_schedules перестают быть общими для всех логинов.
--
-- ЧТО ЗАКРЫВАЕТСЯ, НАЗВАННОЕ НОСИТЕЛЕМ, А НЕ РОЛЬЮ. Сегодня на staff и
-- staff_schedules стоит одна политика auth_manage с условием `true`: любой
-- вошедший видит и правит ВСЕ 105 строк персонала трёх центров — включая
-- ставку, оклад, домашний адрес и телефон. Носитель этого доступа — не
-- «сотрудник с правами», а ОБЩИЙ КУХОННЫЙ ПЛАНШЕТ, к которому физически
-- подходит любой, кто оказался на кухне.
--
-- КАЛИБРОВКА, ЧТОБЫ НЕ ЗВУЧАЛО СТРАШНЕЕ, ЧЕМ ЕСТЬ. Это ВНУТРЕННЯЯ экспозиция:
-- восемь логинов, все свои, наружу не течёт ничего. Но устройство без хозяина —
-- отдельная категория, и мерить её надо не доверием к людям, а тем, кто может
-- к ней подойти.
--
-- ФОРМУЛА: «СВОЙ ЦЕНТР ИЛИ ORG-РОЛЬ». Простое `center_id = any(my_center_ids())`
-- сломало бы сквозной вид, и это ЗАМЕРЕНО, а не предположено:
--
--   playacademyusa@gmail.com   admin           центров: 0
--   tatikogan1@gmail.com       office_manager  центров: 0
--   cctbills777@gmail.com      accountant      центров: 0
--
-- Все трое работают org-уровнем и НЕ ЧИСЛЯТСЯ НИ В ОДНОМ ЦЕНТРЕ. По центровой
-- формуле они увидели бы ноль строк — молча, без ошибки. Это ровно та ловушка,
-- что уже стоила нам живого теста в SafePass (my_center_ids() слеп к
-- General Director). Поэтому org-половина формулы обязательна.
--
-- ЧТО МЕНЯЕТСЯ ДЛЯ КОГО:
--   директор (1 центр)      → свои сотрудники, как и работал
--   офис-менеджер / админ   → все, как и работал (org-роль)
--   бухгалтер               → все (зарплата — org-уровень)
--   КУХОННЫЙ ПЛАНШЕТ        → только свой центр, вместо 105 строк трёх центров
--
-- ЧЕГО ЭТО НЕ ДЕЛАЕТ. Не решает вопрос «нужен ли повару доступ к staff вообще» —
-- это следующий, отдельный разговор. Здесь только арендатор.
--
-- pin_hash уже закрыт колонкой (20260728aa) и от этой миграции не зависит.
-- ============================================================================

-- ── staff ───────────────────────────────────────────────────────────────────
drop policy if exists auth_manage on menumaker.staff;

create policy staff_scope on menumaker.staff
  for all to authenticated
  using (
    center_id = any (menumaker.my_center_ids())
    or menumaker.is_org_owner(org_id)
    or core.has_org_role(org_id, array['admin','office_manager','accountant'])
  )
  with check (
    center_id = any (menumaker.my_center_ids())
    or menumaker.is_org_owner(org_id)
    or core.has_org_role(org_id, array['admin','office_manager','accountant'])
  );

-- ── staff_schedules ─────────────────────────────────────────────────────────
-- Своего center_id у расписания нет — оно наследует область у сотрудника.
drop policy if exists auth_manage on menumaker.staff_schedules;

create policy staff_sched_scope on menumaker.staff_schedules
  for all to authenticated
  using (exists (
    select 1 from menumaker.staff s
     where s.id = staff_schedules.staff_id
       and (s.center_id = any (menumaker.my_center_ids())
            or menumaker.is_org_owner(s.org_id)
            or core.has_org_role(s.org_id, array['admin','office_manager','accountant']))
  ))
  with check (exists (
    select 1 from menumaker.staff s
     where s.id = staff_schedules.staff_id
       and (s.center_id = any (menumaker.my_center_ids())
            or menumaker.is_org_owner(s.org_id)
            or core.has_org_role(s.org_id, array['admin','office_manager','accountant']))
  ));

comment on table menumaker.staff is
  'Область: свой центр ИЛИ org-роль (20260729a). Org-половина обязательна: '
  'админ, офис-менеджер и бухгалтер не числятся ни в одном центре и по чисто '
  'центровой формуле увидели бы ноль строк молча.';
