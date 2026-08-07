-- ============================================================================
-- 20260807a_teacher_shell_rpcs.sql — App учителя v1: вход в оболочку по PIN
-- ----------------------------------------------------------------------------
-- ЗАЧЕМ. v1 переносит PIN на ВХОД в оболочку `/teacher`, а не спрашивает его на
-- каждом действии заново (спека 022ee0b, слово владельца). Сегодня PIN живёт
-- ТОЛЬКО внутри действий: safepass_confirm_handoff, safepass_staff_check_in/out,
-- safepass_driver_*. Опознать человека, ничего при этом не совершив, нечем —
-- а вход в оболочку обязан именно опознать, без побочного действия. Использовать
-- для этого check_in нельзя: открыть вкладку и отметить приход на работу — разные
-- события, и путать их значит врать в часах.
--
-- ДВЕ ФУНКЦИИ, обе SECURITY DEFINER, обе по образцу safepass_device_context:
--   safepass_identify_by_pin — «кто это» (без записи);
--   safepass_my_time         — «мои смены», только СВОИ.
--
-- КАНОН 07.08 «PIN не повышает роль» (docs/specs/2026-08-07-pin-capability-split.md):
-- сперва проверяется ТОЧКА и охват — токен обязан принадлежать живому classroom-
-- устройству, а сотрудник обязан быть активным сотрудником ЦЕНТРА ЭТОГО УСТРОЙСТВА, —
-- и только потом сверяется подпись (pin_hash). Обратный порядок сделал бы четыре
-- цифры ключом от чужого центра.
--
-- ЧЕГО ЗДЕСЬ НЕТ НАРОЧНО:
--   * pin_hash наружу не отдаётся (он и закрыт колоночным грантом — 403);
--   * safepass_my_time отдаёт события ТОЛЬКО того, чей PIN предъявлен: чужие часы
--     не видны даже коллеге за тем же планшетом;
--   * ни одна из функций ничего не пишет — вход в оболочку не событие рабочего дня.
--
-- ПРЕДПОЛЁТ (read-only, ожидаемые значения на 2026-08-07):
--   1) select count(*) from menumaker.safepass_devices where is_active and revoked_at is null;
--      -> 2 (Ridge/Red рабочий + ZZTEST).
--   2) select count(*) from menumaker.staff where is_active and pin_hash is not null;
--      -> 4, все Ridge.
--   Если чисел стало больше — это нормально (заводят PIN'ы); если меньше — стоп,
--   кто-то снял доступ, и стройку открывать нечем.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. «Кто это» — опознание без действия
-- ---------------------------------------------------------------------------
create or replace function menumaker.safepass_identify_by_pin(p_token text, p_pin_hash text)
returns jsonb
language plpgsql
security definer
set search_path to 'menumaker', 'public', 'extensions'
as $function$
declare v_dev record; v_staff record; v_center record;
begin
  -- ТОЧКА: живое classroom-устройство. Токен решает, ГДЕ мы; PIN — КТО мы.
  select d.*, c.name as classroom_name
    into v_dev
    from menumaker.safepass_devices d
    join menumaker.classrooms c on c.id = d.classroom_id
   where d.token_hash = encode(digest(p_token, 'sha256'), 'hex')
     and d.is_active and d.revoked_at is null;
  if not found then
    raise exception 'device not registered';
  end if;

  -- ОХВАТ: сотрудник ЭТОГО центра. PIN чужого центра не откроет эту дверь, даже
  -- если сам по себе верен, — соль хэша и есть center_id.
  select s.id, s.first_name, s.last_name, s.position, s.class_primary
    into v_staff
    from menumaker.staff s
   where s.center_id = v_dev.center_id and s.is_active and s.pin_hash = p_pin_hash;
  if not found then
    raise exception 'invalid PIN';
  end if;

  select c.slug, c.name into v_center
    from menumaker.centers c where c.id = v_dev.center_id;

  return jsonb_build_object(
    'staff_id',       v_staff.id,
    'staff_name',     trim(coalesce(v_staff.first_name,'') || ' ' || coalesce(v_staff.last_name,'')),
    'position',       v_staff.position,
    -- Комната сотрудника — из его карточки; у 13 из 73 она пуста, и оболочка
    -- обязана сказать это словами, а не показать пустой экран.
    'class_primary',  v_staff.class_primary,
    'has_classroom',  coalesce(nullif(trim(coalesce(v_staff.class_primary, '')), ''), null) is not null,
    'center_id',      v_dev.center_id,
    'center_slug',    v_center.slug,
    'center_name',    v_center.name,
    'classroom_id',   v_dev.classroom_id,
    'classroom_name', v_dev.classroom_name
  );
end $function$;

grant execute on function menumaker.safepass_identify_by_pin(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. «Мои смены» — только свои, только чтение
-- ---------------------------------------------------------------------------
-- Отдаёт СОБЫТИЯ, а не посчитанные часы: пары «пришёл → ушёл» и итог складывает
-- ОДИН вычислитель на клиенте (src/lib/staffHours.ts). Второго счёта часов в
-- проекте не заводится — ровно этим 07.08 разошлись строка и итог в карточке.
create or replace function menumaker.safepass_my_time(p_token text, p_pin_hash text, p_days integer default 7)
returns jsonb
language plpgsql
security definer
set search_path to 'menumaker', 'public', 'extensions'
as $function$
declare v_dev record; v_staff record; v_events jsonb; v_days integer;
begin
  select * into v_dev from menumaker.safepass_devices
   where token_hash = encode(digest(p_token,'sha256'),'hex') and is_active and revoked_at is null;
  if not found then raise exception 'device not registered'; end if;

  select s.id, s.first_name, s.last_name into v_staff
    from menumaker.staff s
   where s.center_id = v_dev.center_id and s.is_active and s.pin_hash = p_pin_hash;
  if not found then raise exception 'invalid PIN'; end if;

  -- Окно ограничено сверху: вкладка показывает неделю, а не всю историю.
  v_days := least(greatest(coalesce(p_days, 7), 1), 31);

  select coalesce(jsonb_agg(jsonb_build_object(
           'event_type', e.event_type,
           'event_at',   e.event_at,
           'classroom_name', c.name,
           'note',       e.note
         ) order by e.event_at), '[]'::jsonb)
    into v_events
    from menumaker.staff_time_events e
    left join menumaker.classrooms c on c.id = e.classroom_id
   where e.staff_id = v_staff.id
     and e.event_at >= now() - make_interval(days => v_days);

  return jsonb_build_object(
    'staff_id',   v_staff.id,
    'staff_name', trim(coalesce(v_staff.first_name,'') || ' ' || coalesce(v_staff.last_name,'')),
    'days',       v_days,
    'events',     v_events
  );
end $function$;

grant execute on function menumaker.safepass_my_time(text, text, integer) to anon, authenticated;

-- ============================================================================
-- ЧИТКА ПОСЛЕ ПРИМЕНЕНИЯ (read-back, ничего не пишет):
--   select menumaker.safepass_identify_by_pin('<живой токен>', '<хэш PIN Carolyn>');
--     -> staff_name = 'Carolyn Hercik', center_slug = 'ridge', classroom_name = 'Red',
--        has_classroom = true.
--   select menumaker.safepass_my_time('<живой токен>', '<хэш PIN Carolyn>', 7);
--     -> events: массив (на 07.08 в базе 25 событий на всех, у Carolyn — сколько есть).
--   Неверный PIN обязан дать 'invalid PIN', чужой токен — 'device not registered'.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 3. Комнаты центра — для того, у кого комнаты нет в карточке
-- ---------------------------------------------------------------------------
-- Слово владельца 07.08: вошедший без комнаты НЕ упирается в заглушку — он
-- ВЫБИРАЕТ комнату из комнат своего центра, и выбор идёт в след отметок (страница
-- «Дети» уже пишет в событие ту комнату, что выбрана, а не комнату планшета).
-- «Моё время» работает и БЕЗ выбора: свои часы человек видит всегда.
--
-- Охват — центр УСТРОЙСТВА, не сессии: список комнат чужого центра отсюда не
-- получить. Псевдоклассы персонала исключены тем же признаком is_roster, что и
-- везде: это не комнаты детей.
create or replace function menumaker.safepass_center_classrooms(p_token text)
returns jsonb
language plpgsql
security definer
set search_path to 'menumaker', 'public', 'extensions'
as $function$
declare v_dev record; v_rooms jsonb;
begin
  select * into v_dev from menumaker.safepass_devices
   where token_hash = encode(digest(p_token,'sha256'),'hex') and is_active and revoked_at is null;
  if not found then raise exception 'device not registered'; end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name)
                            order by coalesce(c.sort_order, 0), c.name), '[]'::jsonb)
    into v_rooms
    from menumaker.classrooms c
   where c.center_id = v_dev.center_id
     and c.is_active
     and coalesce(c.is_roster, true)
     and c.name !~* 'staff';

  return v_rooms;
end $function$;

grant execute on function menumaker.safepass_center_classrooms(text) to anon, authenticated;
