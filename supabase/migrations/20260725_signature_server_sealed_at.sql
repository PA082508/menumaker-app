-- 20260725_signature_server_sealed_at.sql — §1 серверный штамп ПЕЧАТИ подписи (sealed_at).
--
-- Forward-only. ДОПОЛНЯЕТ 20260723_signature_trail (НЕ переписывает его).
--
-- ЗАЧЕМ. Письмо органу (AS SENT 2026-07) утверждает «доверенный серверный timestamp» на записи
-- подписи. Сегодня на строке есть: created_at (момент ВСТАВКИ строки, server now()) и
-- signature_date (КЛИЕНТСКАЯ дата подписи из формы, запечатана триггером 20260723). Отдельного
-- серверного момента ПЕЧАТИ подписи нет. Добавляем sealed_at — server-set в RPC (now() БД, не из
-- payload), замороженный печатью. signature_date остаётся как есть (клиентская, видимая). Описание
-- системы формулирует различие честно: signature_date = что указал родитель; sealed_at = когда
-- сервер запечатал запись.
--
-- СОВМЕСТИМОСТЬ. Колонка nullable → старые строки (74) живут как раньше (sealed_at IS NULL).
-- RPC-сигнатура 11-арг НЕ меняется → CREATE OR REPLACE, без DROP, гранты и внешние вызовы целы.

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Колонка. nullable → бэкфилл не требуется, старые строки не тронуты.
-- ─────────────────────────────────────────────────────────────────────────────
alter table menumaker.enrollment_submissions
  add column if not exists sealed_at timestamptz;   -- server-set момент печати подписи (RPC now())

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Печать замораживает sealed_at — как остальные снимок-поля. Одна distinct-строка
--    добавлена в guard. Триггеры НЕ пересоздаём (уже указывают на эту функцию).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function menumaker.enrollment_submissions_seal_guard()
returns trigger language plpgsql as $fn$
begin
  if tg_op = 'DELETE' then
    if old.content_hash is not null then
      raise exception 'enrollment_submission % запечатана — удаление запрещено; правка = новая строка (supersedes_id + correction_reason)', old.id
        using errcode = 'check_violation';
    end if;
    return old;
  end if;

  -- UPDATE: печать кусается только на запечатанной строке (content_hash задан).
  if old.content_hash is not null then
    if new.form_data        is distinct from old.form_data
    or new.sealed_signatures is distinct from old.sealed_signatures
    or new.content_hash     is distinct from old.content_hash
    or new.form_version     is distinct from old.form_version
    or new.submit_ip        is distinct from old.submit_ip
    or new.submit_user_agent is distinct from old.submit_user_agent
    or new.esign_consent_at  is distinct from old.esign_consent_at
    or new.sealed_at         is distinct from old.sealed_at       -- ← НОВОЕ замороженное поле (§1)
    or new.signature_date   is distinct from old.signature_date
    or new.submission_type  is distinct from old.submission_type
    or new.org_id           is distinct from old.org_id
    or new.center_id        is distinct from old.center_id
    then
      raise exception 'enrollment_submission % запечатана — замороженные поля (form_data / подпись-снимок / версия / контекст / центр / server-seal) неизменяемы; правка = новая строка', old.id
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
  -- РАЗРЕШЕНО менять на запечатанной строке (рабочий поток Approve):
  --   status, child_id, reviewed_by/at, paper_signed_*, fee_*, reject_reason,
  --   signatures (аддитивная контрподпись + undo), signature_sample_id, supersedes_id, correction_reason.
end $fn$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. RPC пишет sealed_at = now() (сервер, не payload). Сигнатура 11-арг НЕ меняется →
--    CREATE OR REPLACE. Тело идентично 20260723, единственная разница — sealed_at в insert.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function menumaker.submit_enrollment_form(
  p_org uuid,
  p_center uuid,
  p_submission_type text,
  p_form_data jsonb,
  p_signatures jsonb default '{}'::jsonb,
  p_signature_date date default null,
  p_source text default 'online',
  p_idempotency_key uuid default null,
  p_form_version text default null,
  p_esign_consent boolean default false,
  p_signature_sample_id uuid default null
) returns uuid
  language plpgsql
  security definer
  set search_path to 'menumaker','public','core','extensions'
as $function$
declare
  v_id       uuid;
  v_sealed   jsonb := coalesce(p_signatures, '{}'::jsonb);
  v_hash     text;
  v_headers  json;
  v_ip       text;
  v_ua       text;
begin
  if not exists (select 1 from menumaker.centers c where c.id = p_center and c.org_id = p_org) then
    raise exception 'center % does not belong to org %', p_center, p_org;
  end if;
  if coalesce(p_source, 'online') not in ('online','paper_entry','manual_entry') then
    raise exception 'invalid source %', p_source;
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
     esign_consent_at, signature_sample_id, sealed_at)
  values
    (p_org, p_center, p_submission_type,
     coalesce(p_form_data,'{}'::jsonb), v_sealed, p_signature_date, 'pending', coalesce(p_source,'online'),
     p_idempotency_key, v_hash, v_sealed, p_form_version, v_ip, v_ua,
     case when p_esign_consent then now() else null end, p_signature_sample_id, now())   -- ← sealed_at (§1)
  on conflict (idempotency_key) where idempotency_key is not null do nothing
  returning id into v_id;

  if v_id is null and p_idempotency_key is not null then
    select id into v_id from menumaker.enrollment_submissions where idempotency_key = p_idempotency_key;
  end if;

  return v_id;
end $function$;

commit;

-- ═════════════════════════════════════════════════════════════════════════════
-- READ-BACK (вписать вердикт после apply)
-- ═════════════════════════════════════════════════════════════════════════════
-- R1. Колонка есть, nullable:
--   select column_name, data_type, is_nullable from information_schema.columns
--    where table_schema='menumaker' and table_name='enrollment_submissions' and column_name='sealed_at';  -- 1 · timestamptz · YES
-- R2. Guard морозит sealed_at (функционально, в rollback-DO на живой):
--   -- seal-строка (content_hash≠null) → UPDATE ... set sealed_at=now()+1 → EXCEPTION (check_violation).
-- R3. RPC 11-арг, DEFINER, anon+auth execute:
--   select p.pronargs, p.prosecdef,
--          has_function_privilege('anon',p.oid,'execute'), has_function_privilege('authenticated',p.oid,'execute')
--     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--    where n.nspname='menumaker' and p.proname='submit_enrollment_form';  -- 11 · t · t · t
-- R4. Свежий submit → sealed_at non-null и ≈ created_at (в rollback-DO).
