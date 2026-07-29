-- ============================================================================
-- 20260729a — staff и staff_schedules перестают быть общими для всех логинов.
-- Применено 29.07 утром, при свидетелях. Read-back — в docs/maintenance/2026-07-29.md.
--
-- ЧТО ЗАКРЫВАЕТСЯ, НАЗВАННОЕ НОСИТЕЛЕМ, А НЕ РОЛЬЮ. До этой миграции на staff и
-- staff_schedules стояла одна политика auth_manage с условием `true`: любой
-- вошедший видел и правил ВСЕ 105 строк персонала трёх центров — включая
-- ставку, оклад, домашний адрес и телефон. Носитель этого доступа — не
-- «сотрудник с правами», а ОБЩИЙ КУХОННЫЙ ПЛАНШЕТ, к которому физически
-- подходит любой, кто оказался на кухне.
--
-- КАЛИБРОВКА, ЧТОБЫ НЕ ЗВУЧАЛО СТРАШНЕЕ, ЧЕМ ЕСТЬ. Это ВНУТРЕННЯЯ экспозиция:
-- восемь логинов, все свои, наружу не течёт ничего. Но устройство без хозяина —
-- отдельная категория, и мерить её надо не доверием к людям, а тем, кто может
-- к ней подойти.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- ПОПРАВКА УТРА 29.07: ВЕЧЕРНЯЯ ФОРМУЛА ОСЛЕПИЛА БЫ БУХГАЛТЕРА.
--
-- Вечерняя редакция брала org-половину из core.has_org_role(...). Утренний
-- замер ПОД КАЖДЫМ ИЗ ДЕВЯТИ ЛОГИНОВ, до применения, показал:
--
--   playacademyusa@gmail.com  admin           → 105 ✅ (core.memberships: admin)
--   tatikogan1@gmail.com      office_manager  → 105 ✅ (core.memberships: office_manager)
--   cctbills777@gmail.com     accountant      →   0 🔴
--
-- Причина названа замером, а не догадкой: у бухгалтера НЕТ СТРОКИ в
-- core.memberships вообще. Его роль живёт только в menumaker.user_roles — три
-- строки, по одной на центр, org_id проставлен. core.has_org_role читает
-- core.memberships и для него не вернёт true никогда.
--
-- Это ровно та ловушка, о которой предупреждал сам чек-лист («пустой список =
-- провал»), — и вечерний замер её не поймал, потому что мерил «сколько центров»,
-- а не «сколько строк увидит». Считать надо конечный ответ экрана, а не входные
-- данные формулы.
--
-- ПОЭТОМУ org-половина спрашивает ОБА источника ролей — menumaker.in_org().
-- ─────────────────────────────────────────────────────────────────────────────
--
-- ЧТО МЕНЯЕТСЯ ДЛЯ КОГО (замерено под каждым логином, цифры ниже — прогноз,
-- совпавший с read-back после применения):
--   директор Pearl          →  16 своих (было 105)
--   директор Ridge          →  65 своих (было 105)
--   директор Alpha          →  24 своих (было 105)
--   офис-менеджер / админ   → 105, как и работал
--   бухгалтер               → 105 (зарплата — org-уровень)
--   КУХОННЫЙ ПЛАНШЕТ        → только свой центр: 16 / 24 / 65 вместо 105
--
-- ЧЕГО ЭТО НЕ ДЕЛАЕТ. Не решает вопрос «нужен ли повару доступ к staff вообще» —
-- это следующий, отдельный разговор. Здесь только арендатор.
--
-- pin_hash уже закрыт колонкой (20260728aa) и от этой миграции не зависит.
-- ============================================================================

-- ── половина «org-роль», спрашивающая ОБА источника ──────────────────────────
-- SECURITY DEFINER: политике нельзя зависеть от RLS на таблице ролей.
create or replace function menumaker.in_org(p_org uuid, p_roles text[] default null)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select exists (
           select 1 from core.memberships m
            where m.org_id = p_org and m.user_id = auth.uid()
              and (p_roles is null or m.role = any (p_roles))
         )
      or exists (
           select 1 from menumaker.user_roles ur
            where ur.org_id = p_org and ur.user_id = auth.uid()
              and (p_roles is null or ur.role = any (p_roles))
         );
$$;

comment on function menumaker.in_org(uuid, text[]) is
  'Членство в организации по ОБОИМ источникам ролей: core.memberships И '
  'menumaker.user_roles. Один источник спрашивать нельзя: у бухгалтера строки в '
  'core.memberships нет вовсе (замер 29.07), у офис-менеджера — есть в обоих.';

-- ── staff ───────────────────────────────────────────────────────────────────
drop policy if exists auth_manage on menumaker.staff;

create policy staff_scope on menumaker.staff
  for all to authenticated
  using (
    center_id = any (menumaker.my_center_ids())
    or menumaker.in_org(org_id, array['admin','office_manager','accountant'])
  )
  with check (
    center_id = any (menumaker.my_center_ids())
    or menumaker.in_org(org_id, array['admin','office_manager','accountant'])
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
            or menumaker.in_org(s.org_id, array['admin','office_manager','accountant']))
  ))
  with check (exists (
    select 1 from menumaker.staff s
     where s.id = staff_schedules.staff_id
       and (s.center_id = any (menumaker.my_center_ids())
            or menumaker.in_org(s.org_id, array['admin','office_manager','accountant']))
  ));

comment on table menumaker.staff is
  'Область: свой центр ИЛИ org-роль (20260729a). Org-половина обязательна и '
  'обязана спрашивать ОБА источника ролей: админ, офис-менеджер и бухгалтер не '
  'числятся ни в одном центре, а у бухгалтера нет строки в core.memberships — '
  'по чисто центровой формуле все трое увидели бы ноль строк молча.';
