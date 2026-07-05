-- Allow source='embed' for the embed-form flow (host loader → anon RPC).
-- Extend BOTH the CHECK constraint and the submit_enrollment_form guard.
alter table menumaker.enrollment_submissions drop constraint enrollment_submissions_source_check;
alter table menumaker.enrollment_submissions
  add constraint enrollment_submissions_source_check
  check (source = any (array['online','paper_entry','embed']));

create or replace function menumaker.submit_enrollment_form(
  p_org uuid, p_center uuid, p_submission_type text, p_form_data jsonb,
  p_signatures jsonb default '{}'::jsonb, p_signature_date date default null::date,
  p_source text default 'online'::text)
returns uuid language plpgsql security definer
set search_path to 'menumaker','public','core' as $function$
declare v_id uuid;
begin
  if not exists (select 1 from menumaker.centers c where c.id = p_center and c.org_id = p_org) then
    raise exception 'center % does not belong to org %', p_center, p_org;
  end if;
  if coalesce(p_source,'online') not in ('online','paper_entry','embed') then
    raise exception 'invalid source %', p_source;
  end if;
  insert into menumaker.enrollment_submissions
    (org_id, center_id, submission_type, form_data, signatures, signature_date, status, source)
  values
    (p_org, p_center, p_submission_type, coalesce(p_form_data,'{}'::jsonb),
     coalesce(p_signatures,'{}'::jsonb), p_signature_date, 'pending', coalesce(p_source,'online'))
  returning id into v_id;
  return v_id;
end $function$;
