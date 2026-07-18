-- SafePass Teacher View — DEVICE-scoped kiosk mode (not account-scoped).
--
-- Today the Teacher View is gated by the logged-in teacher account + a manual
-- class dropdown, and Accept/Release stamps teacher_id from that login
-- (SafePassTeacherPage). This migration adds the device-first model:
--
--   1. safepass_devices — a registered iPad is bound to ONE (center, classroom).
--      The kiosk boots from a device token (no login) and sees ONLY that
--      classroom's children.
--   2. staff.pin_hash — every Accept/Release is attributed to a staff member by
--      a 4-digit PIN (hashed). PIN is UNIQUE PER CENTER (decision), so the PIN
--      alone resolves to a staff row.
--   3. Access is via token-gated SECURITY DEFINER RPCs ONLY, exactly like
--      submit_enrollment_form / safepass_sign — anon gets NO table grant and NO
--      broad SELECT. The device token is the bearer credential.
--
-- Hashing (reproducible in the browser via WebCrypto so the kiosk can verify a
-- PIN OFFLINE against a cached hash set, then the server re-verifies on sync):
--   token_hash = sha256(raw_token)                       -- raw token 32 rand bytes, shown once
--   pin_hash   = sha256(center_id || ':' || pin)         -- salt = center_id (unique, non-secret)
-- Single-pass salted SHA-256 is a deliberate trade-off: a 4-digit PIN has only
-- 10k combinations, so heavier KDFs buy little; the hash set lives only on the
-- server and on trusted, director-registered devices. Uniqueness-per-center is
-- enforced by a unique index on (center_id, pin_hash).
--
-- Float / duty (decision 6): confirm_handoff resolves the PIN against ANY active
-- staff in the device's CENTER (not just the device's classroom) — morning Early
-- Care is run by duty staff on another room's iPad. The DEVICE scopes which
-- children render; the PIN scopes who is credited.
--
-- pgcrypto lives in schema `extensions` on this project — digest/gen_random_bytes
-- are schema-qualified and `extensions` is on each function's search_path.
--
-- NOT applied yet — pending review.

-- ── 1. Device registry ────────────────────────────────────────────────────────
create table if not exists menumaker.safepass_devices (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references core.organizations(id),
  center_id     uuid not null references menumaker.centers(id),
  classroom_id  uuid not null references menumaker.classrooms(id),
  token_hash    text not null unique,                 -- sha256(raw token); raw token never stored
  device_label  text,                                 -- e.g. "Green Room iPad"
  registered_by uuid references auth.users(id),
  registered_at timestamptz not null default now(),
  revoked_at    timestamptz,
  is_active     boolean not null default true
);

create index if not exists safepass_devices_center_idx
  on menumaker.safepass_devices (center_id) where is_active;

alter table menumaker.safepass_devices enable row level security;

-- RLS mirrors enrollment_submissions: permissive base for authenticated, then
-- restrictive org + staff-role gates AND-ed on top. anon is excluded (RPC only) —
-- the kiosk reaches its data exclusively through the token-gated RPCs below.
create policy auth_manage on menumaker.safepass_devices
  as permissive for all to authenticated using (true) with check (true);

create policy org_isolation on menumaker.safepass_devices
  as restrictive for all to authenticated
  using (core.is_org_member(org_id)) with check (core.is_org_member(org_id));

-- Only director/office_manager/admin register or revoke devices. Reassign
-- (device moved rooms) and revoke (lost/stolen) are plain UPDATEs under this
-- policy; a device with is_active=false or revoked_at set stops resolving.
create policy staff_only on menumaker.safepass_devices
  as restrictive for all to authenticated
  using (menumaker.get_user_role() = any (array['director','office_manager','admin']))
  with check (menumaker.get_user_role() = any (array['director','office_manager','admin']));

-- ── 2. Staff PIN (hashed, unique per center) ──────────────────────────────────
alter table menumaker.staff add column if not exists pin_hash text;

create unique index if not exists staff_center_pin_uidx
  on menumaker.staff (center_id, pin_hash) where pin_hash is not null;

