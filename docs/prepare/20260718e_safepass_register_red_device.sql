-- ============================================================================
-- 20260718e — SafePass: register the Ridge/Red pilot device
-- PREPARED 2026-07-18 · NOT APPLIED · needs Nikolay's hands + an explicit go
--
-- Decision #3: there is no kiosk registration surface. Confirmed by code, not
-- assumed: `grep -rl "safepass_register_device\|token_hash\|deviceToken" src/`
-- returns NOTHING, and src/pages/safepass/ holds only Help / Parent / Teacher.
-- So the row is inserted here, by hand, once.
--
-- Why not call menumaker.safepass_register_device(): it gates on
-- core.is_org_member(p_org) AND get_user_role() in (director,office_manager,
-- admin) AND writes registered_by = auth.uid(). From an SQL console auth.uid()
-- is null and is_org_member is false, so the RPC raises 'not authorized'. The
-- INSERT below reproduces exactly what that function does, minus auth.uid().
--
-- ⚠️ READ THIS BEFORE RUNNING — this row does NOT make Monday work.
-- Nothing in the app reads it yet. See §3 at the bottom.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- §0 Pre-flight — every id resolves by name, uniquely. Verified 2026-07-18:
--     ridge_centers=1 · red_rooms=1 · red_bound=1
--     Abort loudly rather than insert against a guessed id.
-- ---------------------------------------------------------------------------

do $$
declare v_org uuid; v_center uuid; v_room uuid; v_n int;
begin
  select count(*) into v_n from menumaker.centers where name ilike '%ridge%';
  if v_n <> 1 then raise exception 'expected exactly 1 Ridge center, found %', v_n; end if;

  select c.id, c.org_id into v_center, v_org
    from menumaker.centers c where c.name ilike '%ridge%';

  select count(*) into v_n from menumaker.classrooms
   where center_id = v_center and name = 'Red';
  if v_n <> 1 then raise exception 'expected exactly 1 Red room in Ridge, found %', v_n; end if;

  select id into v_room from menumaker.classrooms
   where center_id = v_center and name = 'Red';

  -- Idempotence: one active device per room for the pilot.
  if exists (select 1 from menumaker.safepass_devices
              where classroom_id = v_room and is_active and revoked_at is null) then
    raise exception 'Red already has an active device — revoke it first, do not stack';
  end if;

  raise notice 'pre-flight ok: org=% center=% room=%', v_org, v_center, v_room;
end $$;

-- ---------------------------------------------------------------------------
-- §1 The row. Token is generated here and printed ONCE.
--
--     Only sha256(token) is stored. The plaintext exists in this output and
--     nowhere else — copy it to the tablet in the same sitting, then close the
--     console. If it is lost, revoke the row and re-run; do not try to recover.
-- ---------------------------------------------------------------------------

with ids as (
  select ct.org_id, ct.id as center_id, cl.id as classroom_id
    from menumaker.centers ct
    join menumaker.classrooms cl on cl.center_id = ct.id and cl.name = 'Red'
   where ct.name ilike '%ridge%'
),
tok as (select encode(gen_random_bytes(32), 'hex') as token)
insert into menumaker.safepass_devices
  (org_id, center_id, classroom_id, token_hash, device_label, registered_by)
select ids.org_id, ids.center_id, ids.classroom_id,
       encode(digest(tok.token, 'sha256'), 'hex'),
       'Ridge / Red — pilot tablet 20.07',
       null                      -- no auth.uid() in a console session
  from ids, tok
returning
  id            as device_id,
  device_label,
  (select token from tok) as PLAINTEXT_TOKEN_COPY_NOW;

-- ---------------------------------------------------------------------------
-- §2 Read-back — booleans only, no secrets. Substitute the token you just
--     copied for :tok (psql) or paste it inline once, then clear history.
-- ---------------------------------------------------------------------------

-- 2a. the row exists and is findable BY TOKEN HASH (the path the RPC takes)
select
  count(*) = 1                                        as device_found_by_token,
  bool_and(is_active and revoked_at is null)          as device_live
from menumaker.safepass_devices
where token_hash = encode(digest(:'tok', 'sha256'), 'hex');

-- 2b. device_context resolves — proves room binding + roster visibility
select (menumaker.safepass_device_context(:'tok') ->> 'classroom_name') = 'Red'
         as context_room_is_red,
       jsonb_array_length(menumaker.safepass_device_context(:'tok') -> 'children') > 0
         as roster_visible;

-- 2c. confirm_handoff now reaches the STAFF clause instead of dying at the
--     device gate. Expected: NOT 'device not registered'; with a deliberately
--     wrong PIN it must fail 'invalid PIN' — that is the proof it got past §1
--     of the function. This call cannot write: it raises before the UPDATE.
do $$
begin
  perform menumaker.safepass_confirm_handoff(:'tok', gen_random_uuid(), 'deliberately-wrong');
  raise exception 'UNEXPECTED: call succeeded';
exception
  when others then
    if sqlerrm = 'device not registered' then
      raise exception 'FAIL — still stuck at the device gate';
    elsif sqlerrm = 'invalid PIN' then
      raise notice 'PASS — reached the staff clause (device gate cleared)';
    else
      raise notice 'reached past device gate; stopped at: %', sqlerrm;
    end if;
end $$;

-- ---------------------------------------------------------------------------
-- §3 WHAT THIS STILL DOES NOT DO — read before calling Monday open.
--
-- ⚠️ CORRECTION (same day). An earlier draft of this section claimed the three
-- device RPCs had ZERO callers in src/. That was WRONG — the grep behind it ran
-- in the wrong working directory and measured nothing. Re-measured from the
-- repo root, the client half already exists and is complete:
--   src/lib/safepassDevice.ts       — token store, pinHash (parity-tested),
--                                     device_context / confirm_handoff /
--                                     register_device wrappers
--   src/pages/safepass/shared/PinPad.tsx — 4-digit pad + offline throttle
--   src/lib/safepassDevice.test.ts  — pinHash vector against the DB function
-- Recorded here rather than quietly deleted: this is Case 4 of the same class,
-- and the assertion was mine.
--
-- What was actually missing was the WIRING: SafePassTeacherPage confirmed a
-- handoff with a direct .from('safepass_sessions').update(...), bypassing both
-- the device and the PIN. Fixed on feat/teacher-confirm-handoff (61edb80).
--
-- Token delivery, as built: `?device_token=<token>` on first open →
-- localStorage['sp_kiosk_token'], URL stripped in the same tick.
--
-- So: inserting this row is necessary and not sufficient — it needs the
-- teacher-page deploy alongside it. Until both land, the pilot runs a path that
-- attributes handoffs to the shared service account.
--
-- Also open: 4 staff rows sit in Red, but only 2 are live. The other two
-- (a8709c0d Carolyn, 6bba6661 Maureen) are the extinguished 21.06 duplicate
-- generation, is_active=false — confirm_handoff filters on is_active, so it
-- can never match them and they need no PIN.
-- ============================================================================
