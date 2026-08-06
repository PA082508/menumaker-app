-- 20260806n_gatepulse_pretest.sql — предтестовый пакет GatePulse (гейт Б, 06.08)
--
-- Четыре вещи, каждая от своего замера:
--   (1) у бакета avatars НЕТ политики DELETE — «убрать фото» чистило колонку, а
--       снимок оставался в хранилище. Отзыв доступа, который не уносит лицо, —
--       это не отзыв. Канон-дыра июля, закрывается здесь.
--   (2) лицо родителя снимается при Register и пишется в photo_url тем же ключом
--       центра, что и сама регистрация (не шире).
--   (3) revoke гасит photo_url и ВОЗВРАЩАЕТ пути — клиент тем же жестом сносит
--       объекты. Вся прежняя семантика 20260724a/20260726a сохранена дословно.
--   (4) у staff_time_events RLS включён БЕЗ ЕДИНОЙ ПОЛИТИКИ: 25 живых отметок,
--       а любое чтение из-под authenticated возвращает пусто. Витрина часов
--       показывала ноль и выглядела правдой.
--
-- Forward-only: политики и функции создаются заново, старые записи не правятся.

-- ═══════════════════════════════════════════════════════════════════════════════
-- (1) AVATARS: DELETE ровно тем, у кого уже есть UPDATE. Шире не открываем.
-- ═══════════════════════════════════════════════════════════════════════════════
drop policy if exists avatars_delete      on storage.objects;
drop policy if exists avatars_delete_cook on storage.objects;

create policy avatars_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and menumaker.get_user_role() = any (array['director','office_manager','admin'])
  );

-- Повар удаляет только в пределах своего центра — как и загружает (avatar_center_allowed).
create policy avatars_delete_cook on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and menumaker.get_user_role() = 'cook'
    and menumaker.avatar_center_allowed(name)
  );

-- ═══════════════════════════════════════════════════════════════════════════════
-- (2) Лицо родителя: пишем путь в photo_url всех строк этого телефона в скоупе.
--     Строка на каждого ребёнка — лицо у человека одно, поэтому пишем во все.
-- ═══════════════════════════════════════════════════════════════════════════════
create or replace function menumaker.safepass_set_person_photo(p_phone text, p_path text)
returns jsonb language plpgsql security definer set search_path to 'menumaker','public' as $fn$
declare v_n int;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'staff_only'); end if;

  -- Регистрация лиц — директорское дело. auth.uid() пускал бы любую роль центра,
  -- включая cook и общий учительский вход: это кухонная стена, её не переступаем.
  -- Набор ролей — ЗЕРКАЛО политик бакета avatars, чтобы право писать путь и право
  -- положить объект не разъезжались.
  if coalesce(menumaker.get_user_role(), '') <> all (array['director','office_manager','admin']) then
    return jsonb_build_object('ok', false, 'error', 'not_authorized');
  end if;

  -- Путь принимается ТОЛЬКО родительский. Без этого гарда photo_url можно указать
  -- на чужой объект бакета (лицо ребёнка или сотрудника) — и витрина двери
  -- показала бы не того человека, ничего при этом не нарушив формально.
  if p_path is null or p_path not like 'parent/%' then
    return jsonb_build_object('ok', false, 'error', 'bad_path');
  end if;

  update menumaker.safepass_trusted_persons tp
     set photo_url = p_path, updated_at = now()
   where tp.phone = p_phone and tp.is_active
     and (tp.center_id = any (menumaker.my_center_ids())
          or menumaker.is_org_owner(tp.org_id));
  get diagnostics v_n = row_count;
  if v_n = 0 then return jsonb_build_object('ok', false, 'error', 'not_authorized'); end if;

  return jsonb_build_object('ok', true, 'rows', v_n);
