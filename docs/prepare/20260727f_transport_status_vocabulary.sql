-- 20260727f_transport_status_vocabulary.sql
-- PREPARE — НЕ ПРИМЕНЕНО. Ждёт отдельного go Николая. Блокер смоука 2-Т.
--
-- ── ЧТО СЛОМАНО (измерено 27.07, до заезда на смоук)
-- Рельс водителя разговаривает сам с собой на ДВУХ языках. Таблицы и экран согласны,
-- SQL-функции из 20260727e — нет:
--
--   слой                         | статус рейса              | статус ребёнка
--   -----------------------------|---------------------------|---------------------------
--   CHECK на таблицах (исходные) | pending departed arrived  | pending boarded delivered
--                                | confirmed completed       | absent
--   SafePassDriverPage + типы    | (не читает)               | pending boarded delivered
--                                |                           | absent   ← lib:190, page:181
--   функции 20260727e            | in_progress completed     | listed on_bus off   ← ЧУЖОЙ
--
-- Пересечение — одно слово, 'completed'. Всё остальное отбивается CHECK-ом.
--
-- ── ЧЕМ ЭТО КОНЧАЕТСЯ НА СМОУКЕ (по шагам гида водителя)
--   шаг 2 «Start the run»   → open_run пишет status='in_progress' → 23514 на
--                             safepass_transport_runs_status_check → рейс НЕ создаётся.
--                             Смоук умирает здесь, до шага 4.
--   шаг 4 «список маршрута» → add_child пишет 'listed' → 23514 на детской CHECK.
--   шаг 3 «On bus / Off»    → tap пишет 'on_bus'/'off' → 23514.
--
-- И даже если бы CHECK-и были шире: экран считает «на борту» по 'boarded'
-- (SafePassDriverPage:181), а функция писала бы 'on_bus' — счётчик Правила №1 показывал бы
-- 0 при полном автобусе. Врущий счётчик хуже отказа.
--
-- ── ЧТО ПРАВИМ, И ПОЧЕМУ ИМЕННО ФУНКЦИИ
-- Таблицы и UI совпадают между собой и старше функций; словарь таблиц уже разошёлся по типам
-- (`lib/safepassDevice.ts:190`) и по витрине. Расширять CHECK, чтобы жили ОБА словаря, — значит
-- оставить два способа сказать одно и то же: ровно тот дрейф, который сегодня уже дважды стоил
-- дубля. Поэтому CHECK-и НЕ трогаем, правим единственный расходящийся слой — функции.
--
--   in_progress → departed    (departed_at и так ставится в open_run)
--   listed      → pending     (строка маршрута до посадки)
--   on_bus      → boarded
--   off         → delivered
--
-- p_kind остаётся API-глаголом ('on_bus'/'off') — его шлёт экран, менять контракт незачем;
-- маппинг живёт внутри tap.
--
-- ⚠️ ПОПРАВКА К СПЕКЕ: transport-arm-spec §6.2 утверждает «Проба 27.07 (в откате) прошла на
-- morning_to_school». Против этих CHECK-ов она пройти не могла. Строку в спеке надо поправить
-- тем же заходом — иначе это ещё одна метка, прочитанная как содержимое.

begin;

-- (1) Рейсы водителя на сегодня — счётчики читают словарь таблиц.
create or replace function menumaker.safepass_driver_runs_today(p_token text, p_pin_hash text)
returns jsonb language plpgsql security definer set search_path to 'menumaker','public','extensions' as $fn$
declare c record; v jsonb;
begin
  select * into c from menumaker._driver_ctx(p_token, p_pin_hash);
  select coalesce(jsonb_agg(jsonb_build_object(
           'run_id', r.id, 'run_type', r.run_type, 'vehicle', r.vehicle,
           'capacity', r.vehicle_capacity, 'status', r.status, 'started_at', r.departed_at,
           'aboard',   (select count(*) from menumaker.safepass_transport_children x
                         where x.run_id = r.id and x.status = 'boarded'),
           'alighted', (select count(*) from menumaker.safepass_transport_children x
                         where x.run_id = r.id and x.status = 'delivered'),
           'listed',   (select count(*) from menumaker.safepass_transport_children x where x.run_id = r.id)
         ) order by r.created_at), '[]'::jsonb) into v
    from menumaker.safepass_transport_runs r
   where r.center_id = c.center_id
     and r.driver_staff_id = c.staff_id
     and r.run_date = (menumaker.center_local_day_start(c.center_id))::date;
  return jsonb_build_object('ok', true, 'driver', jsonb_build_object('staff_id', c.staff_id, 'name', c.staff_name), 'runs', v);
end $fn$;

-- (2) Открыть рейс. Единственная правка — статус. vehicle_capacity по-прежнему фиксируется здесь.
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
          p_run_type, c.staff_id, c.staff_name, p_vehicle, p_capacity, now(), 'departed')
  returning id into v_id;

  return jsonb_build_object('ok', true, 'run_id', v_id, 'capacity', p_capacity, 'driver', c.staff_name);
end $fn$;

-- (3) Комплектование. Жёсткий гейт §2.3 не тронут — правится только слово статуса.
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
  values (p_run, p_child, p_child_name, p_school, 'pending');
  return jsonb_build_object('ok', true, 'listed', v_listed + 1, 'capacity', r.vehicle_capacity);
end $fn$;

-- (4) Список маршрута группами по школам. Считаем «на борту» словом таблицы.
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
    'aboard', (select count(*) from menumaker.safepass_transport_children where run_id = p_run and status='boarded'),
    'children', v);
