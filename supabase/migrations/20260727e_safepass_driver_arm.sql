-- 20260727e_safepass_driver_arm.sql — ход 2-Т, шаг (б): RPC driver-плеча.
--
-- Рельс тот же, что доказан ходом 1: устройство предъявляет ТОКЕН, PIN опознаёт человека,
-- атрибуция = staff.id. Клиенту личность не доверяется нигде.
--
-- ⚠️ ТРИ ДОБАВКИ К СХЕМЕ, БЕЗ КОТОРЫХ РАТИФИЦИРОВАННОЕ ПОВЕДЕНИЕ НЕВЫПОЛНИМО.
--    Все аддитивные, forward-only, ничего не ломают; вынесены сюда, а не сделаны молча:
--    (1) transport_runs.driver_staff_id — «атрибуция водителя обязательна» (карта (н) §2), а на
--        рейсе сегодня есть только driver_name text. Имя строкой — не подписант; ход 1 этот урок
--        уже оплатил (teacher_id из двух пространств id).
--    (2) transport_runs.completed_by — кто закрыл рейс.
--    (3) transport_children.boarded_at / alighted_at / over_capacity — у ребёнка на рейсе ДВА
--        события (OnBus и Off, ровно как в бланке Bus-Wickliffe), а колонка checked_at одна:
--        вторым тапом время посадки было бы затёрто. over_capacity несёт помеченное исключение
--        §2.3 — без него форс-мажор неотличим от нормы.
--
-- ⚠️ И СЕДЬМАЯ ФУНКЦИЯ СВЕРХ СОГЛАСОВАННЫХ ШЕСТИ: safepass_driver_add_child.
--    Ратифицированы ДВА разных момента — «гейт при КОМПЛЕКТОВАНИИ рейса» (ребёнок сверх нормы не
--    добавляется) и «форс-мажор фактической ПОСАДКИ» (пишется с флагом). Это два разных жеста, и
--    без add_child рейс физически некому наполнить. Помечено, не спрятано.

begin;

alter table menumaker.safepass_transport_runs
  add column if not exists driver_staff_id uuid references menumaker.staff(id),
  add column if not exists completed_by    uuid references menumaker.staff(id);

alter table menumaker.safepass_transport_children
  add column if not exists boarded_at    timestamptz,
  add column if not exists alighted_at   timestamptz,
  add column if not exists over_capacity boolean not null default false;

create index if not exists safepass_transport_runs_day
  on menumaker.safepass_transport_runs (center_id, run_date, status);

-- ═══════════════════════════════════════════════════════════════════════════════
-- helper: устройство + водитель по PIN. Одно место, где решается «кто это».
-- ═══════════════════════════════════════════════════════════════════════════════
create or replace function menumaker._driver_ctx(p_token text, p_pin_hash text)
returns table (dev_id uuid, org_id uuid, center_id uuid, staff_id uuid, staff_name text)
language plpgsql security definer set search_path to 'menumaker','public','extensions' as $fn$
declare v_dev record; v_staff record;
begin
  select * into v_dev from menumaker.safepass_devices
   where token_hash = encode(digest(p_token,'sha256'),'hex') and is_active and revoked_at is null;
  if not found then raise exception 'device not registered'; end if;

  select s.id, s.first_name||' '||s.last_name as nm into v_staff
    from menumaker.staff s
   where s.center_id = v_dev.center_id and s.is_active and s.pin_hash = p_pin_hash;
  if not found then raise exception 'invalid PIN'; end if;

  return query select v_dev.id, v_dev.org_id, v_dev.center_id, v_staff.id, v_staff.nm;
