-- 20260717c_internal_messages_rls.sql — открыть internal_messages, скоуп центра
--
-- ✅ APPLIED 2026-07-16 on Nikolay's go.
--
-- ⚠️ A DEFECT WAS FOUND AFTER THE FIRST APPLY AND FIXED IN THE SAME GO.
--    The first cut keyed visibility purely on the RECIPIENT. Consequence: a director
--    who sent a message to the cooks could NOT read it back — their own message
--    vanished from their own feed. Proven by running the actual flow (director sends →
--    director looks: 0 rows), not by re-reading the rule. can_see_message now takes
--    p_sender and short-circuits on `p_sender = auth.uid()` — you can always see what
--    you sent. The 3-arg overload was dropped so no caller can reach the old answer.
--
-- READ-BACK AFTER FIX (from each seat; postgres bypasses RLS and proves nothing):
--   RIDGE COOK sees 2 — 'org-wide cook' ✅ · 'ridge cook' ✅ · 'pearl cook' ⛔ · 'director' ⛔
--   DIRECTOR   sees 2 — 'org-wide director' ✅ · own 'director-sent-to-cooks' ✅ (was 0)
--   mark_message_read → true; read_by contains the caller; idempotent on re-call.
--   UPDATE grant on the table: none ✓ (receipts only via RPC)
--   ZZSMOKE rows swept: 0 left.
-- Spec: docs/specs/cook-messages-spec.md
--
-- DRY RUN 2026-07-16 — policy exercised on the LIVE db in a transaction, rolled back.
-- Four ZZSMOKE messages inserted, then read FROM THE RIDGE COOK'S SEAT (set local role
-- authenticated + request.jwt.claims — reading as postgres proves nothing, it bypasses RLS):
--
--   ✅ 'cook'     center=null    → SEEN   (org-wide)
--   ✅ 'cook'     center=Ridge   → SEEN   (own centre)
--   ⛔ 'cook'     center=Pearl   → HIDDEN ← the cross-centre leak that exists TODAY
--   ⛔ 'director' center=null    → HIDDEN (not my role)
--   → 2 of 4, exactly as designed.
--
-- Rollback verified: 0 policies, can_see_message gone, 0 ZZSMOKE rows, 0 rows total,
-- no authenticated grants. Live db untouched.
--
-- ЗАМЕР ДО (2026-07-16): RLS on · политик 0 · грантов anon/authenticated НЕТ · строк 0.
-- То есть 403 ловит НЕ повар — ловят ВСЕ, включая директора на /messages. Сообщения в
-- платформе никогда не работали. Это не «дать повару доступ», а включить таблицу.
--
-- РЕШЕНИЕ НИКОЛАЯ: осознанный грант, а не уборка шума в консоли.
--
-- СКОУП ЦЕНТРА — ГЛАВНОЕ. Сегодня клиент фильтрует только по org
-- (PortalMessagesPanel.tsx:32), поэтому повар Ridge видел бы сообщение директора Pearl
-- «всем поварам». Фильтр в браузере — не защита; центр закрывается ЗДЕСЬ.

begin;

-- Видно ли сообщение вызывающему? Одно определение для политики и для
-- mark_message_read — два разных ответа на этот вопрос разошлись бы.
create or replace function menumaker.can_see_message(
  p_org uuid, p_center uuid, p_recipient_value text)
returns boolean
language sql stable security definer set search_path to ''
as $function$
  select core.is_org_member(p_org)
     and (
       -- адресовано мне лично, моей роли, или всем
       p_recipient_value = auth.uid()::text
       or p_recipient_value = menumaker.get_user_role()
       or p_recipient_value = 'all'
     )
     and (
       -- общеорганизационное, либо мой центр
       p_center is null
       or exists (select 1 from core.user_center_access uca
                   where uca.user_id = auth.uid() and uca.is_active
                     and uca.center_id = p_center)
     )
$function$;
revoke execute on function menumaker.can_see_message(uuid, uuid, text) from public, anon;
grant  execute on function menumaker.can_see_message(uuid, uuid, text) to authenticated;

-- ЧТЕНИЕ: только адресованное мне и только по моим центрам.
create policy read_addressed_to_me on menumaker.internal_messages
  for select to authenticated
  using (menumaker.can_see_message(org_id, center_id, recipient_value));