end $fn$;
revoke execute on function menumaker.safepass_set_person_photo(text,text) from public, anon;
grant  execute on function menumaker.safepass_set_person_photo(text,text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════
-- (3) Лицо отдаётся в витрину и УНОСИТСЯ отзывом.
-- ═══════════════════════════════════════════════════════════════════════════════
create or replace function menumaker.safepass_pickup_candidates()
returns jsonb language plpgsql security definer set search_path to 'menumaker','public' as $fn$
declare v_rows jsonb;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'staff_only'); end if;
  select coalesce(jsonb_agg(r order by r->>'person_name'), '[]'::jsonb) into v_rows from (
    select jsonb_build_object(
      'phone', tp.phone,
      'person_name', max(tp.person_name),
      'child_count', count(distinct tp.child_id),
      'phone_verified', bool_or(tp.phone_verified),
      'registered', bool_or(tp.registered_at is not null),
      'photo_url', max(tp.photo_url)                    -- ← 06.08: лицо для двери
    ) as r
    from menumaker.safepass_trusted_persons tp
    where tp.is_active and tp.phone is not null
      and (tp.center_id = any(menumaker.my_center_ids())
           or menumaker.is_org_owner(tp.org_id))        -- ГД: право от РОЛИ, не от строки центра
      and (tp.access_from  is null or tp.access_from  <= current_date)
      and (tp.access_until is null or tp.access_until >= current_date)
    group by tp.phone
  ) s;
  return jsonb_build_object('ok', true, 'candidates', v_rows);
end $fn$;
revoke execute on function menumaker.safepass_pickup_candidates() from public, anon;
grant  execute on function menumaker.safepass_pickup_candidates() to authenticated;

create or replace function menumaker.safepass_revoke_parent_trust(p_phone text)
returns jsonb language plpgsql security definer set search_path to 'menumaker','public' as $fn$
declare v_n int; v_photos text[];
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'staff_only'); end if;

  if not exists (
    select 1 from menumaker.safepass_trusted_persons tp
     where tp.phone = p_phone
       and (tp.center_id = any(menumaker.my_center_ids())
            or menumaker.is_org_owner(tp.org_id))
  ) then
    return jsonb_build_object('ok', false, 'error', 'not_authorized');
  end if;

  -- Пути запоминаем ДО очистки — иначе сносить будет нечего.
  select array_agg(distinct tp.photo_url) into v_photos
    from menumaker.safepass_trusted_persons tp
   where tp.phone = p_phone and tp.photo_url is not null
     and (tp.center_id = any(menumaker.my_center_ids())
          or menumaker.is_org_owner(tp.org_id));

  update menumaker.safepass_trusted_persons tp
     set phone_verified = false, phone_verified_at = null,
         registered_at = null, registered_by = null,
         photo_url = null                                -- ← 06.08: лицо уходит с доступом
   where tp.phone = p_phone
     and (tp.center_id = any(menumaker.my_center_ids())
          or menumaker.is_org_owner(tp.org_id));

  update menumaker.safepass_parent_sessions ps set is_active = false
   where ps.phone = p_phone and ps.is_active
     and exists (select 1 from menumaker.safepass_trusted_persons tp
                  where tp.phone = ps.phone
                    and (tp.center_id = any(menumaker.my_center_ids())
                         or menumaker.is_org_owner(tp.org_id)));
  get diagnostics v_n = row_count;

  return jsonb_build_object('ok', true, 'sessions_killed', v_n,
                            'photos', coalesce(to_jsonb(v_photos), '[]'::jsonb));
end $fn$;
revoke execute on function menumaker.safepass_revoke_parent_trust(text) from public, anon;
grant  execute on function menumaker.safepass_revoke_parent_trust(text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════
-- (4) ЧАСЫ: у таблицы был включён RLS без единой политики — читать могла только
--     service_role, а витрина честно показывала ноль.
--     Охват НЕ организационный: часы персонала — это кто когда пришёл и ушёл,
--     и «член организации» тут слишком широко (повар видел бы смены чужого
--     центра). Открываем СВОЙ ЦЕНТР директорским ролям; ГД идёт по владельческой
--     ветке, потому что у него ноль строк в user_center_access и один
--     my_center_ids() его ослепляет. Само-чтение сотрудником своих часов — не
--     здесь и не сейчас, отдельным заходом.
--     Запись остаётся за service_role: отметки ставит дверь, а не рука.
-- ═══════════════════════════════════════════════════════════════════════════════
drop policy if exists staff_time_events_org_read    on menumaker.staff_time_events;
drop policy if exists staff_time_events_center_read on menumaker.staff_time_events;
create policy staff_time_events_center_read on menumaker.staff_time_events
  for select to authenticated
  using (
    coalesce(menumaker.get_user_role(), '') = any (array['director','office_manager','admin'])
    and (center_id = any (menumaker.my_center_ids())
         or menumaker.is_org_owner(org_id))
  );
