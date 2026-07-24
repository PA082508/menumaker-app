-- 20260724a_safepass_number_gate.sql — SafePass B: NUMBER-GATE activation (replaces codeless-QR default)
--
-- ⛔ PREPARE ONLY — НЕ ПРИМЕНЕНО. Применять только по отдельному слову Николая, затем read-back ниже.
-- forward-only: 20260723c НЕ редактируется; здесь новая миграция поверх.
--
-- РЕШЕНИЕ (Николай, 2026-07-24, ядро B): QR/код-минт заменяется на «номер = registered в центре».
--   Staff тапает «Registered» у родителя из ✓Pickup-списка (ставит registered_at/by).
--   Родитель открывает ОБЩУЮ ссылку центра → вводит свой номер ОДИН раз → доступ, если номер
--   registered + активен + в окне доступа. Ничего не типизируется из 6-значных кодов, никаких QR.
--
-- ── ФАКТЫ РАЗВЕДКИ (2026-07-24, read-only), на которых стоит гейт:
--   • safepass_trusted_persons — ЕДИНСТВЕННЫЙ надёжный источник SafePass-eligibility (как и все
--     существующие RPC: issue_login_code / children_for_phone гейтят по tp.is_active).
--   • can_pickup живёт на child_guardian (Family), развязан от SafePass: НЕТ ни триггера, ни функции
--     child_guardian↔trusted_persons. На живых данных Red: 22 активных tp, все 22 матчатся к guardian
--     по телефону, но 0/22 имеют child_guardian.can_pickup=true на своей паре guardian+child.
--   • ⇒ Гейтить активацию по can_pickup = запереть ВСЕХ 22 родителей. НЕ гейтим по can_pickup.
--   • ⇒ Рычаг B «снятие ✓Pickup → доступ умирает» СЕЙЧАС no-op (Family развязан). См. ZZTEST L-B и
--     докладную записку — требуется отдельное решение по проводке Family→SafePass (вне этой миграции).
--
-- ── РЕШЕНИЯ, доложенные строкой (см. чат):
--   (a) activate_device: CREATE OR REPLACE не умеет переименовать параметр (p_token→p_center), поэтому
--       DROP+CREATE в этой новой миграции. 20260723c не тронут → forward-only соблюдён.
--   (b) B-6 kick: сбрасываем registered_at (не «по вкусу» — иначе kick обходится мгновенной
--       ре-активацией по номеру; после kick нужен повторный тап staff «Registered»).
--   (c) eligibility «✓Pickup/active» в SafePass-домене = tp.is_active (проекция ✓Pickup); can_pickup НЕ трогаем.

begin;

-- ═══════════════════════════════════════════════════════════════════════════════
-- (0) Зеркало safepass_devices: кто и когда «зарегистрировал» доверенное лицо (staff-тап «Registered»)
-- ═══════════════════════════════════════════════════════════════════════════════
alter table menumaker.safepass_trusted_persons
  add column if not exists registered_at timestamptz,
  add column if not exists registered_by uuid;

-- ═══════════════════════════════════════════════════════════════════════════════
-- (1) STAFF: пометить доверенное лицо «registered» (кнопка «Registered» на /safepass/issue).
--     center-scoped (my_center_ids), staff-only. Ставит registered_at/by на ВСЕ активные строки
--     этого телефона в центрах вызывающего (одно лицо = несколько детей = несколько строк).
-- ═══════════════════════════════════════════════════════════════════════════════
create or replace function menumaker.safepass_mark_person_registered(p_phone text)
returns jsonb language plpgsql security definer set search_path to 'menumaker','public' as $fn$
declare v_n int;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'staff_only'); end if;
  update menumaker.safepass_trusted_persons
     set registered_at = now(), registered_by = auth.uid()
   where phone = p_phone and is_active
     and center_id = any(menumaker.my_center_ids());
  get diagnostics v_n = row_count;
  if v_n = 0 then return jsonb_build_object('ok', false, 'error', 'not_authorized'); end if;
  return jsonb_build_object('ok', true, 'rows', v_n);
end $fn$;
revoke execute on function menumaker.safepass_mark_person_registered(text) from public, anon;
grant  execute on function menumaker.safepass_mark_person_registered(text) to authenticated;