-- ── helpers (internal; not granted to anon) ───────────────────────────────────
create or replace function menumaker._safepass_pin_hash(p_center uuid, p_pin text)
returns text language sql immutable
set search_path = menumaker, public, extensions as $$
  select encode(digest(p_center::text || ':' || p_pin, 'sha256'), 'hex')
$$;

-- ── 3. RPCs ───────────────────────────────────────────────────────────────────

-- 3a. Register this device (director only). Generates the raw token, stores its
--     hash, returns the raw token ONCE for the iPad to persist in IndexedDB.
create or replace function menumaker.safepass_register_device(
  p_org        uuid,
  p_center     uuid,
  p_classroom  uuid,
  p_label      text default null
) returns text
language plpgsql security definer
set search_path = menumaker, public, core, extensions as $$
declare v_token text; begin
  if not core.is_org_member(p_org)
     or menumaker.get_user_role() not in ('director','office_manager','admin') then
    raise exception 'not authorized to register devices';
  end if;
  if not exists (select 1 from menumaker.classrooms c
                 where c.id = p_classroom and c.center_id = p_center) then
    raise exception 'classroom % is not in center %', p_classroom, p_center;
  end if;
  if not exists (select 1 from menumaker.centers c
                 where c.id = p_center and c.org_id = p_org) then
    raise exception 'center % does not belong to org %', p_center, p_org;
  end if;

  v_token := encode(gen_random_bytes(32), 'hex');
  insert into menumaker.safepass_devices
    (org_id, center_id, classroom_id, token_hash, device_label, registered_by)
  values
    (p_org, p_center, p_classroom, encode(digest(v_token, 'sha256'), 'hex'),
     p_label, auth.uid());
  return v_token;
end $$;

-- 3b. Boot the kiosk from its token. Returns center/classroom context + ONLY that
--     classroom's active roster. This is the sole way the kiosk reads children.
--     center_id doubles as the client-side PIN salt for offline verification.
create or replace function menumaker.safepass_device_context(p_token text)
returns jsonb
language plpgsql security definer
set search_path = menumaker, public, extensions as $$
declare v_dev record; v_children jsonb; begin
  select d.*, c.name as classroom_name
    into v_dev
    from menumaker.safepass_devices d
    join menumaker.classrooms c on c.id = d.classroom_id
   where d.token_hash = encode(digest(p_token, 'sha256'), 'hex')
     and d.is_active and d.revoked_at is null;
  if not found then
    raise exception 'device not registered';       -- kiosk shows "Register this device"
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('roster_id', r.id, 'child_name', r.child_name)
                            order by r.child_name), '[]'::jsonb)
    into v_children
    from menumaker.roster r
   where r.classroom_id = v_dev.classroom_id and r.is_active;

  return jsonb_build_object(
    'device_id',      v_dev.id,
    'org_id',         v_dev.org_id,
    'center_id',      v_dev.center_id,        -- also the PIN salt (see _safepass_pin_hash)
    'classroom_id',   v_dev.classroom_id,
    'classroom_name', v_dev.classroom_name,
    'children',       v_children
  );
end $$;

