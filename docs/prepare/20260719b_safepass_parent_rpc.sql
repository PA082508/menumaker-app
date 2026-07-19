-- 20260719b_safepass_parent_rpc.sql
-- PREPARED 2026-07-19 · NOT APPLIED · требует go
--
-- ЗАЧЕМ. Родительский путь /safepass/parent работает под anon. У anon НЕТ прав на
-- menumaker.safepass_sessions (замер 19.07: anon_insert=false, anon_update=false,
-- и ни одной permissive-политики для anon на SELECT). Значит СЕЙЧАС не работает
-- ничего из четырёх обращений страницы к этой таблице:
--
--   SafePassParentPage.tsx:137  чтение сегодняшних заявок   → 0 строк (RLS)
--   SafePassParentPage.tsx:151  INSERT заявки (Drop/Pick)   → 42501 permission denied
--   SafePassParentPage.tsx:161  realtime-подписка на UPDATE → RLS фильтрует → тишина
--   SafePassParentPage.tsx:173  UPDATE «Remind»             → 42501
--
-- Ни одно из них не связывает error, поэтому недельный отказ выглядел как тишина.
-- Клиентская правка classroom_id этого НЕ лечит — права ниже уровня той правки.
--
-- TRUST-РАМКА (читать до кода):
--   Заявка ≠ выдача. Эти функции создают только НАМЕРЕНИЕ родителя. Ребёнка отдаёт
--   человек: учитель на планшете, по PIN, глядя на пришедшего. Ослабить опознание
--   этот файл не может и не должен — safepass_confirm_handoff остаётся единственной
--   дверью к status='confirmed'.
--   Упрочнение самой заявки (подпись OTP-сессии вместо доверия телефону в аргументе)
--   — post-pilot. Сегодня телефон в аргументе не хуже, чем было: OTP и так
--   генерируется в браузере родителя, доверия там нет ни на грош.
--   Не оракул перебора: «телефон не знаем» и «телефон знаем, но не для этого
--   ребёнка» отвечают ОДИНАКОВО — not_authorized. По ответу нельзя узнать,
--   зарегистрирован ли номер.
--
-- ⚠️ ОТДЕЛЬНАЯ НАХОДКА, НЕ ЧАСТЬ ЭТОГО ФАЙЛА (нужен свой go):
--   политика «trusted persons read» = {public} SELECT qual=TRUE. То есть
--   menumaker.safepass_trusted_persons читает КТО УГОДНО без входа: имена всех
--   детей организации и телефоны родителей. Вот где настоящий оракул перебора —
--   куда крупнее, чем ответ RPC. Список детей на странице держится ровно на этой
--   дыре, поэтому §3 ниже даёт замену; снятие политики — отдельным ходом, после
--   того как клиент перейдёт на §3.

begin;

-- §1 ── создать заявку ────────────────────────────────────────────────────────
-- NB: child_id в обеих safepass-таблицах имеет тип TEXT (roster.id — uuid),
-- поэтому аргумент text и join через ::text. Проверено по схеме 19.07.
create or replace function menumaker.safepass_request_handoff(
  p_phone     text,
  p_child_id  text,
  p_action    text,
  p_device_id text default null
) returns jsonb
language plpgsql security definer set search_path = menumaker, public as $$
declare
  v_tp      record;
  v_class   uuid;
  v_id      uuid;
begin
  if p_action not in ('drop_off','pick_up') then
    raise exception 'bad action';
  end if;

  -- доверенное лицо ИМЕННО для этого ребёнка. Один слитный отказ на оба случая
  -- («номера нет» / «номер есть, но не для этого ребёнка») — см. trust-рамку.
  select * into v_tp from menumaker.safepass_trusted_persons
   where phone = p_phone and child_id = p_child_id and is_active
   limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_authorized');
  end if;

  -- КОМНАТА БЕРЁТСЯ ЗДЕСЬ, НА СЕРВЕРЕ (DECISIONS:210). У клиента под anon нет
  -- читаемого roster, поэтому хардкод '' на клиенте был не ленью, а следствием.
  select r.classroom_id into v_class
    from menumaker.roster r
   where r.id::text = p_child_id and r.is_active
   limit 1;
  if v_class is null then
    return jsonb_build_object('ok', false, 'error', 'no_classroom');
  end if;

  -- одна открытая заявка на ребёнка: повторное нажатие возвращает ту же строку,
  -- а не плодит очередь на планшете
  select id into v_id from menumaker.safepass_sessions
   where child_id = p_child_id and status = 'waiting'
     and created_at >= date_trunc('day', now())
   limit 1;
  if v_id is not null then
    return jsonb_build_object('ok', true, 'session_id', v_id, 'reused', true);
  end if;

  insert into menumaker.safepass_sessions(
    org_id, center_id, classroom_id, child_id, child_name,
    action_type, status, auth_method, parent_device_id,
    trusted_person_name, person_initiated_at)
  values (
    v_tp.org_id, v_tp.center_id, v_class, p_child_id, v_tp.child_name,
    p_action, 'waiting', 'app', p_device_id,
    v_tp.person_name, now())
  returning id into v_id;

  return jsonb_build_object('ok', true, 'session_id', v_id, 'reused', false);