-- (1b) ✓Pickup-список staff теперь несёт флаг `registered` (для бейджа + вкл. кнопки Revoke).
--      forward-only CREATE OR REPLACE поверх 20260723c; тело идентично + одно поле.
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
      'registered', bool_or(tp.registered_at is not null)
    ) as r
    from menumaker.safepass_trusted_persons tp
    where tp.is_active and tp.phone is not null
      and tp.center_id = any(menumaker.my_center_ids())
      and (tp.access_from  is null or tp.access_from  <= current_date)
      and (tp.access_until is null or tp.access_until >= current_date)
    group by tp.phone
  ) s;
  return jsonb_build_object('ok', true, 'candidates', v_rows);
end $fn$;
revoke execute on function menumaker.safepass_pickup_candidates() from public, anon;
grant  execute on function menumaker.safepass_pickup_candidates() to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════
-- (2) PARENT (anon): NUMBER-GATE активация. Заменяет токен-минт из 20260723c.
--     Гейт: номер registered + активен + в окне доступа в ЭТОМ центре.
--     Гард дублей center-scoped: >1 РАЗНЫХ registered-персон на norm_phone в центре → отказ 'ambiguous'
--     (падение в код-рельс на фронте). Хвост (phone_verified + device-trust сессия) как в 20260723c.
--     (a) DROP старой токен-сигнатуры (text,text,text) → CREATE новой (p_phone, p_center, p_device_id).
drop function if exists menumaker.safepass_activate_device(text, text, text);
create function menumaker.safepass_activate_device(p_phone text, p_center text, p_device_id text)
returns jsonb language plpgsql security definer set search_path to 'menumaker','public','extensions' as $fn$
declare
  v_center uuid := nullif(p_center,'')::uuid;
  v_persons int;
  v_row record;
begin
  -- registered + активные + в окне; в конкретном центре, если он передан общей ссылкой.
  -- Считаем РАЗНЫЕ имена лиц на этот номер (защита от одного номера у двух разных людей).
  select count(distinct person_name) into v_persons
    from menumaker.safepass_trusted_persons
   where phone = p_phone and is_active and registered_at is not null
     and (v_center is null or center_id = v_center)
     and (access_from  is null or access_from  <= current_date)
     and (access_until is null or access_until >= current_date);

  if v_persons = 0 then
    -- не registered / не активен / не в окне → тихо в код-рельс на фронте
    return jsonb_build_object('ok', false, 'error', 'not_registered');
  elsif v_persons > 1 then
    -- дубль номера у разных лиц → auto-trust отказан (ратифицированный гард)
    return jsonb_build_object('ok', false, 'error', 'ambiguous');
  end if;

  -- ровно одно лицо: берём его org/центр/имя
  select org_id, center_id, person_name into v_row
    from menumaker.safepass_trusted_persons
   where phone = p_phone and is_active and registered_at is not null
     and (v_center is null or center_id = v_center)
   order by created_at limit 1;

  -- личное присутствие (родитель на своём телефоне, номер сверен) → phone_verified
  update menumaker.safepass_trusted_persons
     set phone_verified = true, phone_verified_at = now()
   where phone = p_phone and is_active;

  -- device-trust: одна активная сессия на (phone, device); localStorage-devId живёт 30 дней
  update menumaker.safepass_parent_sessions set is_active = false
   where phone = p_phone and device_id = p_device_id and is_active;
  insert into menumaker.safepass_parent_sessions
    (org_id, phone, device_id, person_name, verified_at, expires_at, last_used_at, is_active)
  values (v_row.org_id, p_phone, p_device_id, v_row.person_name, now(), now() + interval '30 days', now(), true);

  return jsonb_build_object('ok', true, 'person_name', v_row.person_name);
