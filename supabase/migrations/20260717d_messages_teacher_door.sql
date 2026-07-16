-- 20260717d_messages_teacher_door.sql — чтобы канал «директор → учителя» доходил
--
-- ⚠️ PREPARED — NOT APPLIED. Awaiting Nikolay's go.
--
-- ЗАКАЗ (2026-07-16): «Учительская дверь: ДА, получает сообщения — так и задумано
-- (канал директор→учителя: расписание, объявления)».
--
-- ЗАМЕР: СЕГОДНЯ ЭТОТ КАНАЛ НЕ ДОХОДИТ НИ ДО КОГО.
--   Дверь Ridge: get_user_role() = 'cook'
--   Сообщение директора с recipient_value='teacher', center_id=Ridge → дверь видит 0.
--   Причина: в menumaker.user_roles РОВНО НОЛЬ строк с ролью 'teacher'
--   ([[menumaker-no-teacher-role]]), а /portal/teacher/<slug> и /portal/cook/<slug> —
--   это ОДИН И ТОТ ЖЕ сервис-аккаунт центра (PortalPage.tsx:23-33,
--   PORTAL_ROLES: teacher → ['cook']).
--
-- ЧТО ЭТО ЗНАЧИТ ЧЕСТНО. «Директор → учителя» сегодня физически не отличимо от
-- «директор → кухня»: обе двери — один логин. Различить их в БД невозможно, потому
-- что различия НЕТ. Поэтому:
--
--   ⚠️ После этой миграции сообщение «учителям Ridge» увидит и повар Ridge —
--      не потому что мы ослабили границу, а потому что это тот же самый iPad и тот же
--      самый аккаунт. Ничего не раскрывается сверх уже раскрытого.
--
--   Настоящий канал «только учителям» = отдельная личность у учителя, то есть PIN /
--   identity (docs/specs/identity-teacher-spec.md). До него «директор → учителя»
--   правильно читать как **«директор → двери этого центра»**.
--
-- АЛЬТЕРНАТИВА, КОТОРУЮ Я НЕ ВЫБРАЛ: завести роль 'teacher' в user_roles для дверей.
-- Это выглядит чище — и включает RESTRICTIVE deny_teacher на roster/guardian, то есть
-- мгновенно убивает кухне ростер ([[menumaker-no-teacher-role]], identity-спека §0.2).
-- Роль 'teacher' нельзя вводить раньше, чем сужен deny_teacher. Здесь — не место.

begin;

-- Какие recipient_value адресованы этой двери. Отдельная функция, чтобы «кто такой
-- получатель» имело ОДНО определение, а не расползлось по политике и по клиенту.
create or replace function menumaker.message_roles_for_me()
returns text[]
language sql stable security definer set search_path to ''
as $function$
  select case menumaker.get_user_role()
    -- Дверь центра логинится как 'cook' и обслуживает ОБЕ поверхности
    -- (/portal/cook/<slug> и /portal/teacher/<slug>) — это один аккаунт.
    -- Пока учитель не получил собственную личность, дверь адресуема обоими именами.
    when 'cook' then array['cook','teacher']
    else array[menumaker.get_user_role()]
  end
$function$;
revoke execute on function menumaker.message_roles_for_me() from public, anon;
grant  execute on function menumaker.message_roles_for_me() to authenticated;

create or replace function menumaker.can_see_message(
  p_org uuid, p_center uuid, p_recipient_value text, p_sender uuid default null)
returns boolean
language sql stable security definer set search_path to ''
as $function$
  select core.is_org_member(p_org)
     and (
       p_sender = auth.uid()                       -- своё отправленное видно всегда
       or (
         (
           p_recipient_value = auth.uid()::text
           or p_recipient_value = any (menumaker.message_roles_for_me())
           or p_recipient_value = 'all'
         )
         and (
           p_center is null
           or exists (select 1 from core.user_center_access uca
                       where uca.user_id = auth.uid() and uca.is_active
                         and uca.center_id = p_center)
         )
       )
     )
$function$;

commit;

-- ── READ-BACK ПОСЛЕ ПРИМЕНЕНИЯ (из сиденья двери Ridge, не из postgres) ─────
--   'teacher' + center=Ridge  → ВИДНО   ← то, что чинится
--   'cook'    + center=Ridge  → ВИДНО   (как и было)
--   'teacher' + center=Pearl  → НЕ ВИДНО (центр по-прежнему держит)
--   'director'+ center=null   → НЕ ВИДНО
--   Директор: 'teacher' своего центра → НЕ ВИДНО (не его роль), но своё отправленное → ВИДНО.
--
-- ── ROLLBACK ────────────────────────────────────────────────────────────────
--   Вернуть can_see_message из 20260717c (ветка `p_recipient_value = get_user_role()`)
--   и: drop function if exists menumaker.message_roles_for_me();
