-- АВТО-ПОДШИВКА FILING-ONLY ФОРМ: одобренная форма, которую нечего разбирать,
-- сама кладётся в дело ребёнка. Заказ владельца 05.08 (вечерний блок, п.2).
--
-- ЗАЧЕМ. Читка-ПОСЛЕ 05.08 показала дыру на живом примере: Child Release
-- Authorization Исаака Райфа одобрена Соней в 19:33:28, привязана к ребёнку —
-- и НИ ОДНОЙ строки в `documents`. Снаружи это выглядит как «разобрано», а в
-- деле ребёнка бумаги нет: ни Doc Hub, ни манифест её не видят. Разбирать в
-- такой форме нечего — это факт, который кладётся в дело; значит и класть его
-- должен тот же жест, которым её одобрили.
--
-- ПОЧЕМУ ОТДЕЛЬНАЯ ФУНКЦИЯ, А НЕ `register_document`. Тот жёстко ставит
-- `source='uploaded'` (человек принёс файл) и не умеет ссылаться на источник.
-- Здесь источник известен и должен быть НАЗВАН: `source='form'` +
-- `source_table/source_id` на саму подачу. Эта же ссылка даёт идемпотентность:
-- второй Approve (или бэкфилл поверх уже подшитого) не рождает двойника.
--
-- ЧЕСТНОЕ ПРОИСХОЖДЕНИЕ. В словарь `source` добавляется 'form'. Назвать
-- подшитую форму 'uploaded' значило бы соврать в той самой графе, по которой
-- потом отвечают на вопрос «откуда это в деле» — а канон честных бейджей
-- происхождения запрещает ровно это.
--
-- ЖУРНАЛ. Отдельной таблицы актов у документов нет и заводить её здесь не за чем:
-- след полон и так — в строке `documents` стоит КТО подшил (`attested_by`) и
-- КОГДА (`attested_at`), в `notes` — «Filed automatically on approval», а
-- `source_id` ведёт на подачу, где лежат reviewed_by/reviewed_at и печать.
-- Две подписанные строки, связанные ссылкой, отвечают на все вопросы аудита.
--
-- ЧЕГО ФУНКЦИЯ НЕ ДЕЛАЕТ: не одобряет, не привязывает ребёнка, не трогает
-- саму подачу. Она только КЛАДЁТ В ДЕЛО уже одобренное и уже привязанное —
-- и на каждый отказ отвечает СЛОВАМИ, а не тишиной.

-- ── 1. словарь источников: у подшитой формы своё имя ──────────────────────────
alter table menumaker.documents drop constraint if exists documents_source_check;
alter table menumaker.documents add constraint documents_source_check
  check (source = any (array['generated','uploaded','paper','form']));

-- ── 2. сам механизм ──────────────────────────────────────────────────────────
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
    return jsonb_build_object('filed', false, 'reason', 'No such submission.');
  end if;

  if auth.uid() is not null and not core.is_org_member(s.org_id) then
    raise exception 'not a member of org %', s.org_id using errcode = '42501';
  end if;

  -- Подшивается ТОЛЬКО одобренное: документ в деле — след решения, а не заявки.
  if s.status <> 'approved' then
    return jsonb_build_object('filed', false,
      'reason', 'The form is not approved yet — a document is filed for a filed form.');
  end if;

  select dt.name, coalesce(dt.filing_only, false)
    into v_name, v_filing
    from menumaker.document_types dt
   where dt.code = s.submission_type and dt.active;

  if v_name is null then
    return jsonb_build_object('filed', false,
      'reason', format('No document type is registered for "%s" — nothing to file it as.', s.submission_type));
  end if;

  if not v_filing then
    return jsonb_build_object('filed', false,
      'reason', format('"%s" is reviewed, not filed automatically — its fields go to the child''s card.', v_name));
  end if;

  -- Адресность. Безымянная бумага в деле не лежит: у дела есть хозяин.
  if s.child_id is null then
    return jsonb_build_object('filed', false,
      'reason', 'The form is not attached to a child — file it from the child''s card once it is.');
  end if;

  -- Идемпотентность по ссылке на подачу: один документ на одну форму.
  select d.id into v_exist
    from menumaker.documents d
   where d.source_table = 'enrollment_submissions' and d.source_id = s.id
   limit 1;
  if v_exist is not null then
    return jsonb_build_object('filed', false, 'reason', 'Already filed.', 'document_id', v_exist);
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

  return jsonb_build_object('filed', true, 'document_id', v_id, 'title', v_name, 'valid_from', v_from);
end $function$;

grant execute on function menumaker.file_submission_document(uuid) to authenticated, service_role;

comment on function menumaker.file_submission_document(uuid) is
  'Кладёт одобренную filing-only форму в дело ребёнка строкой documents (source=form, ссылка на подачу). Идемпотентна, на каждый отказ отвечает словами.';
