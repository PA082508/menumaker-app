-- 20260806q_staff_org_layer.sql — слой сотрудника: орг-уровень скрыт от центров (06.08)
--
-- ЗАМЕР (скрины Staff Ridge): директор центра видит весь организационный слой —
-- Татьяну, Николая, Lidia, Ross, Philippe. Не потому что «UI не отфильтровал», а
-- потому что эти люди физически сидят в центре Ridge: RLS пускает по center_id,
-- и никакой центр-лок в адресе такого не закроет. Слой не был назван в данных.
--
-- СТЕНА ОДНОСТОРОННЯЯ (рамка владельца): вниз закрыто, вверх открыто —
-- владельческая ветка in_org(admin/office_manager/accountant) остаётся нетронутой,
-- иначе ГД ослепнет молча (эта ошибка уже стоила живого теста, 20260726a).
--
-- Признак — КОЛОНКА, а не список имён: новый административный сотрудник скрывается
-- сам, перечислять его негде.
--
-- ЧЕГО ЭТОТ ПРИЗНАК НЕ КАСАЕТСЯ: водительский и транспортный контур. Все семь RPC
-- рейсов (20260727e) — security definer и опознают человека по токену устройства и
-- хэшу PIN, а не по сессии директора; RLS на staff их не касается вовсе. Philippe
-- уходит из кадровых списков и остаётся водителем в своём контуре.

alter table menumaker.staff
  add column if not exists is_org_level boolean not null default false;

comment on column menumaker.staff.is_org_level is
  'Организационный слой: администрация и роли на всю организацию. Скрыт из центровых списков, карточек и Time Log; водительский/транспортный контур не затронут.';

-- Бэкфилл по личностям ОДИН РАЗ (пятеро, слово владельца 06.08); дальше — галка в карточке.
update menumaker.staff set is_org_level = true
 where id in (
   '727dbc39-3c1c-4019-88ac-2d68160c3d65',  -- Tatiana Kogan · Director
   'cef3981c-8fa1-425e-82e4-ec99df001230',  -- Nikolay Kutsenko · Manager
   'a461ef08-00ca-4825-9173-0e7570f63385',  -- Lidia Kutsenko · Manager
   '52343830-f2dd-4a89-98c7-82999d36eda8',  -- Ross Kogan · Bookkeeper
   '6ee1a68f-1988-4afb-af48-72171171c9c0'   -- Philippe Kogan · Driver/экспедитор
 );

drop policy if exists staff_scope on menumaker.staff;
create policy staff_scope on menumaker.staff for all to authenticated
  using (
    (center_id = any (menumaker.my_center_ids()) and not coalesce(is_org_level, false))
    or menumaker.in_org(org_id, array['admin','office_manager','accountant'])
  )
  with check (
    (center_id = any (menumaker.my_center_ids()) and not coalesce(is_org_level, false))
    or menumaker.in_org(org_id, array['admin','office_manager','accountant'])
  );

-- ═══════════════════════════════════════════════════════════════════════════════
-- PIN-двери наследуют слой: иначе директор центра заведёт PIN Татьяне, которую
-- он уже не видит в списках, — дыра ровно того рода, ради которой заход и открыт.
-- ═══════════════════════════════════════════════════════════════════════════════
create or replace function menumaker.safepass_set_staff_pin(p_staff_id uuid, p_pin text)
returns void language plpgsql security definer
set search_path to 'menumaker','public','extensions' as $fn$
declare v_center uuid; v_org uuid; v_org_level boolean; v_hash text;
begin
  select center_id, org_id, coalesce(is_org_level,false)
    into v_center, v_org, v_org_level
    from menumaker.staff where id = p_staff_id;
  if v_center is null then raise exception 'staff not found'; end if;

  if coalesce(menumaker.get_user_role(),'') <> all (array['director','office_manager','admin'])
     or not (v_center = any (menumaker.my_center_ids()) or menumaker.is_org_owner(v_org)) then
    raise exception 'not authorized to set PINs for this center';
  end if;

  -- Орг-слой — только администрация организации.
  if v_org_level and not menumaker.in_org(v_org, array['admin','office_manager']) then
    raise exception 'not authorized to set PINs for this center';
  end if;

  if p_pin !~ '^[0-9]{4}$' then raise exception 'PIN must be 4 digits'; end if;

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

create or replace function menumaker.safepass_staff_pin_status(p_staff_id uuid)
returns jsonb language plpgsql security definer
set search_path to 'menumaker','public' as $fn$
declare r record;
begin
  select s.pin_hash is not null as has_pin, s.pin_set_at, s.pin_set_by,
         s.center_id, s.org_id, coalesce(s.is_org_level,false) as org_level
    into r from menumaker.staff s where s.id = p_staff_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;

  if coalesce(menumaker.get_user_role(),'') <> all (array['director','office_manager','admin'])
     or not (r.center_id = any (menumaker.my_center_ids()) or menumaker.is_org_owner(r.org_id)) then
    return jsonb_build_object('ok', false, 'error', 'not_authorized');
  end if;

  -- У ВОПРОСА И ОТВЕТА ОДИН ОХВАТ — включая слой.
  if r.org_level and not menumaker.in_org(r.org_id, array['admin','office_manager']) then
    return jsonb_build_object('ok', false, 'error', 'not_authorized');
  end if;

  return jsonb_build_object('ok', true, 'has_pin', r.has_pin, 'set_at', r.pin_set_at,
    'set_by', (select u.email from auth.users u where u.id = r.pin_set_by));
end $fn$;
revoke execute on function menumaker.safepass_staff_pin_status(uuid) from public, anon;
grant  execute on function menumaker.safepass_staff_pin_status(uuid) to authenticated;
