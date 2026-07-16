-- 20260718_door_scope_and_deny_teacher.sql
--
-- ⚠️ PREPARED — NOT APPLIED. Live-DB protocol: применяю моими руками после go.
--
-- DRY RUN 2026-07-16 — весь пакет выполнен на ЖИВОЙ базе в транзакции и откачен,
-- проверки из СИДЕНИЙ (postgres обходит RLS и ничего не доказывает):
--   двери помечены: 3
--   ДВЕРЬ RIDGE видит 272 строки roster (было 621) ← (а) сработала
--     update ребёнка PEARL → 0 строк   ← дыра закрыта
--     update ребёнка RIDGE → 1 строка  ← кухня жива
--     insert ребёнка       → 0         ← дверь детей не создаёт
--   ДИРЕКТОР видит 621                 ← не задет
--
-- ⚠️ ПЕРВЫЙ ПРОГОН ПОЙМАЛ КАТАСТРОФУ, и она стоит того, чтобы её запомнить:
--   у роли `authenticated` НЕТ SELECT на core.user_center_access. Подзапрос к ней
--   ПРЯМО В ПОЛИТИКЕ падает с `permission denied` и роняет чтение ростера ДЛЯ ВСЕХ,
--   а не только для двери. Поэтому центры резолвит SECURITY DEFINER `my_center_ids()`.
--   Тот же приём уже стоял в 20260716b и 20260717c — я его нарушил, dry-run поймал.
-- Spec: docs/specs/identity-teacher-spec.md §3, §5.
--
-- ДВЕ ЛОВУШКИ ИЗ HANDOFF:
--   (а) дверь пишет в roster ВСЕЙ организации → сузить до своего центра
--   (б) deny_teacher RESTRICTIVE ALL-deny → будущая роль teacher убьёт ростер
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ⚠️ ПОРЯДОК И ПРЕДУСЛОВИЕ — ЧИТАТЬ ДО GO
-- ═══════════════════════════════════════════════════════════════════════════
-- (а) НЕЛЬЗЯ применить раньше, чем сервис-аккаунты дверей станут ОТЛИЧИМЫ от живых
-- поваров. Сегодня и дверь, и настоящий повар — `role='cook'`, и `get_user_role()`
-- возвращает им одно и то же. Любое сужение прав «повара» **срежет живую кухню в трёх
-- центрах**. Это шаг 0 и он не бесплатный — см. §A ниже.
--
-- (б) БЕЗОПАСНА СЕЙЧАС: роли `teacher` не существует ни в `core.memberships`, ни в
-- `menumaker.user_roles` (0 строк), поэтому обе редакции политики — старая и новая —
-- сегодня не матчат никого. Правка меняет только то, ЧТО СЛУЧИТСЯ в день появления роли.
-- **(б) можно катить отдельно от (а).**

begin;

-- ═══════════════════════════════════════════════════════════════════════════
-- §A. ШАГ 0 — отличимость сервис-аккаунта двери
-- ═══════════════════════════════════════════════════════════════════════════
-- Без этого (а) невозможна. Признак ставится на membership, а не на email: соглашение
-- «+ridge.cook@» — это строка, которую однажды напишут иначе, и права разъедутся молча.
alter table core.memberships
  add column if not exists is_service_account boolean not null default false;

comment on column core.memberships.is_service_account is
  'true = общий пер-центровый сервис-аккаунт двери (/portal/cook|teacher/<slug>), а не человек. '
  'Двери дают УЖЕ прав, чем живому повару: см. 20260718. Ставится вручную при провижининге.';

-- ⚠️ РАЗМЕТКА: строки НЕ проставляются здесь. Пометить три двери должен человек,
--    глядя на список — автоматическая догадка по email это ровно та хрупкость,
--    от которой мы уходим. После apply выполнить, СВЕРИВ глазами:
--
--    update core.memberships m set is_service_account = true
--     from auth.users u
--    where u.id = m.user_id
--      and u.email in ('playacademyusa+ridge.cook@gmail.com',
--                      'playacademyusa+pearl.cook@gmail.com',
--                      'playacademyusa+alpha.cook@gmail.com');
--    -- ожидаем ровно 3 строки. Живые повара (если появятся) — НЕ трогать.

