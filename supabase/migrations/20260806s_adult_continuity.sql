-- 20260806s_adult_continuity.sql — непрерывность взрослого (06.08)
--
-- ПРАВИЛО ВЛАДЕЛЬЦА: нельзя дать чек-аут ПОСЛЕДНЕМУ взрослому, пока в комнате есть
-- дети и подмена не отметилась. Дети не остаются без учителя ни на минуту.
--
-- ЧЕСТНОСТЬ ВСЛУХ (условие владельца, дорога A): гейт стережёт детей, отмеченных
-- ЧЕРЕЗ SAFEPASS — открытые подтверждённые передачи. На 06.08 safepass_sessions
-- ПУСТА (0 строк за всё время), поэтому сегодня гейт ДРЕМЛЕТ и пропускает всё, как
-- вчера. Правило для людей действует всегда; гейт — его техническое выражение,
-- просыпающееся с первой подтверждённой передачей.
--
-- ОБХОД КНОПКИ ЗАКРЫТ ТЕМ ЖЕ КОДОМ: чек-ин в другую комнату при открытой смене
-- закрывает прежнюю («auto: moved room») — то есть тоже выводит взрослого из
-- комнаты. Гейт живёт в ОБЩЕЙ функции и зовётся с обоих путей.

-- ── ОБЩЕЕ ПРАВИЛО ОДНИМ МЕСТОМ ────────────────────────────────────────────────
-- Возвращает число детей, из-за которых уходить нельзя; 0 — можно.
create or replace function menumaker._safepass_exit_blocked(
  p_class uuid, p_staff uuid, p_from timestamptz)
returns int language sql stable
set search_path to 'menumaker','public' as $fn$
  select case
    when p_class is null then 0
    -- Кто ещё отмечен в этой комнате — тем же счётом, что полоса «In this room today».
    when exists (
      select 1 from (
        select distinct on (e.staff_id) e.staff_id, e.event_type
          from menumaker.staff_time_events e
         where e.event_at >= p_from and e.classroom_id = p_class
         order by e.staff_id, e.event_at desc
      ) l where l.event_type = 'check_in' and l.staff_id <> p_staff
    ) then 0                                    -- не последний — держать некого
    else (
      -- Дети, отмеченные через SafePass: подтверждённая передача без более позднего
      -- подтверждённого получения.
      select count(*)::int from menumaker.safepass_sessions s
       where s.confirmed_classroom_id = p_class
         and s.action_type = 'drop_off' and s.status = 'confirmed'
         and s.created_at >= p_from
         and not exists (
           select 1 from menumaker.safepass_sessions p
            where p.child_id = s.child_id and p.action_type = 'pick_up'
              and p.status = 'confirmed' and p.created_at > s.created_at)
    )
  end;
$fn$;

-- ── ЧЕК-АУТ ───────────────────────────────────────────────────────────────────
-- Старая двухаргументная форма снимается: иначе вызов с двумя именованными
-- аргументами станет неоднозначным между нею и новой формой с умолчанием.
drop function if exists menumaker.safepass_staff_check_out(text, text);

create or replace function menumaker.safepass_staff_check_out(
  p_token text, p_pin_hash text, p_force boolean default false)
returns jsonb language plpgsql security definer
set search_path to 'menumaker','public','extensions' as $fn$
declare v_dev record; v_staff record; v_from timestamptz; v_last record; v_kids int;
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

  v_kids := menumaker._safepass_exit_blocked(v_last.classroom_id, v_staff.id, v_from);
  if v_kids > 0 and not coalesce(p_force, false) then
    -- Отказ называет СЛЕДУЮЩИЙ ШАГ, а не запрет.
    return jsonb_build_object('ok', false, 'error', 'last_adult_with_children',
      'children', v_kids,
      'message', format('You are the only adult checked in, and %s %s in the room. Ask your cover to check in first.',
                        v_kids, case when v_kids = 1 then 'child is' else 'children are' end));
  end if;

  insert into menumaker.staff_time_events (org_id, center_id, staff_id, classroom_id, event_type, event_at, device_id, note)
  values (v_dev.org_id, v_dev.center_id, v_staff.id, v_last.classroom_id, 'check_out', now(), v_dev.id::text,
          case when v_kids > 0 then format('force: last adult left with children (%s)', v_kids) end);

  return jsonb_build_object('ok', true, 'staff_id', v_staff.id,
    'staff_name', v_staff.first_name||' '||v_staff.last_name,
    'classroom_id', v_last.classroom_id,
    'forced', v_kids > 0, 'children', v_kids);
end $fn$;
revoke execute on function menumaker.safepass_staff_check_out(text,text,boolean) from public;
grant  execute on function menumaker.safepass_staff_check_out(text,text,boolean) to anon, authenticated;

-- ── ЧЕК-ИН: тот же гейт на пути «moved room» ──────────────────────────────────
drop function if exists menumaker.safepass_staff_check_in(text, text, uuid);

create or replace function menumaker.safepass_staff_check_in(
  p_token text, p_pin_hash text, p_classroom uuid default null, p_force boolean default false)
returns jsonb language plpgsql security definer
set search_path to 'menumaker','public','extensions' as $fn$
declare v_dev record; v_staff record; v_class uuid; v_from timestamptz; v_last record; v_kids int;
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
    -- ЭТО ТОЖЕ ВЫХОД ИЗ КОМНАТЫ. Тот же гейт, иначе последний взрослый уходит
    -- «переходом» мимо правила.
    v_kids := menumaker._safepass_exit_blocked(v_last.classroom_id, v_staff.id, v_from);
    if v_kids > 0 and not coalesce(p_force, false) then
      return jsonb_build_object('ok', false, 'error', 'last_adult_with_children',
        'children', v_kids, 'moving_from', v_last.classroom_id,
        'message', format('You are the only adult checked in to the room you are leaving, and %s %s there. Ask your cover to check in first.',
                          v_kids, case when v_kids = 1 then 'child is' else 'children are' end));
    end if;
    insert into menumaker.staff_time_events (org_id, center_id, staff_id, classroom_id, event_type, event_at, device_id, note)
    values (v_dev.org_id, v_dev.center_id, v_staff.id, v_last.classroom_id, 'check_out', now(), v_dev.id::text,
            case when v_kids > 0 then format('force: last adult left with children (%s) via room move', v_kids)
                 else 'auto: moved room' end);
  end if;

  insert into menumaker.staff_time_events (org_id, center_id, staff_id, classroom_id, event_type, event_at, device_id)
  values (v_dev.org_id, v_dev.center_id, v_staff.id, v_class, 'check_in', now(), v_dev.id::text);

  return jsonb_build_object('ok', true, 'already', false, 'staff_id', v_staff.id,
    'staff_name', v_staff.first_name||' '||v_staff.last_name,
    'classroom_id', v_class, 'moved_from', v_last.classroom_id,
    'forced', coalesce(v_kids,0) > 0);
end $fn$;
revoke execute on function menumaker.safepass_staff_check_in(text,text,uuid,boolean) from public;
grant  execute on function menumaker.safepass_staff_check_in(text,text,uuid,boolean) to anon, authenticated;
