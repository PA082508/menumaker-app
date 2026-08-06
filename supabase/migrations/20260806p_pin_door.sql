-- 20260806p_pin_door.sql — дверь к PIN сотрудника (V.1, 06.08)
--
-- ЗАМЕР ДНЯ: PIN заведён у 3 сотрудников из 72, у директоров — ни у кого, и у
-- Tatiana Kogan (Director, Ridge) строка есть, а PIN пуст. Cover class и канон
-- «непрерывность взрослого» физически упираются в это: чек-ниться нечем.
-- Причина простая — двери в интерфейсе нет вовсе, PIN заводится только SQL-ом.
-- SQL-выдачу как практику не плодим (решение владельца).
--
-- Что здесь делается:
--   (1) след «кем/когда» — двух колонок не было;
--   (2) запись PIN сужается со ВСЕЙ организации до СВОЕГО ЦЕНТРА + отбой
--       тривиальных комбинаций (отказ говорит причину словами);
--   (3) статус «есть/нет» отдельной функцией — колонка pin_hash закрыта
--       привилегией (20260728aa) и открывать её нельзя: 4-значный PIN при
--       известном center_id перебирается по хэшу за секунды.
--
-- Формат остаётся 4 цифры: пад SafePass жёстко четырёхзначный (PinPad
-- отправляет форму на четвёртой цифре), и PIN из шести цифр стал бы PIN'ом,
-- который невозможно ввести у двери. «4–6 + переделка пада» — отдельный заход.
--
-- Forward-only: колонки добавляются, функции пересоздаются, данные не правятся.

alter table menumaker.staff
  add column if not exists pin_set_at timestamptz,
  add column if not exists pin_set_by uuid;

-- ═══════════════════════════════════════════════════════════════════════════════
-- (1) ЗАВЕДЕНИЕ PIN — СВОЙ ЦЕНТР.
--     Было: `core.is_org_member(org_id)` — директор Pearl мог завести PIN
--     сотруднику Ridge. Владельческая ветка остаётся АВАРИЙНЫМ ЗАПАСОМ
--     (директор недоступен — владелец выручает), и pin_set_by честно показывает
--     такое исключение. Практика «PIN своим людям заводит их директор» держится
--     договорённостью и инструкцией, а не сужением кода — по слову владельца.
-- ═══════════════════════════════════════════════════════════════════════════════
create or replace function menumaker.safepass_set_staff_pin(p_staff_id uuid, p_pin text)
returns void language plpgsql security definer
set search_path to 'menumaker','public','extensions' as $fn$
declare v_center uuid; v_org uuid; v_hash text;
begin
  select center_id, org_id into v_center, v_org from menumaker.staff where id = p_staff_id;
  if v_center is null then raise exception 'staff not found'; end if;

  if coalesce(menumaker.get_user_role(),'') <> all (array['director','office_manager','admin'])
     or not (v_center = any (menumaker.my_center_ids()) or menumaker.is_org_owner(v_org)) then
    raise exception 'not authorized to set PINs for this center';
  end if;

  if p_pin !~ '^[0-9]{4}$' then raise exception 'PIN must be 4 digits'; end if;

  -- Отбой тривиальных: одна цифра четырежды и четыре подряд в любую сторону.
  -- Отказ называет причину — «неверный формат» заставило бы гадать.
  if p_pin ~ '^(.)\1{3}$'
     or position(p_pin in '0123456789') > 0
     or position(p_pin in '9876543210') > 0 then
    raise exception 'That PIN is too easy to guess — avoid 1111, 1234, 4321';
  end if;

  v_hash := menumaker._safepass_pin_hash(v_center, p_pin);
  if exists (select 1 from menumaker.staff
              where center_id = v_center and pin_hash = v_hash and id <> p_staff_id) then
    raise exception 'PIN already in use at this center — choose another';
  end if;

  update menumaker.staff
     set pin_hash = v_hash, pin_set_at = now(), pin_set_by = auth.uid(), updated_at = now()
   where id = p_staff_id;
end $fn$;
revoke execute on function menumaker.safepass_set_staff_pin(uuid,text) from public, anon;
grant  execute on function menumaker.safepass_set_staff_pin(uuid,text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════
-- (2) СОСТОЯНИЕ «есть/нет» — БЕЗ раскрытия. Хэш не отдаётся ни в каком виде.
--     У ВОПРОСА И ОТВЕТА ОДИН ОХВАТ (правка владельца 06.08): тот же роль-гейт,
--     что на записи, поверх охвата центра — повар и учительский вход не видят
--     даже факта наличия PIN.
-- ═══════════════════════════════════════════════════════════════════════════════
create or replace function menumaker.safepass_staff_pin_status(p_staff_id uuid)
returns jsonb language plpgsql security definer
set search_path to 'menumaker','public' as $fn$
declare r record;
begin
  select s.pin_hash is not null as has_pin, s.pin_set_at, s.pin_set_by, s.center_id, s.org_id
    into r from menumaker.staff s where s.id = p_staff_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;

  if coalesce(menumaker.get_user_role(),'') <> all (array['director','office_manager','admin'])
     or not (r.center_id = any (menumaker.my_center_ids()) or menumaker.is_org_owner(r.org_id)) then
    return jsonb_build_object('ok', false, 'error', 'not_authorized');
  end if;

  return jsonb_build_object('ok', true, 'has_pin', r.has_pin, 'set_at', r.pin_set_at,
    'set_by', (select u.email from auth.users u where u.id = r.pin_set_by));
end $fn$;
revoke execute on function menumaker.safepass_staff_pin_status(uuid) from public, anon;
grant  execute on function menumaker.safepass_staff_pin_status(uuid) to authenticated;
