-- 20260724a_safepass_number_gate_ZZTEST.sql — full-chain ZZTEST for the NUMBER-GATE (ядро B)
--
-- ⛔ Запускать ТОЛЬКО ПОСЛЕ apply 20260724a_safepass_number_gate.sql.
-- САМООЧИЩАЮЩИЙСЯ: весь блок пишет во временном контексте и в конце делает RAISE → полный ROLLBACK,
--   поэтому «чистка в 0» гарантирована (ничего не остаётся; sealed-строк тут нет, rollback безопасен).
--
-- СИГНАЛ:
--   • Прошло  → единственная ошибка в конце: 'ZZTEST_ROLLBACK_OK — …' (это УСПЕХ; всё откатилось).
--   • Упало   → ошибка 'FAIL N: …' (реальный провал, до отката).
--   RAISE NOTICE по шагам видны в psql / Supabase SQL editor (в execute_sql могут не отображаться —
--   тогда ориентир только на финальное сообщение OK vs FAIL).
--
-- ДАННЫЕ (Red, live): Bryant Jackson +12166477477 (Bates Khaza+Kylie; единств. лицо на номере → happy path),
--   Deidra Booker +12166323285 (для dup-guard), center Red 4aed7d5a, child Bates Khaza d0909487.
--
-- ПОКРЫТИЕ: gate-closed→register→gate-open(verified+session)→resume→request_handoff→dup-guard(ambiguous)
--   →LEVER A kick(доступ мёртв, pickup/is_active остаётся)→LEVER B ✓Pickup (репорт finding).
--   confirm_handoff (teacher+device token+PIN) НЕ здесь — это живой Red-шаг (гейт его не меняет).
--   staff-RPC (mark_registered/revoke) staff-gated (auth.uid()) → в SQL их ЭФФЕКТ применяется UPDATE'ом;
--   сами RPC прогоняются в живом UI-тесте Red.

do $zz$
declare
  v_phone  text := '+12166477477';   -- Bryant Jackson (Bates Khaza+Kylie), Red
  v_phone2 text := '+12166323285';   -- Deidra Booker, Red — для dup-guard
  v_center text := '4aed7d5a-00d0-4a4c-ac99-311046ad2027';
  v_child  text := 'd0909487-e0c7-40eb-854d-a49182c36734';  -- Bates Khaza
  v_dev    text := 'zz-dev-numbergate';
  r jsonb; v_sessions int;