end $$;

-- §2 ── прочитать свои заявки за сегодня (замена и чтению, и realtime) ────────
-- realtime под anon невозможен в принципе: postgres_changes уважает RLS, а
-- permissive-политики для anon нет. Клиент опрашивает эту функцию.
create or replace function menumaker.safepass_parent_sessions(
  p_phone    text,
  p_child_id text
) returns jsonb
language plpgsql security definer set search_path = menumaker, public as $$
declare v_ok boolean;
begin
  select exists(select 1 from menumaker.safepass_trusted_persons
                 where phone = p_phone and child_id = p_child_id and is_active)
    into v_ok;
  if not v_ok then
    return jsonb_build_object('ok', false, 'error', 'not_authorized');
  end if;

  return jsonb_build_object('ok', true, 'sessions', coalesce((
    select jsonb_agg(to_jsonb(x) order by x.person_initiated_at desc)
      from (select s.id, s.action_type, s.status, s.teacher_name,
                   s.teacher_confirmed_at, s.person_initiated_at
              from menumaker.safepass_sessions s
             where s.child_id = p_child_id
               and s.created_at >= date_trunc('day', now())) x
  ), '[]'::jsonb));
end $$;

-- §3 ── дети по телефону (замена прямому чтению world-readable таблицы) ───────
create or replace function menumaker.safepass_children_for_phone(p_phone text)
returns jsonb
language plpgsql security definer set search_path = menumaker, public as $$
begin
  return jsonb_build_object('ok', true, 'person_name', (
      select person_name from menumaker.safepass_trusted_persons
       where phone = p_phone and is_active limit 1),
    'children', coalesce((
      select jsonb_agg(jsonb_build_object(
               'child_id', tp.child_id, 'child_name', tp.child_name,
               'center_id', tp.center_id, 'classroom_id', r.classroom_id,
               'classroom_name', cl.name))
        from menumaker.safepass_trusted_persons tp
        left join menumaker.roster r on r.id::text = tp.child_id and r.is_active
        left join menumaker.classrooms cl on cl.id = r.classroom_id
       where tp.phone = p_phone and tp.is_active
  ), '[]'::jsonb));
end $$;

-- §4 ── Remind ────────────────────────────────────────────────────────────────
-- NB: колонки называются reminder_count / reminder_sent_at. Клиент на :173 писал
-- remind_count / reminded_at — таких колонок в таблице НЕТ, то есть «Remind» был
-- сломан вторым, независимым способом. Тоже без связанного error.
create or replace function menumaker.safepass_remind(
  p_phone text, p_session_id uuid
) returns jsonb
language plpgsql security definer set search_path = menumaker, public as $$
declare v_n int;
begin
  update menumaker.safepass_sessions s
     set reminder_count = coalesce(s.reminder_count,0) + 1, reminder_sent_at = now()
   where s.id = p_session_id and s.status = 'waiting'
     and exists(select 1 from menumaker.safepass_trusted_persons tp
                 where tp.phone = p_phone and tp.child_id = s.child_id and tp.is_active);
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', v_n > 0);
end $$;

grant execute on function menumaker.safepass_request_handoff(text,text,text,text)  to anon, authenticated;
grant execute on function menumaker.safepass_parent_sessions(text,text)            to anon, authenticated;
grant execute on function menumaker.safepass_children_for_phone(text)              to anon, authenticated;
grant execute on function menumaker.safepass_remind(text,uuid)                     to anon, authenticated;

commit;

-- VERIFY (выполнить после применения):
--   select menumaker.safepass_children_for_phone('+19999999999');
--     → ok:true, у каждого ребёнка НЕ пустой classroom_id и classroom_name
--   select menumaker.safepass_request_handoff('+10000000000', <любой uuid>, 'drop_off');
--     → {"ok":false,"error":"not_authorized"}   (незнакомый номер)
--   select menumaker.safepass_request_handoff('+19999999999', <чужой ребёнок>, 'drop_off');
--     → {"ok":false,"error":"not_authorized"}   ← ТОТ ЖЕ ответ, оракула нет
--   после (в): заявка на ZZZSMOKE → classroom_id = a93a2e02-… (Red), НЕ org-uuid