-- 3c. Confirm a handoff (Accept a drop_off / Release a pick_up). Verifies the
--     device token, that the session is in the device's OWN classroom, and
--     resolves the PIN to an active staff member ANYWHERE in the device's center
--     (float/duty). p_pin_hash is computed on-device; p_occurred_at + the return
--     of offline_synced let the replay path re-verify queued offline events.
create or replace function menumaker.safepass_confirm_handoff(
  p_token       text,
  p_session_id  uuid,
  p_pin_hash    text,
  p_occurred_at timestamptz default now()
) returns jsonb
language plpgsql security definer
set search_path = menumaker, public, extensions as $$
declare v_dev record; v_staff record; v_sess record; v_offline boolean; begin
  select * into v_dev from menumaker.safepass_devices
   where token_hash = encode(digest(p_token, 'sha256'), 'hex')
     and is_active and revoked_at is null;
  if not found then raise exception 'device not registered'; end if;

  -- PIN → staff, center-scoped (any active staff in the center may act — duty/float).
  select id, first_name, last_name into v_staff
    from menumaker.staff
   where center_id = v_dev.center_id and is_active and pin_hash = p_pin_hash;
  if not found then raise exception 'invalid PIN'; end if;

  -- The device may only act on sessions for its own classroom.
  select * into v_sess from menumaker.safepass_sessions
   where id = p_session_id and classroom_id = v_dev.classroom_id;
  if not found then raise exception 'session not in this room'; end if;
  if v_sess.status = 'confirmed' then
    -- Idempotent: an offline replay of an already-confirmed session is a no-op.
    return jsonb_build_object('ok', true, 'already', true,
                              'staff_id', v_staff.id,
                              'staff_name', v_staff.first_name || ' ' || v_staff.last_name);
  end if;

  v_offline := p_occurred_at < now() - interval '5 seconds';  -- replayed from the queue
  update menumaker.safepass_sessions
     set status               = 'confirmed',
         teacher_confirmed_at  = p_occurred_at,
         teacher_id            = v_staff.id::text,
         teacher_name          = v_staff.first_name || ' ' || v_staff.last_name,
         offline_created       = coalesce(offline_created, v_offline),
         offline_synced_at     = case when v_offline then now() else offline_synced_at end
   where id = p_session_id;

  return jsonb_build_object('ok', true,
                            'staff_id', v_staff.id,
                            'staff_name', v_staff.first_name || ' ' || v_staff.last_name);
end $$;

-- 3d. Set / change a staff PIN (director only). Hashes with the center salt and
--     enforces unique-per-center; a collision surfaces as a friendly error.
create or replace function menumaker.safepass_set_staff_pin(
  p_staff_id uuid,
  p_pin      text
) returns void
language plpgsql security definer
set search_path = menumaker, public, extensions as $$
declare v_center uuid; v_hash text; begin
  select center_id into v_center from menumaker.staff where id = p_staff_id;
  if v_center is null then raise exception 'staff not found'; end if;
  if not core.is_org_member((select org_id from menumaker.staff where id = p_staff_id))
     or menumaker.get_user_role() not in ('director','office_manager','admin') then
    raise exception 'not authorized to set PINs';
  end if;
  if p_pin !~ '^[0-9]{4}$' then raise exception 'PIN must be 4 digits'; end if;

  v_hash := menumaker._safepass_pin_hash(v_center, p_pin);
  if exists (select 1 from menumaker.staff
             where center_id = v_center and pin_hash = v_hash and id <> p_staff_id) then
    raise exception 'PIN already in use at this center — choose another';
  end if;
  update menumaker.staff set pin_hash = v_hash, updated_at = now() where id = p_staff_id;
end $$;

-- ── grants ────────────────────────────────────────────────────────────────────
-- Director UI manages devices via direct table access under the RLS org +
-- staff_only gates (mirrors enrollment_submissions / roster). anon gets NO table
-- grant — the kiosk reaches its data only through the token-gated RPCs.
grant select, insert, update, delete on menumaker.safepass_devices to authenticated;

-- Kiosk (anon, token-gated) — context + handoff only.
grant execute on function menumaker.safepass_device_context(text)        to anon, authenticated;
grant execute on function menumaker.safepass_confirm_handoff(text, uuid, text, timestamptz)
                                                                          to anon, authenticated;

-- Director-only + internal. Postgres grants EXECUTE to PUBLIC by default, so we
-- must REVOKE it or anon could still call these (the in-function role check would
-- reject anon, but revoke is defense-in-depth). _safepass_pin_hash stays internal.
revoke execute on function menumaker.safepass_register_device(uuid, uuid, uuid, text) from public;
revoke execute on function menumaker.safepass_set_staff_pin(uuid, text)               from public;
revoke execute on function menumaker._safepass_pin_hash(uuid, text)                   from public;
grant  execute on function menumaker.safepass_register_device(uuid, uuid, uuid, text) to authenticated;
grant  execute on function menumaker.safepass_set_staff_pin(uuid, text)               to authenticated;
grant  execute on function menumaker._safepass_pin_hash(uuid, text)                   to authenticated;