end $fn$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- (1) Рейсы водителя на сегодня — чтобы открыть существующий, а не завести второй.
-- ═══════════════════════════════════════════════════════════════════════════════
create or replace function menumaker.safepass_driver_runs_today(p_token text, p_pin_hash text)
returns jsonb language plpgsql security definer set search_path to 'menumaker','public','extensions' as $fn$
declare c record; v jsonb;
begin
  select * into c from menumaker._driver_ctx(p_token, p_pin_hash);
  select coalesce(jsonb_agg(jsonb_build_object(
           'run_id', r.id, 'run_type', r.run_type, 'vehicle', r.vehicle,
           'capacity', r.vehicle_capacity, 'status', r.status, 'started_at', r.departed_at,
           'aboard',   (select count(*) from menumaker.safepass_transport_children x
                         where x.run_id = r.id and x.status = 'on_bus'),
           'alighted', (select count(*) from menumaker.safepass_transport_children x
                         where x.run_id = r.id and x.status = 'off'),
           'listed',   (select count(*) from menumaker.safepass_transport_children x where x.run_id = r.id)
         ) order by r.created_at), '[]'::jsonb) into v
    from menumaker.safepass_transport_runs r
   where r.center_id = c.center_id
     and r.driver_staff_id = c.staff_id
     and r.run_date = (menumaker.center_local_day_start(c.center_id))::date;
  return jsonb_build_object('ok', true, 'driver', jsonb_build_object('staff_id', c.staff_id, 'name', c.staff_name), 'runs', v);
end $fn$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- (2) Открыть рейс. vehicle_capacity ФИКСИРУЕТСЯ ЗДЕСЬ (решение 27.07): норма
--     принадлежит своему времени, как период-эффективные рейты. Задним числом
--     изменённая вместимость не перепишет смысл старых рейсов.
-- ═══════════════════════════════════════════════════════════════════════════════
create or replace function menumaker.safepass_driver_open_run(
  p_token text, p_pin_hash text, p_run_type text, p_vehicle text, p_capacity int)
returns jsonb language plpgsql security definer set search_path to 'menumaker','public','extensions' as $fn$
declare c record; v_id uuid;
begin
  select * into c from menumaker._driver_ctx(p_token, p_pin_hash);
  if p_run_type not in ('morning_to_school','afternoon_from_school','field_trip') then
    return jsonb_build_object('ok', false, 'error', 'bad_run_type');
  end if;
  if coalesce(p_capacity, 0) <= 0 then
    return jsonb_build_object('ok', false, 'error', 'capacity_required');
  end if;

  insert into menumaker.safepass_transport_runs
    (org_id, center_id, run_date, run_type, driver_staff_id, driver_name, vehicle,
     vehicle_capacity, departed_at, status)
  values (c.org_id, c.center_id, (menumaker.center_local_day_start(c.center_id))::date,
          p_run_type, c.staff_id, c.staff_name, p_vehicle, p_capacity, now(), 'in_progress')
  returning id into v_id;

  return jsonb_build_object('ok', true, 'run_id', v_id, 'capacity', p_capacity, 'driver', c.staff_name);
end $fn$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- (3) Комплектование рейса — ЗДЕСЬ ЖИВЁТ ЖЁСТКИЙ ГЕЙТ §2.3.
--     Сверх вместимости ребёнок НЕ добавляется: отказ + подсказка «второй рейс».
--     Это запрет ПЛАНИРОВАНИЯ; форс-мажор посадки — другой жест, см. (5).
-- ═══════════════════════════════════════════════════════════════════════════════
create or replace function menumaker.safepass_driver_add_child(
  p_token text, p_pin_hash text, p_run uuid, p_child text, p_child_name text, p_school text)
returns jsonb language plpgsql security definer set search_path to 'menumaker','public','extensions' as $fn$
declare c record; r record; v_listed int;
begin
  select * into c from menumaker._driver_ctx(p_token, p_pin_hash);
  select * into r from menumaker.safepass_transport_runs where id = p_run and center_id = c.center_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'run_not_in_center'); end if;
  if r.status = 'completed' then return jsonb_build_object('ok', false, 'error', 'run_completed'); end if;

  if exists (select 1 from menumaker.safepass_transport_children where run_id = p_run and child_id = p_child) then
    return jsonb_build_object('ok', true, 'already', true);
  end if;

  select count(*) into v_listed from menumaker.safepass_transport_children where run_id = p_run;
  if v_listed >= r.vehicle_capacity then
    return jsonb_build_object('ok', false, 'error', 'capacity_reached',
      'capacity', r.vehicle_capacity, 'listed', v_listed, 'hint', 'create_second_run');
  end if;

  insert into menumaker.safepass_transport_children (run_id, child_id, child_name, school_name, status)
  values (p_run, p_child, p_child_name, p_school, 'listed');
  return jsonb_build_object('ok', true, 'listed', v_listed + 1, 'capacity', r.vehicle_capacity);
