-- СКАН НЕ РОЖДАЕТ ЗАПИСЬ — СКАН ПРИКЛАДЫВАЕТСЯ К ЗАПИСИ (канон владельца 01.08).
-- Применено по слову GO 2026-08-05, п.9 GO-блока.
--
-- ЗАМЕР ИСТОЧНИКА (05.08). Строк `source='paper_entry'` — 66, все с 06.07 по 28.07,
-- и у ВСЕХ 66 внутри `form_data` лежат `scan_ref` и `_ocr`. Пользовательский агент —
-- iPhone Safari: это ОТДЕЛЬНЫЙ клиент съёмки (мобильное веб-приложение вне этого
-- репозитория), который после `enrollment-scan-ocr` звал `submit_enrollment_form`
-- с `source='paper_entry'`. В самом приложении такого пути нет: `enrollmentScan.ts`
-- и Inbox эти строки только ЧИТАЮТ, ни одного создателя в коде.
--
-- ПОЭТОМУ ЗАКРЫВАЕМ НА СЕРВЕРЕ. Клиент живёт снаружи, договориться с ним правкой
-- фронта нельзя: старая сборка на чьём-то телефоне продолжила бы лить строки.
-- Отказ ГОВОРИТ СЛОВАМИ — молчаливое «принято, но не создано» было бы хуже
-- открытого канала: человек снял бы бумагу и ушёл, считая, что она в системе.
--
-- ЧЕГО ЭТО НЕ ТРОГАЕТ:
--   • существующие 66 строк — они разбираются руками по порядку дня;
--   • `enrollment-scan-ocr` — распознавание живёт дальше, оно и не пишет строк;
--   • онлайн-формы (`source='online'`) и ручной ввод (`manual_entry`) — их каналы
--     это разные двери и они остаются открытыми.
create or replace function menumaker.submit_enrollment_form(
  p_org uuid, p_center uuid, p_submission_type text, p_form_data jsonb,
  p_signatures jsonb default '{}'::jsonb, p_signature_date date default null::date,
  p_source text default 'online'::text, p_idempotency_key uuid default null::uuid,
  p_form_version text default null::text, p_esign_consent boolean default false,
  p_signature_sample_id uuid default null::uuid, p_record_origin text default null::text,
  p_esign_consent_submission_id uuid default null::uuid)
returns uuid
language plpgsql
security definer
set search_path to 'menumaker', 'public', 'core', 'extensions'
as $function$
declare
  v_id       uuid;
  v_sealed   jsonb := coalesce(p_signatures, '{}'::jsonb);
  v_hash     text;
  v_headers  json;
  v_ip       text;
  v_ua       text;
  v_sig_date date;
begin
  if not exists (select 1 from menumaker.centers c where c.id = p_center and c.org_id = p_org) then
    raise exception 'center % does not belong to org %', p_center, p_org;
  end if;
  if coalesce(p_source, 'online') not in ('online','paper_entry','manual_entry') then
    raise exception 'invalid source %', p_source;
  end if;

  -- ── КАНАЛ «СКАН → СТРОКА INBOX» ЗАКРЫТ ──────────────────────────────────
  if coalesce(p_source, 'online') = 'paper_entry' then
    raise exception 'A scan does not create a record. Attach the photo to a record instead: file it from Unfiled documents, from the child''s card, or with "Attach scan" on Paper applications. The record itself is created by manual entry.'
      using errcode = 'check_violation';
  end if;

  if p_record_origin is not null and p_record_origin not in ('live','rehearsal','import','seed') then
    raise exception 'invalid record_origin % (live | rehearsal | import | seed)', p_record_origin;
  end if;

  v_sig_date := p_signature_date;
  if v_sig_date is null then
    begin
      v_sig_date := nullif(btrim(p_form_data->>'signature_date'), '')::date;
    exception when others then
      v_sig_date := null;
    end;
  end if;

  begin
    v_headers := nullif(current_setting('request.headers', true), '')::json;
  exception when others then v_headers := null; end;
  if v_headers is not null then
    v_ip := split_part(coalesce(v_headers->>'x-forwarded-for', v_headers->>'x-real-ip', ''), ',', 1);
    v_ip := nullif(btrim(v_ip), '');
    v_ua := nullif(v_headers->>'user-agent', '');
  end if;

  v_hash := encode(
    extensions.digest(
      convert_to(coalesce(p_form_data,'{}'::jsonb)::text || chr(31) || v_sealed::text, 'UTF8'),
      'sha256'),
    'hex');

  insert into menumaker.enrollment_submissions
    (org_id, center_id, submission_type, form_data, signatures, signature_date, status, source,
     idempotency_key, content_hash, sealed_signatures, form_version, submit_ip, submit_user_agent,
     esign_consent_at, signature_sample_id, sealed_at,
     record_origin, esign_consent_submission_id)
  values
    (p_org, p_center, p_submission_type,
     coalesce(p_form_data,'{}'::jsonb), v_sealed, v_sig_date, 'pending', coalesce(p_source,'online'),
     p_idempotency_key, v_hash, v_sealed, nullif(btrim(coalesce(p_form_version,'')),''), v_ip, v_ua,
     case when p_esign_consent then now() else null end, p_signature_sample_id, now(),
     p_record_origin, p_esign_consent_submission_id)
  on conflict (idempotency_key) where idempotency_key is not null do nothing
  returning id into v_id;

  if v_id is null and p_idempotency_key is not null then
    select id into v_id from menumaker.enrollment_submissions where idempotency_key = p_idempotency_key;
  end if;

  return v_id;
end $function$;

comment on function menumaker.submit_enrollment_form(uuid,uuid,text,jsonb,jsonb,date,text,uuid,text,boolean,uuid,text,uuid) is
  'Подача формы. source=paper_entry ЗАКРЫТ 05.08: скан не рождает запись, скан прикладывается к записи (канон 01.08). Существующие 66 строк не тронуты.';
