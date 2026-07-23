-- 20260723c_safepass_codeless_activation.sql — SafePass CODELESS device-trust activation
--
-- ⛔ PREPARE — НЕ ПРИМЕНЕНО. DARK. Прокат — словом Николая по live-DB протоколу.
--
-- РЕШЕНИЕ (Николай): кодовый путь (родитель ТИПАЕТ 6-значный код) заменяется CODELESS-
-- активацией. Staff/директор выбирает родителя из ✓Pickup-списка → «Activate this phone» →
-- родитель открывает PWA по QR/ссылке С ЭКРАНА STAFF → девайс trusted БЕЗ кода. Личное
-- присутствие (staff мнёт ссылку, родитель сканирует тут же) = верификация; phone_verified=true
-- проставляется попутно. Код-путь остаётся ТИХИМ fallback для НЕ-родительских pickup.
--
-- МИНИМАЛЬНЫЙ ХОД: переиспользуем safepass_login_codes как одноразовый activation-token store
-- (staff мнёт токен через существующий safepass_issue_login_code — токен уходит В ССЫЛКУ, не в
-- набор родителя) + safepass_parent_sessions как device-trust запись. Две тонкие RPC:

begin;

-- ── (1) CODELESS активация. anon (родитель на своём телефоне). Потребляет одноразовый токен,
--        помечает phone_verified, пишет device-trust сессию. Никакого набора кода родителем.
create or replace function menumaker.safepass_activate_device(p_phone text, p_token text, p_device_id text)
returns jsonb language plpgsql security definer set search_path to 'menumaker','public','extensions' as $fn$
declare v_code record;
begin
  -- одноразовый токен (тот же store, что и login-код; здесь он живёт только в QR-ссылке)
  select * into v_code from menumaker.safepass_login_codes
   where phone = p_phone and code = p_token and used_at is null and is_active and now() < expires_at
   for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;
  update menumaker.safepass_login_codes set used_at = now(), is_active = false where id = v_code.id;

  -- личное присутствие → телефон доверенного лица верифицирован
  update menumaker.safepass_trusted_persons
     set phone_verified = true, phone_verified_at = now()
   where phone = p_phone and is_active;

  -- device-trust: одна активная сессия на (phone, device)
  update menumaker.safepass_parent_sessions set is_active = false
   where phone = p_phone and device_id = p_device_id and is_active;
  insert into menumaker.safepass_parent_sessions
    (org_id, phone, device_id, person_name, verified_at, expires_at, last_used_at, is_active)
  values (v_code.org_id, p_phone, p_device_id, v_code.person_name, now(), now() + interval '30 days', now(), true);

  return jsonb_build_object('ok', true, 'person_name', v_code.person_name);
end $fn$;
revoke execute on function menumaker.safepass_activate_device(text,text,text) from public;
grant  execute on function menumaker.safepass_activate_device(text,text,text) to anon, authenticated;

-- ── (2) ✓Pickup-список для экрана staff: активные доверенные лица центра(ов) вызывающего,
--        дедуп по телефону. authenticated (staff), DEFINER (RLS на trusted_persons для чтения
--        не гарантирован). Директор без center_access увидит пусто — для пилота список нужен
--        сервис-аккаунту центра (у него my_center_ids() = его центр).
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
      'phone_verified', bool_or(tp.phone_verified)
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

commit;

-- ═════════════════════════════════════════════════════════════════════════════
-- READ-BACK (вписать после apply)
-- ═════════════════════════════════════════════════════════════════════════════
-- R1. Обе функции есть, DEFINER; activate: anon+auth exec; candidates: auth only, anon=false.
-- R2. ФУНКЦ. (ZZTEST, с чисткой в 0): вставить login_code(token) → activate_device(phone,token,dev)
--     → ok=true, parent_session создана (verified_at, is_active), trusted.phone_verified=true, токен used.
-- R3. Полная цепочка: activate → request_handoff → confirm_handoff → confirmed; затем DELETE тест-строк → 0.