begin
  -- baseline: снять registered/verified/trust у Bryant
  update menumaker.safepass_trusted_persons
     set registered_at=null, registered_by=null, phone_verified=false, phone_verified_at=null
   where phone=v_phone;
  update menumaker.safepass_parent_sessions set is_active=false where phone=v_phone;

  -- 1) GATE CLOSED: не registered → activate падает 'not_registered'
  r := menumaker.safepass_activate_device(v_phone, v_center, v_dev);
  if (r->>'ok')::bool then raise exception 'FAIL 1: activate succeeded before Register (r=%)', r; end if;
  if r->>'error' <> 'not_registered' then raise exception 'FAIL 1b: expected not_registered got %', r; end if;
  raise notice 'OK 1  gate closed before Register: %', r;

  -- 2) staff Register  (== эффект safepass_mark_person_registered; RPC staff-gated, UI-тест)
  update menumaker.safepass_trusted_persons set registered_at=now() where phone=v_phone and is_active;

  -- 3) GATE OPEN: activate ok, phone_verified=true, ровно 1 активная trust-сессия
  r := menumaker.safepass_activate_device(v_phone, v_center, v_dev);
  if not (r->>'ok')::bool then raise exception 'FAIL 3: activate failed after Register (r=%)', r; end if;
  if not exists(select 1 from menumaker.safepass_trusted_persons where phone=v_phone and phone_verified)
     then raise exception 'FAIL 3b: phone_verified not set'; end if;
  select count(*) into v_sessions
    from menumaker.safepass_parent_sessions where phone=v_phone and device_id=v_dev and is_active;
  if v_sessions <> 1 then raise exception 'FAIL 3c: expected 1 trust session got %', v_sessions; end if;
  raise notice 'OK 3  number-gate open, verified, session=1: %', r;

  -- 4) RESUME ok, пока сессия жива
  r := menumaker.safepass_resume_session(v_phone, v_dev);
  if not (r->>'ok')::bool then raise exception 'FAIL 4: resume failed while live (r=%)', r; end if;
  raise notice 'OK 4  resume live: %', r;

  -- 5) request_handoff (parent) drop_off
  r := menumaker.safepass_request_handoff(v_phone, v_child, 'drop_off', v_dev);
  if not (r->>'ok')::bool then raise exception 'FAIL 5: request_handoff failed (r=%)', r; end if;
  raise notice 'OK 5  request_handoff: %  (confirm_handoff = живой teacher/kiosk шаг)', r;

  -- 6) DUP GUARD center-scoped: один номер у ДВУХ разных registered-лиц → 'ambiguous'
  update menumaker.safepass_trusted_persons set phone=v_phone, registered_at=now()
   where phone=v_phone2 and is_active;                         -- Deidra временно на номере Bryant
  r := menumaker.safepass_activate_device(v_phone, v_center, 'zz-dev-2');
  if (r->>'ok')::bool or r->>'error' <> 'ambiguous'
     then raise exception 'FAIL 6: expected ambiguous got %', r; end if;
  raise notice 'OK 6  dup-guard → ambiguous (падение в код-рельс): %', r;
  update menumaker.safepass_trusted_persons set phone=v_phone2
   where person_name='Deidra Booker' and phone=v_phone;        -- вернуть (косметика; всё равно rollback)

  -- 7) LEVER A — KICK (== эффект safepass_revoke_parent_trust; RPC staff-gated, UI-тест):
  --    parent_sessions.is_active=false + phone_verified=false + registered_at=null;
  --    tp.is_active НЕ трогаем, can_pickup НЕ трогаем.
  update menumaker.safepass_trusted_persons
     set phone_verified=false, phone_verified_at=null, registered_at=null, registered_by=null
   where phone=v_phone;
  update menumaker.safepass_parent_sessions set is_active=false where phone=v_phone;
  r := menumaker.safepass_resume_session(v_phone, v_dev);
  if (r->>'ok')::bool then raise exception 'FAIL 7a: resume survived kick (r=%)', r; end if;
  r := menumaker.safepass_activate_device(v_phone, v_center, v_dev);
  if (r->>'ok')::bool then raise exception 'FAIL 7b: activate survived kick — access should be dead (r=%)', r; end if;
  if not exists(select 1 from menumaker.safepass_trusted_persons where phone=v_phone and is_active)
     then raise exception 'FAIL 7c: kick wrongly cleared is_active (pickup must remain)'; end if;
  raise notice 'OK 7  LEVER A kick: доступ мёртв, pickup(is_active) остаётся: %', r;

  -- 8) LEVER B — снятие ✓Pickup в Family (child_guardian.can_pickup=false)
  --    КАНОН ожидает: доступ умирает. ФАКТ (текущая БД): Family развязан (нет триггера/синка,
  --    can_pickup 0/22) → рычаг no-op. Ре-регистрируем, гасим can_pickup, смотрим что РЕАЛЬНО.
  update menumaker.safepass_trusted_persons set registered_at=now() where phone=v_phone and is_active;
  update menumaker.child_guardian cg set can_pickup=false
   where cg.child_id = v_child::uuid
     and exists (select 1 from menumaker.guardian g where g.id=cg.guardian_id
                  and right(regexp_replace(coalesce(g.mobile_phone,''),'\D','','g'),10)=right(v_phone,10));
  r := menumaker.safepass_activate_device(v_phone, v_center, v_dev);
  if (r->>'ok')::bool then
    raise notice '⚠ FINDING L-B: ✓Pickup снят в Family, но SafePass-доступ ВЫЖИЛ (r=%). Family→SafePass НЕ проведён. Репорт, НЕ green.', r;
  else
    raise notice 'L-B: доступ умер на снятии ✓Pickup (r=%) — связь есть.', r;
  end if;

  -- ── самоочистка: форсируем ROLLBACK всего блока ──
  raise exception 'ZZTEST_ROLLBACK_OK — все assert выше прошли; откат, чистка=0';
end $zz$;
