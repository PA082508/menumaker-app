-- ОТКАЗ ДОЛЖЕН БЫТЬ РАЗЛИЧИМ, А НЕ ТОЛЬКО ЧИТАЕМ. Дописка к 20260806l.
--
-- Функция уже отвечает словами, но экрану этого мало: «эта форма разбирается, а
-- не подшивается» — не отказ, а норма (так ведут себя все НЕ filing-only типы),
-- и показывать её директору при каждом Approve значило бы приучить его
-- пролистывать сообщения не читая. А вот «форма не привязана к ребёнку» —
-- настоящий отказ, и он обязан прозвучать.
--
-- Поэтому к ответу добавляется `code`: экран сам решает, что показать человеку,
-- и решает по коду, а не по разбору английской фразы. Текст остаётся для лога
-- и для тех мест, где показать нужно всё.
create or replace function menumaker.file_submission_document(p_submission uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'menumaker', 'core', 'public'
as $function$
declare
  s        record;
  v_name   text;
  v_filing boolean;
  v_exist  uuid;
  v_id     uuid;
  v_from   date;
begin
  select es.id, es.org_id, es.center_id, es.submission_type, es.status,
         es.child_id, es.signature_date, es.created_at
    into s
    from menumaker.enrollment_submissions es
   where es.id = p_submission;

  if s.id is null then
    return jsonb_build_object('filed', false, 'code', 'no_submission', 'reason', 'No such submission.');
  end if;

  if auth.uid() is not null and not core.is_org_member(s.org_id) then
    raise exception 'not a member of org %', s.org_id using errcode = '42501';
  end if;

  if s.status <> 'approved' then
    return jsonb_build_object('filed', false, 'code', 'not_approved',
      'reason', 'The form is not approved yet — a document is filed for a filed form.');
  end if;

  select dt.name, coalesce(dt.filing_only, false)
    into v_name, v_filing
    from menumaker.document_types dt
   where dt.code = s.submission_type and dt.active;

  if v_name is null then
    return jsonb_build_object('filed', false, 'code', 'no_type',
      'reason', format('No document type is registered for "%s" — nothing to file it as.', s.submission_type));
  end if;

  if not v_filing then
    return jsonb_build_object('filed', false, 'code', 'not_filing_only',
      'reason', format('"%s" is reviewed, not filed automatically — its fields go to the child''s card.', v_name));
  end if;

  if s.child_id is null then
    return jsonb_build_object('filed', false, 'code', 'no_child',
      'reason', 'The form is not attached to a child — file it from the child''s card once it is.');
  end if;

  select d.id into v_exist
    from menumaker.documents d
   where d.source_table = 'enrollment_submissions' and d.source_id = s.id
   limit 1;
  if v_exist is not null then
    return jsonb_build_object('filed', false, 'code', 'already', 'reason', 'Already filed.', 'document_id', v_exist);
  end if;

  v_from := coalesce(s.signature_date, s.created_at::date);

  insert into menumaker.documents
    (org_id, center_id, doc_type, title, roster_id, source, storage_path,
     source_table, source_id, valid_from, status, notes, attested_by, attested_at, uploaded_by)
  values
    (s.org_id, s.center_id, s.submission_type, v_name, s.child_id, 'form', null,
     'enrollment_submissions', s.id, v_from, 'active',
     'Filed automatically on approval', auth.uid(), now(), auth.uid())
  returning id into v_id;

  return jsonb_build_object('filed', true, 'code', 'filed', 'document_id', v_id,
                            'title', v_name, 'valid_from', v_from);
end $function$;

-- Снятие подшивки — только для отмены собственного Approve (кнопка Undo).
-- Удаляет РОВНО ту строку, что родилась от этой подачи, и ничего больше:
-- документ, принесённый человеком, отменой чужого действия не трогается.
create or replace function menumaker.unfile_submission_document(p_submission uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'menumaker', 'core', 'public'
as $function$
declare v_org uuid; v_id uuid;
begin
  select org_id into v_org from menumaker.enrollment_submissions where id = p_submission;
  if v_org is null then return jsonb_build_object('removed', false, 'reason', 'No such submission.'); end if;
  if auth.uid() is not null and not core.is_org_member(v_org) then
    raise exception 'not a member of org %', v_org using errcode = '42501';
  end if;

  delete from menumaker.documents
   where source_table = 'enrollment_submissions' and source_id = p_submission
     and source = 'form'
  returning id into v_id;

  return jsonb_build_object('removed', v_id is not null, 'document_id', v_id);
end $function$;

grant execute on function menumaker.unfile_submission_document(uuid) to authenticated, service_role;

comment on function menumaker.unfile_submission_document(uuid) is
  'Снимает авто-подшивку (source=form) при отмене Approve. Документы, принесённые людьми, не трогает.';