end $fn$;

-- (5) Тап. p_kind остаётся глаголом экрана; в БД ложится слово таблицы.
--     Двухшаговость форс-мажора и помеченное исключение не тронуты.
create or replace function menumaker.safepass_driver_tap(
  p_token text, p_pin_hash text, p_run uuid, p_child text, p_kind text,
  p_force boolean default false)
returns jsonb language plpgsql security definer set search_path to 'menumaker','public','extensions' as $fn$
declare c record; r record; v_row record; v_aboard int; v_over boolean := false; v_target text;
begin
  select * into c from menumaker._driver_ctx(p_token, p_pin_hash);
  if p_kind not in ('on_bus','off') then return jsonb_build_object('ok', false, 'error', 'bad_kind'); end if;
  v_target := case p_kind when 'on_bus' then 'boarded' else 'delivered' end;

  select * into r from menumaker.safepass_transport_runs where id = p_run and center_id = c.center_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'run_not_in_center'); end if;
  if r.status = 'completed' then return jsonb_build_object('ok', false, 'error', 'run_completed'); end if;

  select * into v_row from menumaker.safepass_transport_children where run_id = p_run and child_id = p_child;
  if not found then return jsonb_build_object('ok', false, 'error', 'child_not_on_run'); end if;
  if v_row.status = v_target then return jsonb_build_object('ok', true, 'already', true, 'status', v_target); end if;

  if p_kind = 'on_bus' then
    select count(*) into v_aboard from menumaker.safepass_transport_children
     where run_id = p_run and status = 'boarded';
    if v_aboard >= r.vehicle_capacity then
      if not p_force then
        return jsonb_build_object('ok', false, 'error', 'capacity_reached',
          'capacity', r.vehicle_capacity, 'aboard', v_aboard, 'hint', 'create_second_run');
      end if;
      v_over := true;   -- помеченное исключение: запись проходит, но видна директору
    end if;
  end if;

  update menumaker.safepass_transport_children
     set status        = v_target,
         checked_at    = now(),
         checked_by    = c.staff_id::text,
         boarded_at    = case when p_kind = 'on_bus' then now() else boarded_at end,
         alighted_at   = case when p_kind = 'off'    then now() else alighted_at end,
         over_capacity = over_capacity or v_over
   where run_id = p_run and child_id = p_child;

  return jsonb_build_object('ok', true, 'status', v_target, 'over_capacity', v_over,
    'by', c.staff_name,
    'aboard', (select count(*) from menumaker.safepass_transport_children where run_id = p_run and status='boarded'));
end $fn$;

-- (6) Гейт Правила №1 «no child left on bus». Тот же гейт, то же слово, что пишет тап.
create or replace function menumaker.safepass_driver_complete_run(
  p_token text, p_pin_hash text, p_run uuid)
returns jsonb language plpgsql security definer set search_path to 'menumaker','public','extensions' as $fn$
declare c record; r record; v_left jsonb;
begin
  select * into c from menumaker._driver_ctx(p_token, p_pin_hash);
  select * into r from menumaker.safepass_transport_runs where id = p_run and center_id = c.center_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'run_not_in_center'); end if;

  select coalesce(jsonb_agg(child_name order by child_name), '[]'::jsonb) into v_left
    from menumaker.safepass_transport_children where run_id = p_run and status = 'boarded';

  if jsonb_array_length(v_left) > 0 then
    return jsonb_build_object('ok', false, 'error', 'children_still_aboard', 'children', v_left);
  end if;

  update menumaker.safepass_transport_runs
     set status = 'completed', arrived_at = now(), completed_by = c.staff_id,
         children_count = (select count(*) from menumaker.safepass_transport_children where run_id = p_run)
   where id = p_run;
  return jsonb_build_object('ok', true, 'run_id', p_run, 'by', c.staff_name);
end $fn$;

commit;

-- ── READ-BACK (сразу после apply, до того как Николай трогает телефон)
--  R1. Ни одна функция рельса больше не содержит чужих слов:
--      select p.proname
--        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--       where n.nspname = 'menumaker' and p.proname like 'safepass_driver%'
--         and (p.prosrc like '%in_progress%' or p.prosrc like '%''listed''%'
--              or p.prosrc like '%''on_bus''%' and p.prosrc not like '%p_kind when ''on_bus''%');
--      → 0 строк.
--  R2. Проба в откате (rollback-DO): открыть рейс → посадить троих → boarded → delivered →
--      закрыть рейс. Уже прогнана на голых INSERT-ах 27.07 и принята обеими CHECK: seated=3,
--      после delete children=0 / runs=0, ничего не осталось.
--  R3. Живой смоук — по шагам гида водителя; смотреть, что счётчик «на борту» на экране
--      двигается (это и есть проверка, что слои сошлись), и что закрытие рейса с ребёнком на
--      борту отбивается ИМЕНАМИ.
--
-- ── ЧЕГО ЭТА ПРАВКА НЕ ДЕЛАЕТ
--  • Не трогает CHECK-и, таблицы, RLS и контракт экрана (p_kind остаётся 'on_bus'/'off').
--  • Не заводит поверхность комплектования рейса. Её нет ни у офиса, ни у водителя:
--    `driverAddChild` существует в lib/safepassDevice.ts и НЕ вызывается ни из одного экрана
--    (0 использований в src/). На смоуке маршрут наполняется фикстурой — см.
--    20260727g_transport_smoke_step4_seed.sql — и это надо назвать вслух в отчёте о смоуке:
--    шаг 4 проверяет ТАПЫ, а не сборку маршрута.
