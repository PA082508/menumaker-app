-- ============================================================================
-- submit_public_form — SECURITY DEFINER door through RLS for the 3 dedicated-table
-- parent forms (special diet · fluid milk · infant meals), modeled on
-- submit_enrollment_form. Root cause it fixes: those tables have RLS policies for
-- {authenticated} only (no anon policy), so the forms' DIRECT anon insert is denied
-- (42501) — parents cannot submit. This controlled definer validates the center by
-- slug, resolves org, sets org_id, dedups by idempotency_key, and returns the id.
--
-- PREPARE BLOCK — apply via the live-DB protocol (diagnostic-lock → apply →
-- read-backs at the bottom). Idempotent (IF NOT EXISTS / CREATE OR REPLACE).
-- ============================================================================

-- 1. Schema: idempotency_key on all three; org_id on milk_substitutions (it lacks one).
alter table menumaker.milk_substitutions      add column if not exists org_id uuid;
alter table menumaker.special_diet_forms       add column if not exists idempotency_key uuid;
alter table menumaker.milk_substitutions        add column if not exists idempotency_key uuid;
alter table menumaker.infant_meal_preferences   add column if not exists idempotency_key uuid;

create unique index if not exists special_diet_forms_idem_uq
  on menumaker.special_diet_forms (idempotency_key) where idempotency_key is not null;
create unique index if not exists milk_substitutions_idem_uq
  on menumaker.milk_substitutions (idempotency_key) where idempotency_key is not null;
create unique index if not exists infant_meal_preferences_idem_uq
  on menumaker.infant_meal_preferences (idempotency_key) where idempotency_key is not null;

-- 2. The definer RPC (one generic, whitelisted; NO dynamic SQL — explicit per-form insert).
create or replace function menumaker.submit_public_form(
  p_form            text,    -- 'special_diet' | 'fluid_milk' | 'infant_meals'
  p_center_slug     text,    -- resolved + validated → org_id / center
  p_data            jsonb,   -- flat row, keys = target-table columns
  p_idempotency_key uuid default null
) returns uuid
  language plpgsql
  security definer
  set search_path to 'menumaker', 'public', 'core'
as $function$
declare
  v_org uuid;
  v_id  uuid;
begin
  -- resolve + validate the center by slug
  select org_id into v_org
    from menumaker.centers
   where slug = p_center_slug and is_active
   limit 1;
  if v_org is null then
    raise exception 'unknown or inactive center slug %', p_center_slug;
  end if;

  if p_form = 'special_diet' then
    insert into menumaker.special_diet_forms
      (child_name, birth_date, parent_name, email, home_phone, work_phone, cell_phone,
       address, city, state, zip, diet_basis, disability_desc, major_life_activity,
       diet_restriction, special_need_desc, foods_omitted, foods_substituted,
       authority_signature_img, signed_date, authority_printed_name, authority_phone,
       org_id, idempotency_key)
    values
      (p_data->>'child_name', (nullif(p_data->>'birth_date',''))::date, p_data->>'parent_name',
       p_data->>'email', p_data->>'home_phone', p_data->>'work_phone', p_data->>'cell_phone',
       p_data->>'address', p_data->>'city', p_data->>'state', p_data->>'zip', p_data->>'diet_basis',
       p_data->>'disability_desc', p_data->>'major_life_activity', p_data->>'diet_restriction',
       p_data->>'special_need_desc', p_data->>'foods_omitted', p_data->>'foods_substituted',
       p_data->>'authority_signature_img', (nullif(p_data->>'signed_date',''))::date,
       p_data->>'authority_printed_name', p_data->>'authority_phone', v_org, p_idempotency_key)
    on conflict (idempotency_key) where idempotency_key is not null do nothing
    returning id into v_id;
    if v_id is null and p_idempotency_key is not null then
      select id into v_id from menumaker.special_diet_forms where idempotency_key = p_idempotency_key;
    end if;

  elsif p_form = 'fluid_milk' then
    insert into menumaker.milk_substitutions
      (center_name, center_provides, center_substitutes, center_declines, child_name,
       dietary_need, parent_choice, parent_signature_img, signed_date, org_id, idempotency_key)
    values
      (p_data->>'center_name', (nullif(p_data->>'center_provides',''))::boolean,
       p_data->>'center_substitutes', (nullif(p_data->>'center_declines',''))::boolean,
       p_data->>'child_name', p_data->>'dietary_need', p_data->>'parent_choice',
       p_data->>'parent_signature_img', (nullif(p_data->>'signed_date',''))::date,
       v_org, p_idempotency_key)
    on conflict (idempotency_key) where idempotency_key is not null do nothing
    returning id into v_id;
    if v_id is null and p_idempotency_key is not null then
      select id into v_id from menumaker.milk_substitutions where idempotency_key = p_idempotency_key;
    end if;

  elsif p_form = 'infant_meals' then
    insert into menumaker.infant_meal_preferences
      (center_name, formula_name, formula_choice, parent_formula_name, solid_food_choice,
       infant_name, infant_birthdate, parent_signature_img, signed_date, org_id, idempotency_key)
    values
      (p_data->>'center_name', p_data->>'formula_name', p_data->>'formula_choice',
       p_data->>'parent_formula_name', p_data->>'solid_food_choice', p_data->>'infant_name',
       (nullif(p_data->>'infant_birthdate',''))::date, p_data->>'parent_signature_img',
       (nullif(p_data->>'signed_date',''))::date, v_org, p_idempotency_key)
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

-- 3. Grants — anon (parents) + authenticated (staff) may call the door; nobody else.
revoke all on function menumaker.submit_public_form(text, text, jsonb, uuid) from public;
grant execute on function menumaker.submit_public_form(text, text, jsonb, uuid) to anon, authenticated;

-- ============================================================================
-- READ-BACKS (run after apply):
--   -- function exists + is SECURITY DEFINER + search_path pinned:
--   select proname, prosecdef, proconfig
--     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--    where n.nspname='menumaker' and p.proname='submit_public_form';
--
--   -- anon (and authenticated) can EXECUTE:
--   select has_function_privilege('anon',
--     'menumaker.submit_public_form(text,text,jsonb,uuid)','execute') as anon_exec,
--          has_function_privilege('authenticated',
--     'menumaker.submit_public_form(text,text,jsonb,uuid)','execute') as auth_exec;
--
--   -- new columns + unique idempotency indexes present:
--   select to_regclass('menumaker.special_diet_forms')      as t1,
--          to_regclass('menumaker.milk_substitutions')      as t2,
--          to_regclass('menumaker.infant_meal_preferences') as t3;
--   select indexname from pg_indexes where schemaname='menumaker'
--     and indexname in ('special_diet_forms_idem_uq','milk_substitutions_idem_uq','infant_meal_preferences_idem_uq');
-- ============================================================================
