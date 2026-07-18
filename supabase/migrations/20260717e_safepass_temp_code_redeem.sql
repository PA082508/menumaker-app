-- SafePass — redeem a temporary pickup code (ONE token-gated SECURITY DEFINER RPC).
--
-- Context: menumaker.safepass_temp_codes holds a one-time code a director issues so
-- a named person (person_name) may pick up a specific child (child_id/child_name),
-- valid until expires_at. The kiosk has NO login — it reaches data only through
-- token-gated SECURITY DEFINER RPCs, exactly like safepass_device_context /
-- safepass_confirm_handoff (20260706_safepass_device_kiosk.sql).
--
-- THE CONSTRAINT (item 3, Nikolay): "один SECURITY DEFINER RPC redeem, anon-политику
-- не открывать." So: one RPC, granted to anon (device token is the bearer credential),
-- and NO anon RLS policy is added to safepass_temp_codes — the table stays unreadable
-- by anon (its current anon SELECT *grant* is dead weight under org-only RLS; this
-- migration REVOKEs it as defense-in-depth, mirroring the 20260716 anon-close).
--
-- Why a PIN is required here: safepass_sessions.teacher_id / teacher_name are NOT NULL
-- with no default (measured), so a session cannot be created unattributed. The staff
-- operating the kiosk enters their 4-digit PIN, resolved center-scoped exactly like
-- confirm_handoff (duty/float: any active staff in the device's CENTER may act).
--
-- Center-scoped, not classroom-scoped: the code carries center_id (not classroom).
-- The child's classroom is resolved from the active roster and the session lands in
-- THAT classroom. A code is honoured by any registered device in its own center.
--
-- One-time: the code row is locked FOR UPDATE and the guard `used_at is null` makes a
-- race / double-scan a no-op — the second caller sees the row already consumed.
--
-- ⚠️ NOT APPLIED — prepare only. Nikolay applies by hand, then read-back.
--
-- Semantics RESOLVED (Nikolay, 2026-07-18) — the code below matches all three:
--   (D1) status = 'waiting'. Redeem records the PERSON's arrival; the teacher
--        confirms the actual handoff with their PIN via safepass_confirm_handoff.
--        (A one-step 'confirmed' was rejected: it removes the human confirmation.)
--   (D2) teacher_id/teacher_name = the PIN'd kiosk operator at redeem — ACCEPTED as
--        temporary, on the verified precondition that confirm_handoff OVERWRITES
--        teacher_id with the real person by PIN (20260706:195,
--        `teacher_id = v_staff.id::text`). Confirmed → the handoff log ends up
--        "person, not door", so the placeholder is safe.
--   (D3) redeem CREATES the session and links used_session — the code→session trail
--        plus the FK is what closes one-time use. (Validate-only was rejected: it
--        leaves a window between the check and the create.)

create or replace function menumaker.safepass_redeem_temp_code(
  p_token    text,
  p_code     text,
  p_pin_hash text
) returns jsonb
language plpgsql security definer
set search_path = menumaker, public, extensions as $$
declare
  v_dev     record;
  v_staff   record;
  v_code    record;
  v_room    record;
  v_session uuid;
begin
  -- 1) Device (bearer credential). Same resolution as the other kiosk RPCs.
  select * into v_dev from menumaker.safepass_devices
   where token_hash = encode(digest(p_token, 'sha256'), 'hex')
     and is_active and revoked_at is null;
  if not found then raise exception 'device not registered'; end if;

  -- 2) PIN → staff, center-scoped (duty/float). Attribution is mandatory (NOT NULL).
  select id, first_name, last_name into v_staff
    from menumaker.staff
   where center_id = v_dev.center_id and is_active and pin_hash = p_pin_hash;
  if not found then raise exception 'invalid PIN'; end if;

  -- 3) Lock the code. Center-scoped, active, unused, unexpired. The FOR UPDATE +
  --    `used_at is null` guard makes a concurrent second scan a no-op.
  select * into v_code from menumaker.safepass_temp_codes
   where code = p_code
     and center_id = v_dev.center_id
     and is_active
     and used_at is null
     and now() < expires_at
   for update;
  if not found then
    raise exception 'code is invalid, expired, or already used';
  end if;

  -- 4) The code's child must be on the active roster of this center; take its room.
  select r.classroom_id, r.child_name into v_room
    from menumaker.roster r
   where r.id::text = v_code.child_id and r.center_id = v_dev.center_id and r.is_active;
  if not found then
    raise exception 'child is not on the active roster';
  end if;

  -- 5) Create the pickup session (D3), attributed to the PIN'd operator (D2 —
  --    confirm_handoff later overwrites teacher_id with the confirming staff).
  insert into menumaker.safepass_sessions (
    org_id, center_id, classroom_id, child_id, child_name,
    auth_method, action_type, status,
    trusted_person_name, temp_code_id,
    teacher_id, teacher_name,               -- kiosk operator (overwritten at confirm)
    person_initiated_at
  ) values (
    v_dev.org_id, v_dev.center_id, v_room.classroom_id, v_code.child_id, v_code.child_name,
    'temp_code', 'pick_up', 'waiting',       -- D1: person-arrival; teacher confirms via PIN
    v_code.person_name, v_code.id,
    v_staff.id::text, v_staff.first_name || ' ' || v_staff.last_name,
    now()
  ) returning id into v_session;

  -- 6) Burn the code, linking the session it produced.
  update menumaker.safepass_temp_codes
     set used_at = now(), used_session = v_session, is_active = false
   where id = v_code.id;

  return jsonb_build_object(
    'ok',           true,
    'session_id',   v_session,
    'child_id',     v_code.child_id,
    'child_name',   v_code.child_name,
    'person_name',  v_code.person_name,
    'staff_id',     v_staff.id,
    'staff_name',   v_staff.first_name || ' ' || v_staff.last_name
  );
end $$;

-- ── grants ────────────────────────────────────────────────────────────────────
-- Kiosk (anon, token-gated) — redeem only. Postgres grants EXECUTE to PUBLIC by
-- default; PUBLIC covers anon, which is what we want for the kiosk. authenticated
-- is granted explicitly for the in-app path.
grant execute on function menumaker.safepass_redeem_temp_code(text, text, text)
  to anon, authenticated;

-- Defense-in-depth: the table keeps org-only RLS and gets NO anon policy. Its stray
-- anon SELECT *grant* (dead under org-only RLS) is revoked so anon can never read
-- codes even if a permissive policy is ever added by mistake (the OTP-leak class,
-- 20260716_safepass_close_anon_tables.sql).
revoke select on menumaker.safepass_temp_codes from anon;
