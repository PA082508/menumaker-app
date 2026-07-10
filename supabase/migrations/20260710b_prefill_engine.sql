-- Prefill engine (prefill-engine-spec.md §A) — token + whitelist RPC.
--
-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ STATUS: PREPARED — **NOT APPLIED**. Apply ONLY on Nikolay's explicit go   │
-- │ (menumaker-live-db-write-protocol). At apply time, verify the `-- VERIFY` │
-- │ column/table names below against the live schema, then apply + read-back. │
-- └─────────────────────────────────────────────────────────────────────────┘
--
-- What it does: the library/campaign panel mints a per-child token when it builds
-- a batch; the parent's link carries `?t=<token>`; form-kit POSTs get_prefill(token)
-- and pre-fills [data-fk-field] + schedule + resolves center from center_id. Token
-- scope = one child, ~30-day expiry, NOT single-use (a parent may reopen the link),
-- reissued/replaced when the child lands in a later batch.
--
-- Privacy: the whitelist returns identity + address + parent contacts + schedule +
-- center_id ONLY. It NEVER returns sensitive numbers (SSN, DL#, work-auth#) or
-- FRP/eligibility — those columns are simply not selected.

-- ── Token table ────────────────────────────────────────────────────────────
create table if not exists menumaker.prefill_tokens (
  token       text primary key default encode(gen_random_bytes(24), 'hex'),  -- unguessable
  child_id    uuid not null references menumaker.roster(id) on delete cascade,
  center_id   uuid not null,
  org_id      uuid not null,
  batch_id    uuid,                              -- optional link to the campaign batch
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '30 days'
);

-- One live token per child: reissuing for a later batch replaces the old one.
create unique index if not exists prefill_tokens_child_uidx
  on menumaker.prefill_tokens (child_id);
create index if not exists prefill_tokens_expires_idx
  on menumaker.prefill_tokens (expires_at);

-- RLS: the table is reached only through SECURITY DEFINER functions (mint server-side,
-- read via get_prefill). No direct anon/authenticated table grants.
alter table menumaker.prefill_tokens enable row level security;

-- ── get_prefill(token) → whitelist jsonb ───────────────────────────────────
-- anon-callable (same pattern as submit_enrollment_form). Returns null when the
-- token is missing or expired. Not single-use.
create or replace function menumaker.get_prefill(p_token text)
  returns jsonb
  language plpgsql
  security definer
  set search_path to 'menumaker', 'public', 'core'
as $function$
declare
  v_tok  menumaker.prefill_tokens%rowtype;
  v_out  jsonb;
begin
  select * into v_tok
    from menumaker.prefill_tokens
   where token = p_token
     and expires_at > now();
  if not found then
    return null;                                  -- unknown / expired
  end if;

  -- Identity + center from roster (confirmed columns: first_name, last_name,
  -- child_name, birthday, center_id). -- VERIFY: roster.org_id exists.
  select jsonb_strip_nulls(jsonb_build_object(
           'child_id',   r.id,
           'center_id',  v_tok.center_id,
           'child_name', coalesce(nullif(trim(r.child_name), ''),
                                  nullif(trim(concat_ws(' ', r.first_name, r.last_name)), '')),
           'child_first_name', r.first_name,
           'child_last_name',  r.last_name,
           'child_dob',  r.birthday,
           -- Primary guardian contact (lowest emergency_contact_order). -- VERIFY:
           -- guardian columns first_name/last_name/email/mobile_phone/phone_1/address.
           'parent_name',  nullif(trim(concat_ws(' ', g.first_name, g.last_name)), ''),
           'parent_email', g.email,
           'parent_phone', coalesce(g.mobile_phone, g.phone_1),
           'address',      g.address
         ))
    into v_out
    from menumaker.roster r
    left join lateral (
      select gd.*
        from menumaker.child_guardian cg
        join menumaker.guardian gd on gd.id = cg.guardian_id   -- VERIFY: guardian table + PK
       where cg.child_id = r.id
       order by cg.emergency_contact_order asc nulls last
       limit 1
    ) g on true
   where r.id = v_tok.child_id;

  -- VERIFY + EXTEND at apply time: schedule / meals whitelist. The child→classroom
  -- →meal_schedule chain (roster.classroom_id? meal_count_settings.active_slots?)
  -- is not confirmed here — add the `schedule`/`meals` keys once the join is
  -- verified. Sensitive numbers (SSN/DL/work-auth, FRP/eligibility) stay EXCLUDED.

  return v_out;
end $function$;

grant execute on function menumaker.get_prefill(text) to anon, authenticated;

-- ── Mint helper (server-side; called by the campaign batch builder) ─────────
-- SECURITY DEFINER so the app can mint without direct table grants. Reissues
-- (replaces) the child's existing token via the unique index.
create or replace function menumaker.mint_prefill_token(
  p_child uuid, p_center uuid, p_org uuid, p_batch uuid default null
) returns text
  language plpgsql
  security definer
  set search_path to 'menumaker', 'public', 'core'
as $function$
declare v_token text;
begin
  insert into menumaker.prefill_tokens (child_id, center_id, org_id, batch_id)
  values (p_child, p_center, p_org, p_batch)
  on conflict (child_id) do update
    set token = encode(gen_random_bytes(24), 'hex'),
        center_id = excluded.center_id,
        org_id = excluded.org_id,
        batch_id = excluded.batch_id,
        created_at = now(),
        expires_at = now() + interval '30 days'
  returning token into v_token;
  return v_token;
end $function$;

-- mint is NOT anon-callable — only the app (authenticated staff) mints tokens.
grant execute on function menumaker.mint_prefill_token(uuid, uuid, uuid, uuid) to authenticated;
