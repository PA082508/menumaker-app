-- 20260727a_safepass_staff_checkin.sql — B-ход, ХОД 1: ЧЕК-ИН УЧИТЕЛЕЙ (и только он)
--
-- GO Николая 2026-07-26. Состав ратифицирован целиком:
--   • classroom_id пишется В СОБЫТИЕ (развилка (i)) — класс есть свойство события, не устройства;
--   • check_in / check_out / checked_in_today;
--   • ДЕЖУРНЫЙ ВЫЧИСЛЯЕТСЯ (первый чек-ин смены), не хранится; duty_*-колонки замещённой модели
--     (safepass_sessions.duty_mode/duty_teacher_id/duty_teacher_name) НЕ трогаются;
--   • PIN на чек-ине остаётся при любом strict — ратифицировано: ВХОД В СМЕНУ ≠ ПОДПИСЬ ПЕРЕДАЧИ;
--   • p_classroom опционален — флоатер на общем планшете центра выбирает комнату руками;
--   • табель (staff_time_log) НЕ смешиваем: здесь только события двери.
--
-- В ход 1 НЕ входят: именные окошки, confirmed_via, app_settings.safepass_handoff_pin_strict,
-- Devices-экран, Parents с планшета, детектор дрейфа. Они ложатся ходами 2–5 ПОВЕРХ
-- safepass_checked_in_today, который здесь и появляется.
--
-- Рельс доступа — киосковый: планшет предъявляет ТОКЕН (sha256 в safepass_devices.token_hash),
-- человека опознаёт PIN. Прямого доступа к таблице ни у кого нет, всё через SECURITY DEFINER.
-- «Сегодня» = локальный день ЦЕНТРА через menumaker.center_local_day_start() (канон 26.07).

begin;

-- (0) Класс — свойство события. Флоатер, чек-нувшийся на общем планшете центра, попадает
--     в СВОЮ комнату, а не в комнату устройства.
alter table menumaker.staff_time_events
  add column if not exists classroom_id uuid;

create index if not exists staff_time_events_staff_day  on menumaker.staff_time_events (staff_id, event_at desc);
create index if not exists staff_time_events_room_day   on menumaker.staff_time_events (classroom_id, event_at desc);

-- (1) ЧЕК-ИН. Идемпотентен: повторный тап в той же комнате не плодит событий.
--     Чек-ин в ДРУГУЮ комнату при открытой смене = переход: закрываем прежнюю, открываем новую.
create or replace function menumaker.safepass_staff_check_in(
  p_token text, p_pin_hash text, p_classroom uuid default null)
returns jsonb language plpgsql security definer
set search_path to 'menumaker','public','extensions' as $fn$
declare v_dev record; v_staff record; v_class uuid; v_from timestamptz; v_last record;
begin
  select * into v_dev from menumaker.safepass_devices
   where token_hash = encode(digest(p_token,'sha256'),'hex') and is_active and revoked_at is null;
  if not found then raise exception 'device not registered'; end if;

  select id, first_name, last_name into v_staff
    from menumaker.staff
   where center_id = v_dev.center_id and is_active and pin_hash = p_pin_hash;
  if not found then raise exception 'invalid PIN'; end if;

  v_class := coalesce(p_classroom, v_dev.classroom_id);
  if v_class is null then raise exception 'no classroom'; end if;

  v_from := menumaker.center_local_day_start(v_dev.center_id);

  select event_type, classroom_id, event_at into v_last
    from menumaker.staff_time_events
   where staff_id = v_staff.id and event_at >= v_from
   order by event_at desc limit 1;

  if v_last.event_type = 'check_in' and v_last.classroom_id = v_class then
    return jsonb_build_object('ok', true, 'already', true, 'staff_id', v_staff.id,
      'staff_name', v_staff.first_name||' '||v_staff.last_name,
      'classroom_id', v_class, 'checked_in_at', v_last.event_at);
  end if;

  if v_last.event_type = 'check_in' then            -- переход между комнатами
    insert into menumaker.staff_time_events (org_id, center_id, staff_id, classroom_id, event_type, event_at, device_id, note)
    values (v_dev.org_id, v_dev.center_id, v_staff.id, v_last.classroom_id, 'check_out', now(), v_dev.id::text, 'auto: moved room');
  end if;

  insert into menumaker.staff_time_events (org_id, center_id, staff_id, classroom_id, event_type, event_at, device_id)
  values (v_dev.org_id, v_dev.center_id, v_staff.id, v_class, 'check_in', now(), v_dev.id::text);

  return jsonb_build_object('ok', true, 'already', false, 'staff_id', v_staff.id,
    'staff_name', v_staff.first_name||' '||v_staff.last_name,
    'classroom_id', v_class, 'moved_from', v_last.classroom_id);
