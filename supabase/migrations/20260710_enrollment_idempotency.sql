-- Idempotency for enrollment submissions (F4 part 2). A form load carries a random
-- token; a repeat of the SAME token returns the SAME submission instead of inserting
-- a duplicate — closing the double-click / retry / refresh-resubmit race on the
-- server (the client-side lock in form-kit is the first line; this is the backstop).
-- Evidence: IEA pair ebd0522c/cc3d3c7a (25s apart) — one filled form, two rows.
--
-- Scope: the direct RPC path (public forms opened via the loader). The embed path
-- writes through the host app; embed idempotency is a host follow-up.
--
-- Applied to project menumaker (trrmyqfpxntmgxnqkikp) 2026-07-10. Verified: repeat of
-- the same token returned the same submission id, rowcount=1 (no duplicate).

alter table menumaker.enrollment_submissions
  add column if not exists idempotency_key uuid;

-- Partial unique: only non-null keys are deduped; historical null rows are unaffected.
create unique index if not exists enrollment_submissions_idempotency_key_uidx
  on menumaker.enrollment_submissions (idempotency_key)
  where idempotency_key is not null;

-- Recreate the RPC with a trailing p_idempotency_key (default null → old callers keep
-- working). DROP+CREATE because CREATE OR REPLACE cannot change the argument list.
drop function if exists menumaker.submit_enrollment_form(uuid, uuid, text, jsonb, jsonb, date, text);

create function menumaker.submit_enrollment_form(
  p_org uuid, p_center uuid, p_submission_type text, p_form_data jsonb,
  p_signatures jsonb default '{}'::jsonb, p_signature_date date default null,
  p_source text default 'online', p_idempotency_key uuid default null
) returns uuid
  language plpgsql
  security definer
  set search_path to 'menumaker', 'public', 'core'
as $function$
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
    (org_id, center_id, submission_type, form_data, signatures, signature_date, status, source, idempotency_key)
  values
    (p_org, p_center, p_submission_type,
     coalesce(p_form_data, '{}'::jsonb), coalesce(p_signatures, '{}'::jsonb),
     p_signature_date, 'pending', coalesce(p_source, 'online'), p_idempotency_key)
  on conflict (idempotency_key) where idempotency_key is not null do nothing
  returning id into v_id;

  -- Repeat token (or a concurrent winner) → no row inserted → return the original id
  -- so the caller gets the same submission, never a duplicate.
  if v_id is null and p_idempotency_key is not null then
    select id into v_id from menumaker.enrollment_submissions
     where idempotency_key = p_idempotency_key;
  end if;

  return v_id;
end $function$;

grant execute on function menumaker.submit_enrollment_form(uuid, uuid, text, jsonb, jsonb, date, text, uuid)
  to anon, authenticated;