-- Центры вызывающего. SECURITY DEFINER — ОБЯЗАТЕЛЬНО, а не стилистика:
-- у роли `authenticated` НЕТ SELECT на core.user_center_access, поэтому подзапрос к ней
-- ПРЯМО В ПОЛИТИКЕ падает с `permission denied for table user_center_access` — и роняет
-- чтение ростера ДЛЯ ВСЕХ, не только для двери. Поймано dry-run'ом 2026-07-16.
-- Тот же приём уже применён в 20260716b (avatar_center_allowed) и 20260717c (can_see_message).
create or replace function menumaker.my_center_ids()
returns uuid[]
language sql stable security definer set search_path to ''
as $function$
  select coalesce(array_agg(uca.center_id), '{}'::uuid[])
    from core.user_center_access uca
   where uca.user_id = auth.uid() and uca.is_active
$function$;
revoke execute on function menumaker.my_center_ids() from public, anon;
grant  execute on function menumaker.my_center_ids() to authenticated;

create or replace function menumaker.is_door_account()
returns boolean
language sql stable security definer set search_path to ''
as $function$
  select coalesce((
    select m.is_service_account
      from core.memberships m
     where m.user_id = auth.uid() and m.org_id = core.current_org()
     limit 1), false)
$function$;
revoke execute on function menumaker.is_door_account() from public, anon;
grant  execute on function menumaker.is_door_account() to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- §B. (а) — дверь пишет только photo_url и только в своём центре
-- ═══════════════════════════════════════════════════════════════════════════
-- ЗАМЕР ДО (2026-07-16, из сиденья повара Ridge, запись откачена):
--   видит 621 строку roster — ВСЯ организация, все три центра
--   UPDATE ребёнка PEARL → 1 row updated ✅ прошёл
-- Причина: PERMISSIVE `auth_manage FOR ALL TO authenticated USING (true)`, а ограничители —
-- `org_isolation` (ORG-уровень!) и `module_cacfp_active`. Центрового ограничения в RLS
-- ростера НЕТ ВООБЩЕ. Центр-лок живёт только в URL (PortalPage, «UI-only»).
--
-- Что делаем: НЕ трогаем права людей. Добавляем RESTRICTIVE-политику, которая
-- ограничивает ТОЛЬКО двери. Для всех остальных выражение = true, то есть no-op.
-- Дверь читает ТОЛЬКО свой центр. Это не косметика: без этого замер остаётся 621.
create policy door_read_scope on menumaker.roster
  as restrictive for select to authenticated
  using (
    not menumaker.is_door_account()
    or center_id = any (menumaker.my_center_ids())
  );

-- Дверь пишет ТОЛЬКО в своём центре.
create policy door_write_scope on menumaker.roster
  as restrictive for update to authenticated
  using (
    not menumaker.is_door_account()
    or center_id = any (menumaker.my_center_ids())
  )
  with check (
    not menumaker.is_door_account()
    or center_id = any (menumaker.my_center_ids())
  );

-- Дверь не создаёт и не удаляет детей: это делают Add Child / Approve, а не iPad.
create policy door_no_insert on menumaker.roster
  as restrictive for insert to authenticated
  with check (not menumaker.is_door_account());
create policy door_no_delete on menumaker.roster
  as restrictive for delete to authenticated
  using (not menumaker.is_door_account());

-- ⚠️ КОЛОНОЧНОЕ ограничение (только photo_url) политикой НЕ выражается — RLS работает
--    построчно, не поколоночно. Правильный инструмент — column-level grant, но он
--    действует на РОЛЬ Postgres (`authenticated`), а не на конкретного пользователя,
--    поэтому урезал бы и директора. Значит «дверь пишет только photo_url» = **узкий RPC**
--    (identity-спека §3.1, вариант «б»), а не грант. Здесь закрывается ЦЕНТР; колонка —
--    отдельный шаг вместе с PIN-подписью.

