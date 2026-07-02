-- Policy-signing RPCs for the public (anon) SafePass parent app, plus 'consent' as a
-- valid signature method (checkbox agreement). SECURITY DEFINER so anon can sign
-- without broad RLS access to safepass_agreements. Applied 2026-07-02.
alter table menumaker.safepass_agreements drop constraint safepass_agreements_signature_method_check;
alter table menumaker.safepass_agreements add constraint safepass_agreements_signature_method_check
  check (signature_method = any (array['face_id','touch_id','pin','consent']));

create or replace function menumaker.safepass_has_signed(p_org uuid, p_person_type text, p_person_id text, p_key text)
returns boolean language sql security definer set search_path = menumaker, public as $$
  select exists (
    select 1
    from menumaker.safepass_agreements a
    join menumaker.policy_documents pd
      on pd.org_id = a.org_id and pd.key = a.policy_code and pd.version = a.document_version
    where a.org_id = p_org and a.person_type = p_person_type and a.person_id = p_person_id
      and a.policy_code = p_key and pd.status = 'active'
  );
$$;

create or replace function menumaker.safepass_sign(
  p_org uuid, p_center uuid, p_person_type text, p_person_id text, p_person_name text,
  p_key text, p_signature_method text, p_device_id text, p_source text default 'app')
returns text language plpgsql security definer set search_path = menumaker, public as $$
declare v_version text;
begin
  select version into v_version from menumaker.policy_documents
   where org_id = p_org and key = p_key and status = 'active'
   order by version desc limit 1;
  if v_version is null then raise exception 'no active policy % for org %', p_key, p_org; end if;
  insert into menumaker.safepass_agreements
    (org_id, center_id, person_type, person_id, person_name, policy_code, document_version, signature_method, device_id, source)
  values (p_org, p_center, p_person_type, p_person_id, p_person_name, p_key, v_version, p_signature_method, p_device_id, p_source)
  on conflict (org_id, person_type, person_id, document_version) do nothing;
  return v_version;
end $$;

grant execute on function menumaker.safepass_has_signed(uuid,text,text,text) to anon, authenticated;
grant execute on function menumaker.safepass_sign(uuid,uuid,text,text,text,text,text,text,text) to anon, authenticated;
