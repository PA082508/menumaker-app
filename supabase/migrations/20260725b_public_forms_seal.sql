-- 20260725b_public_forms_seal.sql — SAME SEAL as submit_enrollment_form, applied to the
-- 3 dedicated public parent forms (special_diet · fluid_milk · infant_meals).
--
-- Forward-only. Mirrors 20260723_signature_trail + 20260725_signature_server_sealed_at,
-- adapted to the 3 dedicated tables written by submit_public_form.
--
-- ЗАЧЕМ. The ODEW letter (AS SENT) claims signed records are "cryptographically sealed …
-- cannot be edited or deleted — any correction creates a new linked record with a stated
-- reason", with a "server-authoritative timestamp". Today that is true for
-- enrollment_submissions but NOT for these 3 forms. Close the gap.
--
-- CONTEXT (verified 2026-07-25): all 3 tables are EMPTY, have NO triggers, and have NO
-- review/status/countersign workflow columns (unlike enrollment). So the seal is STRICT:
-- once content_hash is set, the row is FULLY immutable and cannot be deleted. A correction
-- is a NEW row (supersedes_id + correction_reason set at insert on the new row; the old row
-- is never touched). No mutable workflow column needs to stay open.
--
-- SCOPE. This adds the integrity SEAL + server-set context (hash / sealed_at / ip / ua) that
-- back the letter's "sealed against alteration" + "server-authoritative timestamp" claims.
-- form_version + esign_consent parity for these 3 forms follows with their form-kit wiring
-- (same follow-up class as enrollment consent, due 2026-09-15) — noted, not in this migration.

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Seal columns on all 3 tables. All nullable → empty tables, zero risk.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['special_diet_forms','milk_substitutions','infant_meal_preferences'] loop
    execute format('alter table menumaker.%I
      add column if not exists content_hash      text,
      add column if not exists sealed_at         timestamptz,
      add column if not exists submit_ip         text,
      add column if not exists submit_user_agent text,
      add column if not exists supersedes_id     uuid,
      add column if not exists correction_reason text', t);

    -- self-referencing soft FK for the forward-only correction link (no cascade)
    if not exists (select 1 from pg_constraint where conname = t || '_supersedes_fk') then
      execute format('alter table menumaker.%I add constraint %I foreign key (supersedes_id)
        references menumaker.%I(id) on delete set null', t, t || '_supersedes_fk', t);
    end if;
    -- correction_reason required when the row supersedes another
    if not exists (select 1 from pg_constraint where conname = t || '_correction_reason_ck') then
      execute format('alter table menumaker.%I add constraint %I
        check (supersedes_id is null or nullif(btrim(correction_reason),'''') is not null)',
        t, t || '_correction_reason_ck');
    end if;
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Shared seal guard: a sealed row (content_hash set) is fully immutable and cannot be
--    deleted. Fires for ALL roles incl service_role (only postgres-superuser can bypass).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function menumaker.public_form_seal_guard()
returns trigger language plpgsql as $fn$
begin
  if tg_op = 'DELETE' then
    if old.content_hash is not null then
      raise exception 'public form % запечатана — удаление запрещено; правка = новая связанная строка (supersedes_id + correction_reason)', old.id
        using errcode = 'check_violation';
    end if;
    return old;
  end if;
  -- UPDATE: a sealed row is fully immutable (these forms have no post-submit workflow).
  if old.content_hash is not null then
    raise exception 'public form % запечатана — запись неизменяема; правка = новая связанная строка (supersedes_id + correction_reason)', old.id
      using errcode = 'check_violation';
  end if;
  return new;
end $fn$;

do $$
declare t text;
begin
  foreach t in array array['special_diet_forms','milk_substitutions','infant_meal_preferences'] loop
    execute format('drop trigger if exists trg_%s_seal_upd on menumaker.%I', t, t);
    execute format('create trigger trg_%s_seal_upd before update on menumaker.%I
      for each row execute function menumaker.public_form_seal_guard()', t, t);
    execute format('drop trigger if exists trg_%s_seal_del on menumaker.%I', t, t);
    execute format('create trigger trg_%s_seal_del before delete on menumaker.%I
      for each row execute function menumaker.public_form_seal_guard()', t, t);
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. submit_public_form seals every new submission. Signature UNCHANGED (4-arg) →
--    CREATE OR REPLACE, no grant change, no PostgREST ambiguity. Adds: content_hash =
--    SHA-256(p_data), server sealed_at = now(), server-set submit_ip / submit_user_agent.
--    search_path gains 'extensions' for digest().
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function menumaker.submit_public_form(
  p_form            text,
  p_center_slug     text,
  p_data            jsonb,
  p_idempotency_key uuid default null
) returns uuid
  language plpgsql
  security definer
  set search_path to 'menumaker', 'public', 'core', 'extensions'
as $function$
declare
  v_org uuid;
  v_id  uuid;
  v_hash text;
  v_headers json;
  v_ip text;
  v_ua text;
begin
  select org_id into v_org
    from menumaker.centers
   where slug = p_center_slug and is_active
   limit 1;
  if v_org is null then
    raise exception 'unknown or inactive center slug %', p_center_slug;
  end if;

  -- server-authoritative seal context (the form cannot supply these)
  v_hash := encode(extensions.digest(convert_to(coalesce(p_data,'{}'::jsonb)::text, 'UTF8'), 'sha256'), 'hex');
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::json;
  exception when others then v_headers := null; end;
  if v_headers is not null then
    v_ip := nullif(btrim(split_part(coalesce(v_headers->>'x-forwarded-for', v_headers->>'x-real-ip', ''), ',', 1)), '');
    v_ua := nullif(v_headers->>'user-agent', '');
  end if;

  if p_form = 'special_diet' then
    insert into menumaker.special_diet_forms
      (child_name, birth_date, parent_name, email, home_phone, work_phone, cell_phone,
       address, city, state, zip, diet_basis, disability_desc, major_life_activity,
       diet_restriction, special_need_desc, foods_omitted, foods_substituted,
       authority_signature_img, signed_date, authority_printed_name, authority_phone,
       org_id, idempotency_key, content_hash, sealed_at, submit_ip, submit_user_agent)
    values
      (p_data->>'child_name', (nullif(p_data->>'birth_date',''))::date, p_data->>'parent_name',
       p_data->>'email', p_data->>'home_phone', p_data->>'work_phone', p_data->>'cell_phone',
       p_data->>'address', p_data->>'city', p_data->>'state', p_data->>'zip', p_data->>'diet_basis',
       p_data->>'disability_desc', p_data->>'major_life_activity', p_data->>'diet_restriction',
       p_data->>'special_need_desc', p_data->>'foods_omitted', p_data->>'foods_substituted',
       p_data->>'authority_signature_img', (nullif(p_data->>'signed_date',''))::date,
       p_data->>'authority_printed_name', p_data->>'authority_phone', v_org, p_idempotency_key,
       v_hash, now(), v_ip, v_ua)
    on conflict (idempotency_key) where idempotency_key is not null do nothing
    returning id into v_id;
    if v_id is null and p_idempotency_key is not null then
      select id into v_id from menumaker.special_diet_forms where idempotency_key = p_idempotency_key;
    end if;

  elsif p_form = 'fluid_milk' then
    insert into menumaker.milk_substitutions
      (center_name, center_provides, center_substitutes, center_declines, child_name,
       dietary_need, parent_choice, parent_signature_img, signed_date, org_id, idempotency_key,
       content_hash, sealed_at, submit_ip, submit_user_agent)
    values
      (p_data->>'center_name', (nullif(p_data->>'center_provides',''))::boolean,
       p_data->>'center_substitutes', (nullif(p_data->>'center_declines',''))::boolean,
       p_data->>'child_name', p_data->>'dietary_need', p_data->>'parent_choice',
       p_data->>'parent_signature_img', (nullif(p_data->>'signed_date',''))::date,
       v_org, p_idempotency_key, v_hash, now(), v_ip, v_ua)
    on conflict (idempotency_key) where idempotency_key is not null do nothing
    returning id into v_id;
    if v_id is null and p_idempotency_key is not null then
      select id into v_id from menumaker.milk_substitutions where idempotency_key = p_idempotency_key;
    end if;

  elsif p_form = 'infant_meals' then
    insert into menumaker.infant_meal_preferences
      (center_name, formula_name, formula_choice, parent_formula_name, solid_food_choice,
       infant_name, infant_birthdate, parent_signature_img, signed_date, org_id, idempotency_key,
       content_hash, sealed_at, submit_ip, submit_user_agent)
    values
      (p_data->>'center_name', p_data->>'formula_name', p_data->>'formula_choice',
       p_data->>'parent_formula_name', p_data->>'solid_food_choice', p_data->>'infant_name',
       (nullif(p_data->>'infant_birthdate',''))::date, p_data->>'parent_signature_img',
       (nullif(p_data->>'signed_date',''))::date, v_org, p_idempotency_key,
       v_hash, now(), v_ip, v_ua)
    on conflict (idempotency_key) where idempotency_key is not null do nothing
    returning id into v_id;
    if v_id is null and p_idempotency_key is not null then
      select id into v_id from menumaker.infant_meal_preferences where idempotency_key = p_idempotency_key;
    end if;

  else
    raise exception 'unknown form %', p_form;
  end if;

  return v_id;
end
$function$;

revoke all on function menumaker.submit_public_form(text, text, jsonb, uuid) from public;
grant execute on function menumaker.submit_public_form(text, text, jsonb, uuid) to anon, authenticated;

commit;

-- ═════════════════════════════════════════════════════════════════════════════
-- READ-BACK (после apply)
-- R1. seal-колонки на всех 3 таблицах (по 6 новых):
--   select table_name, count(*) from information_schema.columns
--    where table_schema='menumaker'
--      and table_name in ('special_diet_forms','milk_substitutions','infant_meal_preferences')
--      and column_name in ('content_hash','sealed_at','submit_ip','submit_user_agent','supersedes_id','correction_reason')
--    group by table_name;  -- 3 строки × 6
-- R2. по 2 seal-триггера на таблицу (upd,del) = 6 всего.
-- R3. RPC 4-арг, DEFINER, anon+auth execute.
-- R4. функц. (self-abort DO): submit каждой формы → content_hash≠null(len 64)+sealed_at≠null;
--     UPDATE запечатанной → EXCEPTION; DELETE запечатанной → EXCEPTION; откат, 0 residue.
-- ═════════════════════════════════════════════════════════════════════════════