end $fn$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- (4) Список маршрута — ГРУППАМИ ПО ШКОЛАМ: экран читается как маршрут.
--     Печатный лист этой колонки не несёт (канон «печать = образец»).
-- ═══════════════════════════════════════════════════════════════════════════════
create or replace function menumaker.safepass_driver_run_children(p_token text, p_run uuid)
returns jsonb language plpgsql security definer set search_path to 'menumaker','public','extensions' as $fn$
declare v_dev record; r record; v jsonb;
begin
  select * into v_dev from menumaker.safepass_devices
   where token_hash = encode(digest(p_token,'sha256'),'hex') and is_active and revoked_at is null;
  if not found then raise exception 'device not registered'; end if;

  select * into r from menumaker.safepass_transport_runs where id = p_run and center_id = v_dev.center_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'run_not_in_center'); end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'child_id', x.child_id, 'child_name', x.child_name,
           'school_name', coalesce(x.school_name, r.school_name),
           'status', x.status, 'boarded_at', x.boarded_at, 'alighted_at', x.alighted_at,
           'over_capacity', x.over_capacity)
         order by coalesce(x.school_name, r.school_name, ''), x.child_name), '[]'::jsonb) into v
    from menumaker.safepass_transport_children x where x.run_id = p_run;

  return jsonb_build_object('ok', true, 'run_id', p_run, 'capacity', r.vehicle_capacity,
    'aboard', (select count(*) from menumaker.safepass_transport_children where run_id = p_run and status='on_bus'),
    'children', v);
end $fn$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- (5) Тап посадки/высадки. Форс-мажор — ПАРАМЕТР, с обязательной двухшаговостью:
--     сначала клиент получает capacity_reached, и только осознанный повтор шлёт p_force.
-- ═══════════════════════════════════════════════════════════════════════════════
create or replace function menumaker.safepass_driver_tap(
  p_token text, p_pin_hash text, p_run uuid, p_child text, p_kind text,
  p_force boolean default false)
returns jsonb language plpgsql security definer set search_path to 'menumaker','public','extensions' as $fn$
declare c record; r record; v_row record; v_aboard int; v_over boolean := false;
begin
  select * into c from menumaker._driver_ctx(p_token, p_pin_hash);
  if p_kind not in ('on_bus','off') then return jsonb_build_object('ok', false, 'error', 'bad_kind'); end if;

  select * into r from menumaker.safepass_transport_runs where id = p_run and center_id = c.center_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'run_not_in_center'); end if;
  if r.status = 'completed' then return jsonb_build_object('ok', false, 'error', 'run_completed'); end if;

  select * into v_row from menumaker.safepass_transport_children where run_id = p_run and child_id = p_child;
  if not found then return jsonb_build_object('ok', false, 'error', 'child_not_on_run'); end if;
  if v_row.status = p_kind then return jsonb_build_object('ok', true, 'already', true, 'status', p_kind); end if;

  if p_kind = 'on_bus' then
    select count(*) into v_aboard from menumaker.safepass_transport_children
     where run_id = p_run and status = 'on_bus';
    if v_aboard >= r.vehicle_capacity then
      if not p_force then
        return jsonb_build_object('ok', false, 'error', 'capacity_reached',
          'capacity', r.vehicle_capacity, 'aboard', v_aboard, 'hint', 'create_second_run');
      end if;
      v_over := true;   -- помеченное исключение: запись проходит, но видна директору
    end if;
  end if;

  update menumaker.safepass_transport_children
     set status        = p_kind,
         checked_at    = now(),
         checked_by    = c.staff_id::text,
         boarded_at    = case when p_kind = 'on_bus' then now() else boarded_at end,
         alighted_at   = case when p_kind = 'off'    then now() else alighted_at end,
         over_capacity = over_capacity or v_over
   where run_id = p_run and child_id = p_child;

  return jsonb_build_object('ok', true, 'status', p_kind, 'over_capacity', v_over,
    'by', c.staff_name,
    'aboard', (select count(*) from menumaker.safepass_transport_children where run_id = p_run and status='on_bus'));