end $fn$;
revoke execute on function menumaker.safepass_activate_device(text,text,text) from public;
grant  execute on function menumaker.safepass_activate_device(text,text,text) to anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════
-- (3) PARENT (anon): RESUME. On-load проверка живой device-trust сессии (P3 «дальше автоматом»).
--     Пере-валидирует eligibility, поэтому kick/expiry/де-регистрация гасят авто-вход.
-- ═══════════════════════════════════════════════════════════════════════════════
create or replace function menumaker.safepass_resume_session(p_phone text, p_device_id text)
returns jsonb language plpgsql security definer set search_path to 'menumaker','public' as $fn$
declare v_ok boolean; v_name text;
begin
  select true, max(tp.person_name) into v_ok, v_name
    from menumaker.safepass_parent_sessions ps
    join menumaker.safepass_trusted_persons tp
      on tp.phone = ps.phone and tp.is_active and tp.registered_at is not null
     and (tp.access_from  is null or tp.access_from  <= current_date)
     and (tp.access_until is null or tp.access_until >= current_date)
   where ps.phone = p_phone and ps.device_id = p_device_id and ps.is_active
     and (ps.expires_at is null or now() < ps.expires_at)
  having count(*) > 0;

  if v_ok is not true then return jsonb_build_object('ok', false); end if;
  update menumaker.safepass_parent_sessions set last_used_at = now()
   where phone = p_phone and device_id = p_device_id and is_active;
  return jsonb_build_object('ok', true, 'person_name', v_name);
end $fn$;
revoke execute on function menumaker.safepass_resume_session(text,text) from public;
grant  execute on function menumaker.safepass_resume_session(text,text) to anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════
-- (4) B-6 KICK (staff/director): точечно глушит ДОСТУП ПРИЛОЖЕНИЯ у доверенного лица.
--     • safepass_parent_sessions.is_active = false        (device-trust снят на всех устройствах)
--     • trusted_persons.phone_verified = false, _at=null   (сброс trust)
--     • trusted_persons.registered_at/by = null            (решение (b): иначе kick обходится ре-активацией)
--     • tp.is_active НЕ трогаем — лицо остаётся авторизованным на pickup, гасим только e-доступ
--     • can_pickup (Family) НЕ трогаем — это ОТДЕЛЬНЫЙ рычаг
--     center-scoped + staff-only.
-- ═══════════════════════════════════════════════════════════════════════════════
create or replace function menumaker.safepass_revoke_parent_trust(p_phone text)
returns jsonb language plpgsql security definer set search_path to 'menumaker','public' as $fn$
declare v_n int;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'staff_only'); end if;

  -- разрешено только по своим центрам
  if not exists (
    select 1 from menumaker.safepass_trusted_persons
     where phone = p_phone and center_id = any(menumaker.my_center_ids())
  ) then
    return jsonb_build_object('ok', false, 'error', 'not_authorized');
  end if;

  update menumaker.safepass_trusted_persons
     set phone_verified = false, phone_verified_at = null,
         registered_at = null, registered_by = null
   where phone = p_phone and center_id = any(menumaker.my_center_ids());

  update menumaker.safepass_parent_sessions ps set is_active = false
   where ps.phone = p_phone and ps.is_active
     and exists (select 1 from menumaker.safepass_trusted_persons tp
                  where tp.phone = ps.phone and tp.center_id = any(menumaker.my_center_ids()));
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', true, 'sessions_killed', v_n);
end $fn$;
revoke execute on function menumaker.safepass_revoke_parent_trust(text) from public, anon;
grant  execute on function menumaker.safepass_revoke_parent_trust(text) to authenticated;

commit;

-- ═══════════════════════════════════════════════════════════════════════════════
-- READ-BACK (вписать после apply)
-- ═══════════════════════════════════════════════════════════════════════════════
-- R1. Колонки registered_at/registered_by есть на safepass_trusted_persons.
-- R2. 4 функции есть; activate_device: сигнатура (text,text,text) с параметрами (p_phone,p_center,p_device_id),
--     токен-версия отсутствует; grants: activate/resume = anon+auth, mark/revoke = auth only (anon/public revoked).
-- R3. ZZTEST полной цепочки на Bates (Khaza d0909487 в Red, phone +1...), чистка в 0 — см. отдельный скрипт
--     docs/prepare/20260724a_safepass_number_gate_ZZTEST.sql:
--       L-A (kick):  mark_registered → activate(number) ok → request_handoff → confirm(Maureen,Red) confirmed
--                    → revoke_parent_trust → resume() ok:false, activate() 'not_registered' (доступ умер),
--                    child_guardian.can_pickup НЕ изменён (Pickup остаётся). Чистка → 0.
--       L-B (✓Pickup): снять can_pickup в Family (child_guardian) → activate()/resume() ДОЛЖЕН падать.
--                    ОЖИДАЕМО СЕЙЧАС: доступ ВЫЖИВАЕТ (Family развязан) — это репортим как finding,
--                    НЕ как зелёный. Проводка Family→SafePass — отдельное решение (см. докладную).