end $fn$;

-- (2) ЧЕК-АУТ. Не открыт — говорим прямо, а не пишем пустое событие.
create or replace function menumaker.safepass_staff_check_out(p_token text, p_pin_hash text)
returns jsonb language plpgsql security definer
set search_path to 'menumaker','public','extensions' as $fn$
declare v_dev record; v_staff record; v_from timestamptz; v_last record;
begin
  select * into v_dev from menumaker.safepass_devices
   where token_hash = encode(digest(p_token,'sha256'),'hex') and is_active and revoked_at is null;
  if not found then raise exception 'device not registered'; end if;

  select id, first_name, last_name into v_staff
    from menumaker.staff
   where center_id = v_dev.center_id and is_active and pin_hash = p_pin_hash;
  if not found then raise exception 'invalid PIN'; end if;

  v_from := menumaker.center_local_day_start(v_dev.center_id);
  select event_type, classroom_id into v_last
    from menumaker.staff_time_events
   where staff_id = v_staff.id and event_at >= v_from
   order by event_at desc limit 1;

  if v_last.event_type is distinct from 'check_in' then
    return jsonb_build_object('ok', false, 'error', 'not_checked_in');
  end if;

  insert into menumaker.staff_time_events (org_id, center_id, staff_id, classroom_id, event_type, event_at, device_id)
  values (v_dev.org_id, v_dev.center_id, v_staff.id, v_last.classroom_id, 'check_out', now(), v_dev.id::text);

  return jsonb_build_object('ok', true, 'staff_id', v_staff.id,
    'staff_name', v_staff.first_name||' '||v_staff.last_name, 'classroom_id', v_last.classroom_id);
end $fn$;

-- (3) ИСТОЧНИК ОКОШЕК. Кто сейчас в комнате: последнее событие дня = check_in.
--     is_duty = ПЕРВЫЙ чек-ин смены — вычисляется, нигде не хранится. Порядок: дежурный первым.
create or replace function menumaker.safepass_checked_in_today(
  p_token text, p_classroom uuid default null)
returns jsonb language plpgsql security definer
set search_path to 'menumaker','public','extensions' as $fn$
declare v_dev record; v_class uuid; v_from timestamptz; v_rows jsonb;
begin
  select * into v_dev from menumaker.safepass_devices
   where token_hash = encode(digest(p_token,'sha256'),'hex') and is_active and revoked_at is null;
  if not found then raise exception 'device not registered'; end if;

  v_class := coalesce(p_classroom, v_dev.classroom_id);
  v_from  := menumaker.center_local_day_start(v_dev.center_id);

  select coalesce(jsonb_agg(jsonb_build_object(
           'staff_id', t.staff_id, 'name', t.name,
           'checked_in_at', t.event_at, 'is_duty', t.rn = 1) order by t.rn), '[]'::jsonb)
    into v_rows
    from (
      select l.staff_id, s.first_name||' '||s.last_name as name, l.event_at,
             row_number() over (order by l.event_at, l.staff_id) as rn
        from (
          select distinct on (e.staff_id) e.staff_id, e.event_type, e.event_at
            from menumaker.staff_time_events e
           where e.event_at >= v_from and e.classroom_id = v_class
           order by e.staff_id, e.event_at desc
        ) l
        join menumaker.staff s on s.id = l.staff_id and s.is_active
       where l.event_type = 'check_in'
    ) t;

  return jsonb_build_object('ok', true, 'classroom_id', v_class, 'teachers', v_rows);
end $fn$;

revoke execute on function menumaker.safepass_staff_check_in(text,text,uuid)  from public;
revoke execute on function menumaker.safepass_staff_check_out(text,text)      from public;
revoke execute on function menumaker.safepass_checked_in_today(text,uuid)     from public;
grant  execute on function menumaker.safepass_staff_check_in(text,text,uuid)  to anon, authenticated;
grant  execute on function menumaker.safepass_staff_check_out(text,text)      to anon, authenticated;
grant  execute on function menumaker.safepass_checked_in_today(text,uuid)     to anon, authenticated;

commit;

-- READ-BACK:
--  R1. staff_time_events.classroom_id существует + два индекса.
--  R2. Три функции созданы с ожидаемыми сигнатурами.
--  R3. Гранты: anon+authenticated (планшет предъявляет токен, не логин); public отозван.
--  R4. duty_*-колонки safepass_sessions не тронуты; staff_time_log не тронут (0 строк).