end $fn$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- (6) Закрытие рейса — ГЕЙТ ПРАВИЛА №1 «no child left on bus», в ЯДРЕ, для ВСЕХ
--     run_type, а не только для экскурсий. Отказ называет ИМЕНА: людей идут искать,
--     а не пересчитывают.
-- ═══════════════════════════════════════════════════════════════════════════════
create or replace function menumaker.safepass_driver_complete_run(
  p_token text, p_pin_hash text, p_run uuid)
returns jsonb language plpgsql security definer set search_path to 'menumaker','public','extensions' as $fn$
declare c record; r record; v_left jsonb;
begin
  select * into c from menumaker._driver_ctx(p_token, p_pin_hash);
  select * into r from menumaker.safepass_transport_runs where id = p_run and center_id = c.center_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'run_not_in_center'); end if;

  select coalesce(jsonb_agg(child_name order by child_name), '[]'::jsonb) into v_left
    from menumaker.safepass_transport_children where run_id = p_run and status = 'on_bus';

  if jsonb_array_length(v_left) > 0 then
    return jsonb_build_object('ok', false, 'error', 'children_still_aboard', 'children', v_left);
  end if;

  update menumaker.safepass_transport_runs
     set status = 'completed', arrived_at = now(), completed_by = c.staff_id,
         children_count = (select count(*) from menumaker.safepass_transport_children where run_id = p_run)
   where id = p_run;
  return jsonb_build_object('ok', true, 'run_id', p_run, 'by', c.staff_name);
end $fn$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- (7) Бумажный лист — фото в СУЩЕСТВУЮЩУЮ колонку. Хранится ПУТЬ, не URL.
-- ═══════════════════════════════════════════════════════════════════════════════
create or replace function menumaker.safepass_driver_attach_sheet(
  p_token text, p_pin_hash text, p_run uuid, p_photo_path text)
returns jsonb language plpgsql security definer set search_path to 'menumaker','public','extensions' as $fn$
declare c record; v_n int;
begin
  select * into c from menumaker._driver_ctx(p_token, p_pin_hash);
  update menumaker.safepass_transport_runs
     set checklist_photo = p_photo_path
   where id = p_run and center_id = c.center_id;
  get diagnostics v_n = row_count;
  if v_n = 0 then return jsonb_build_object('ok', false, 'error', 'run_not_in_center'); end if;
  return jsonb_build_object('ok', true);
end $fn$;

revoke execute on function menumaker._driver_ctx(text,text) from public, anon, authenticated;
revoke execute on function menumaker.safepass_driver_runs_today(text,text) from public;
revoke execute on function menumaker.safepass_driver_open_run(text,text,text,text,int) from public;
revoke execute on function menumaker.safepass_driver_add_child(text,text,uuid,text,text,text) from public;
revoke execute on function menumaker.safepass_driver_run_children(text,uuid) from public;
revoke execute on function menumaker.safepass_driver_tap(text,text,uuid,text,text,boolean) from public;
revoke execute on function menumaker.safepass_driver_complete_run(text,text,uuid) from public;
revoke execute on function menumaker.safepass_driver_attach_sheet(text,text,uuid,text) from public;

grant execute on function menumaker.safepass_driver_runs_today(text,text) to anon, authenticated;
grant execute on function menumaker.safepass_driver_open_run(text,text,text,text,int) to anon, authenticated;
grant execute on function menumaker.safepass_driver_add_child(text,text,uuid,text,text,text) to anon, authenticated;
grant execute on function menumaker.safepass_driver_run_children(text,uuid) to anon, authenticated;
grant execute on function menumaker.safepass_driver_tap(text,text,uuid,text,text,boolean) to anon, authenticated;
grant execute on function menumaker.safepass_driver_complete_run(text,text,uuid) to anon, authenticated;
grant execute on function menumaker.safepass_driver_attach_sheet(text,text,uuid,text) to anon, authenticated;

commit;