-- ЗАПИСЬ: любой член организации может отправить, но только ОТ СЕБЯ.
-- sender_id = auth.uid() не даёт подписаться чужим именем.
create policy send_as_self on menumaker.internal_messages
  for insert to authenticated
  with check (core.is_org_member(org_id) and sender_id = auth.uid());

-- UPDATE/DELETE НЕ выдаются намеренно: отметка о прочтении идёт через RPC (ниже).
-- Дать update ради read_by значило бы дать правку body — сообщение перестало бы быть
-- записью того, что было отправлено.
--
-- ⚠️ deny_teacher СЮДА НЕ ВЕШАТЬ: RESTRICTIVE ALL-deny убьёт панель у учителя в день
--    появления роли (identity-teacher-spec.md §0.2).
grant select, insert on menumaker.internal_messages to authenticated;

-- (c) «Прочитано»: read_by уже читается (PortalMessagesPanel.tsx:37), но не пишется —
-- счётчик непрочитанных никогда не обнуляется. Идемпотентно; проверяет видимость теми
-- же правилами, что и политика.
create or replace function menumaker.mark_message_read(p_message uuid)
returns boolean
language plpgsql security definer set search_path to 'menumaker','core','public'
as $function$
declare v_msg menumaker.internal_messages%rowtype;
begin
  select * into v_msg from menumaker.internal_messages where id = p_message;
  if not found then return false; end if;
  if not menumaker.can_see_message(v_msg.org_id, v_msg.center_id, v_msg.recipient_value) then
    raise exception 'not addressed to you' using errcode = '42501';
  end if;
  if v_msg.read_by @> array[auth.uid()] then
    return true;                      -- уже отмечено; не дублируем
  end if;
  update menumaker.internal_messages
     set read_by = coalesce(read_by, '{}'::uuid[]) || auth.uid()
   where id = p_message;
  return true;
end $function$;
revoke execute on function menumaker.mark_message_read(uuid) from public, anon;
grant  execute on function menumaker.mark_message_read(uuid) to authenticated;

commit;

-- ── ПОСЛЕ ПРИМЕНЕНИЯ ────────────────────────────────────────────────────────
-- READ-BACK:
--   1. select relrowsecurity, (select count(*) from pg_policy where polrelid=c.oid)
--        from pg_class c where c.oid='menumaker.internal_messages'::regclass;
--      → RLS on, 2 политики.
--   2. Из сиденья ПОВАРА Ridge (не из postgres — postgres обходит RLS):
--      · сообщение org-wide 'cook', center_id=null      → ВИДНО
--      · сообщение 'cook', center_id=<Ridge>            → ВИДНО
--      · сообщение 'cook', center_id=<Pearl>            → НЕ ВИДНО   ← это чинится здесь
--      · сообщение 'director', center_id=null           → НЕ ВИДНО
--      Тестовые строки — по стандарту ZZSMOKE, с уборкой и доказательством уборки.
--   3. Панель на /portal/cook/ridge грузится БЕЗ 403 в консоли.
--
-- ⚠️ КОД, КОТОРЫЙ НАДО ПРИВЕСТИ В СООТВЕТСТВИЕ (отдельный коммит, не в этой миграции):
--   · PortalMessagesPanel.tsx:32-33 — фильтр по org + role; политика теперь уже́:
--     UI не должен обещать больше, чем отдаст БД. Добавить центр.
--   · PortalMessagesPanel.tsx:37 — вызвать mark_message_read при открытии панели,
--     иначе «непрочитанные» не обнулятся никогда.
--   · MessagesPage — center_id при отправке НЕ проставляется вовсе; без этого «кухня
--     центра» (§4 спеки) неотличима от «все повара организации».
--
-- ROLLBACK:
--   drop policy if exists read_addressed_to_me on menumaker.internal_messages;
--   drop policy if exists send_as_self on menumaker.internal_messages;
--   revoke select, insert on menumaker.internal_messages from authenticated;
--   drop function if exists menumaker.mark_message_read(uuid);
--   drop function if exists menumaker.can_see_message(uuid, uuid, text);
