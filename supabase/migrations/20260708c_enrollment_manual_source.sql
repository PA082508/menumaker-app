-- Manual entry (no scan) — director types an enrollment when the paper form is
-- unusable / unscannable. Adds a third source value 'manual_entry' to the
-- enrollment_submissions.source domain and the submit RPC guard. The descriptive
-- audit note ("manual (no scan / paper unusable)") is carried in form_data, not
-- the enum. Deadline: kids not yet in the system need to reach the meal grids
-- for the July claim bridge. Applied to project menumaker (trrmyqfpxntmgxnqkikp) 2026-07-08.

alter table menumaker.enrollment_submissions
  drop constraint if exists enrollment_submissions_source_check;
alter table menumaker.enrollment_submissions
  add constraint enrollment_submissions_source_check
  check (source in ('online','paper_entry','manual_entry'));

create or replace function menumaker.submit_enrollment_form(
  p_org            uuid,
  p_center         uuid,
  p_submission_type text,
  p_form_data      jsonb,
  p_signatures     jsonb default '{}'::jsonb,
  p_signature_date date  default null,
  p_source         text  default 'online'
) returns uuid
language plpgsql security definer set search_path = menumaker, public, core as $$
declare v_id uuid;
begin
  if not exists (
    select 1 from menumaker.centers c where c.id = p_center and c.org_id = p_org
  ) then
    raise exception 'center % does not belong to org %', p_center, p_org;
  end if;
  if coalesce(p_source, 'online') not in ('online','paper_entry','manual_entry') then
    raise exception 'invalid source %', p_source;
  end if;

  insert into menumaker.enrollment_submissions
    (org_id, center_id, submission_type, form_data, signatures, signature_date, status, source)
  values
    (p_org, p_center, p_submission_type,
     coalesce(p_form_data, '{}'::jsonb), coalesce(p_signatures, '{}'::jsonb),
     p_signature_date, 'pending', coalesce(p_source, 'online'))
  returning id into v_id;

  return v_id;
end $$;

grant execute on function
  menumaker.submit_enrollment_form(uuid, uuid, text, jsonb, jsonb, date, text)
  to anon, authenticated;