-- ═══════════════════════════════════════════════════════════════════════════
-- §C. (б) — deny_teacher: write-deny + scoped read вместо ALL-deny
-- ═══════════════════════════════════════════════════════════════════════════
-- Принцип СОХРАНЯЕТСЯ (слово Николая): учителю по-прежнему запрещено всё, кроме явно
-- названного. Меняется только то, что случится в день появления роли: сегодня ALL-deny
-- отнял бы и ЧТЕНИЕ, то есть убил бы экран Attendance, ради которого роль и вводят.
--
-- roster: запись запрещена; чтение — только свой центр.
drop policy if exists deny_teacher on menumaker.roster;

create policy deny_teacher_write on menumaker.roster
  as restrictive for update to authenticated
  using (not core.has_org_role(org_id, array['teacher']))
  with check (not core.has_org_role(org_id, array['teacher']));
create policy deny_teacher_insert on menumaker.roster
  as restrictive for insert to authenticated
  with check (not core.has_org_role(org_id, array['teacher']));
create policy deny_teacher_delete on menumaker.roster
  as restrictive for delete to authenticated
  using (not core.has_org_role(org_id, array['teacher']));

-- ЧТЕНИЕ: учителю — только свой центр. Всем остальным — как было.
create policy teacher_scoped_read on menumaker.roster
  as restrictive for select to authenticated
  using (
    not core.has_org_role(org_id, array['teacher'])
    or center_id = any (menumaker.my_center_ids())
  );

-- guardian: ПОЛНЫЙ запрет без исключений (слово Николая). ALL-deny здесь и остаётся —
-- родительские контакты учителю не нужны ни на чтение, ни на запись.
-- Политика не трогается. Записано, чтобы никто не «унифицировал» её с roster.

commit;

-- ═══════════════════════════════════════════════════════════════════════════
-- READ-BACK ПОСЛЕ ПРИМЕНЕНИЯ — из СИДЕНИЙ, не из postgres (он обходит RLS)
-- ═══════════════════════════════════════════════════════════════════════════
-- 0. ПЕРЕД (а): пометить три двери (§A) и убедиться, что ровно 3.
-- 1. Дверь Ridge:
--      select count(*) from menumaker.roster;                    → 272 (был 621) ← (а) сработала
--        (272 = ВСЕ строки Ridge, активные и нет: политика скоупит по центру, не по is_active.
--         138 — это только активные; не перепутать, как перепутал я в первой редакции.)
--      update menumaker.roster set first_name=first_name
--       where id = <ребёнок Pearl>;                              → 0 rows ← дыра закрыта
--      update ... where id = <ребёнок Ridge>;                    → 1 row  ← кухня жива
-- 2. ЖИВОЙ повар (если появится) и директор: счётчики НЕ изменились.
-- 3. Meal Count на всех трёх дверях грузится (он читает v_meal_grid, не сырой roster —
--    проверить ПРОБОЙ, а не рассуждением: MealCountPage.tsx:9-11 утверждает, что сырой
--    roster под cook пуст, а замер 2026-07-16 показал 621 строку. Комментарий врёт.)
-- 4. (б) проверяется только созданием тестового membership role='teacher' в транзакции
--    с откатом: чтение своего центра ✅, чужого ⛔, любая запись ⛔, guardian ⛔.
--
-- ROLLBACK:
--   drop policy if exists door_read_scope on menumaker.roster;
--   drop policy if exists door_write_scope on menumaker.roster;
--   drop policy if exists door_no_insert on menumaker.roster;
--   drop policy if exists door_no_delete on menumaker.roster;
--   drop policy if exists door_no_insert on menumaker.roster;
--   drop policy if exists door_no_delete on menumaker.roster;
--   drop policy if exists deny_teacher_write on menumaker.roster;
--   drop policy if exists deny_teacher_insert on menumaker.roster;
--   drop policy if exists deny_teacher_delete on menumaker.roster;
--   drop policy if exists teacher_scoped_read on menumaker.roster;
--   create policy deny_teacher on menumaker.roster as restrictive for all to authenticated
--     using (not core.has_org_role(org_id, array['teacher']));
--   drop function if exists menumaker.is_door_account();
--   drop function if exists menumaker.my_center_ids();
--   alter table core.memberships drop column if exists is_service_account;
