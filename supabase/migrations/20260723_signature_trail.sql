-- 20260723_signature_trail.sql — SIGNATURE DIGITAL TRAIL (все 5 строк фикс-плана, ОДИН заход)
--
-- ✅ APPLIED 2026-07-23 на прод (Nikolay GO по live-DB протоколу). Post-apply R1–R5 зелёные:
--    R1 columns=9 · R2 triggers=2 · R3 RPC=1 overload/11 args/DEFINER/anon=true ·
--    R4 (реальный sha256): hash_len=64 · form_version/esign/sealed-snapshot проставлены ·
--       UPDATE form_data ЗАБЛОКИРОВАН · DELETE ЗАБЛОКИРОВАН · workflow-update OK · контрподпись OK ·
--       функц. тест в self-abort DO-блоке → тест-строка откатана (0 residue, 0 sealed rows, 74 total).
--    Бэкфилл НЕ запускался (печать forward-only; старые 74 строки изменяемы до отдельного слова).
--
-- ЗАЧЕМ. Держит письмо спонсору CACFP: подпись должна нести защитимый цифровой след.
-- Read-back #1 показал: метод/имя/версия-формы/центр/серверный timestamp/оттиск пишутся, но
-- НЕТ (а) неизменяемости/tamper-evidence, (б) единой версии формы, (в) IP/устройства,
-- (г) связи adopt-образец→потребитель, (д) записанного согласия на э-подпись. Закрываем все 5.
--
-- ПАТТЕРН ВЗЯТ ИЗ РЕПО: staff_agreement_signatures (document_version, witnessed_by, signed_at) +
-- safepass_agreements (device_id, ip_address, signature_method) — там след уже богатый; здесь
-- доводим enrollment_submissions (родительские CACFP/enrollment-формы) до того же уровня.
--
-- ── ИНВАРИАНТ БЕЗОПАСНОСТИ РАБОЧЕГО ПОТОКА (сверено с кодом, enrollmentApprove.ts) ───────────
--   Approve НИКОГДА не правит form_data. Он правит status/child_id/reviewed_*/paper_*/
--   reject_reason и ДОБАВЛЯЕТ слот контрподписи в signatures (undo его убирает). Поэтому:
--     • form_data + СНИМОК подписи на момент сабмита (sealed_signatures) + метаданные → ЗАМОРОЗКА;
--     • signatures (рабочая колонка) остаётся ИЗМЕНЯЕМОЙ — контрподпись директора аддитивна;
--     • «печать» (seal) кусается ТОЛЬКО когда content_hash проставлен → старые строки не тронуты
--       (полностью совместимо), пока их не запечатает опциональный бэкфилл в хвосте.

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Колонки следа. Все nullable — старые строки живут как раньше.
-- ─────────────────────────────────────────────────────────────────────────────
alter table menumaker.enrollment_submissions
  add column if not exists content_hash        text,          -- SHA-256 hex: canonical(form_data) ⨁ canonical(sealed_signatures)
  add column if not exists sealed_signatures    jsonb,         -- НЕИЗМЕНЯЕМЫЙ снимок signatures на момент сабмита (оттиск родителя)
  add column if not exists form_version         text,          -- versions[current] реестра на момент подписи (передаёт клиент формы)
  add column if not exists submit_ip            text,          -- из request-контекста RPC
  add column if not exists submit_user_agent    text,          -- из request-контекста RPC
  add column if not exists signature_sample_id  uuid,          -- потребитель adopt-образца (method='adopted')
  add column if not exists esign_consent_at     timestamptz,   -- зафиксированное согласие на э-подпись (плашка → запись)
  add column if not exists supersedes_id        uuid,          -- правка = НОВАЯ строка, ссылается на прежнюю (append-only)
  add column if not exists correction_reason    text;          -- причина правки (обязательна при supersedes_id — см. чек ниже)

-- Мягкие FK (nullable, без каскада — улику не удаляем каскадом).
do $$
begin
  if not exists (select 1 from pg_constraint where conname='enr_sub_sig_sample_fk') then
    alter table menumaker.enrollment_submissions
      add constraint enr_sub_sig_sample_fk foreign key (signature_sample_id)
      references menumaker.signature_samples(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname='enr_sub_supersedes_fk') then
    alter table menumaker.enrollment_submissions
      add constraint enr_sub_supersedes_fk foreign key (supersedes_id)
      references menumaker.enrollment_submissions(id) on delete set null;
  end if;
  -- причина обязательна, когда строка что-то заменяет
  if not exists (select 1 from pg_constraint where conname='enr_sub_correction_reason_ck') then
    alter table menumaker.enrollment_submissions
      add constraint enr_sub_correction_reason_ck
      check (supersedes_id is null or nullif(btrim(correction_reason),'') is not null);
  end if;
end $$;

create index if not exists enr_sub_supersedes_idx on menumaker.enrollment_submissions (supersedes_id) where supersedes_id is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. НЕИЗМЕНЯЕМОСТЬ. Запечатанная строка (content_hash задан) не даёт менять
--    замороженные колонки и не даёт себя удалить. Срабатывает для ВСЕХ ролей,
--    включая service_role — приложение не может обойти. (postgres-суперюзер может
--    отключить триггер — это неизбежно и документировано; для authenticated/anon/
--    service_role — жёстко.)
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

  -- UPDATE: печать кусается только на запечатанной строке.
  if old.content_hash is not null then
    if new.form_data       is distinct from old.form_data
    or new.sealed_signatures is distinct from old.sealed_signatures
    or new.content_hash    is distinct from old.content_hash
    or new.form_version    is distinct from old.form_version
    or new.submit_ip       is distinct from old.submit_ip
    or new.submit_user_agent is distinct from old.submit_user_agent
    or new.esign_consent_at is distinct from old.esign_consent_at
    or new.signature_date  is distinct from old.signature_date
    or new.submission_type is distinct from old.submission_type
    or new.org_id          is distinct from old.org_id
    or new.center_id       is distinct from old.center_id
    then
      raise exception 'enrollment_submission % запечатана — замороженные поля (form_data / подпись-снимок / версия / контекст / центр) неизменяемы; правка = новая строка', old.id
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
  -- РАЗРЕШЕНО менять на запечатанной строке (рабочий поток Approve):
  --   status, child_id (autofile), reviewed_by/at, paper_signed_*, fee_*, reject_reason,
  --   signatures (аддитивная контрподпись директора + её undo), signature_sample_id,
  --   supersedes_id, correction_reason.
end $fn$;

drop trigger if exists trg_enr_sub_seal_upd on menumaker.enrollment_submissions;
create trigger trg_enr_sub_seal_upd
  before update on menumaker.enrollment_submissions
  for each row execute function menumaker.enrollment_submissions_seal_guard();

drop trigger if exists trg_enr_sub_seal_del on menumaker.enrollment_submissions;
create trigger trg_enr_sub_seal_del
  before delete on menumaker.enrollment_submissions
  for each row execute function menumaker.enrollment_submissions_seal_guard();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. RPC v2 — печатает след на момент подписи. Обратно совместимо: новые параметры
--    имеют дефолты, старые вызовы (внешний form-kit) продолжают работать. IP/UA/hash
--    RPC берёт САМ (клиент не участвует); form_version + esign_consent передаёт клиент
--    (провод во внешнем form-kit — отдельный заход по репо витрины, как фикс #5).
--
--    Каноничность hash: jsonb::text в Postgres детерминирован (ключи отсортированы, без
--    пробелов), поэтому content_hash воспроизводим и проверяем позже.
-- ─────────────────────────────────────────────────────────────────────────────
-- Drop the OLD 8-arg signature first: adding params via CREATE OR REPLACE would leave an
-- overload behind (functions are keyed by arg types), and PostgREST would see two candidates.
-- The new 11-arg version defaults the added params, so existing 8-named-arg callers still resolve.
drop function if exists menumaker.submit_enrollment_form(uuid,uuid,text,jsonb,jsonb,date,text,uuid);

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

  -- Request-контекст (PostgREST кладёт заголовки в GUC request.headers). Тихо-стойко к отсутствию.
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::json;
  exception when others then v_headers := null; end;
  if v_headers is not null then
    v_ip := split_part(coalesce(v_headers->>'x-forwarded-for', v_headers->>'x-real-ip', ''), ',', 1);
    v_ip := nullif(btrim(v_ip), '');
    v_ua := nullif(v_headers->>'user-agent', '');
  end if;

  -- Печать содержимого: form_data ⨁ снимок подписи (оба замораживаются триггером).
  v_hash := encode(
    extensions.digest(
      convert_to(coalesce(p_form_data,'{}'::jsonb)::text || chr(31) || v_sealed::text, 'UTF8'),
      'sha256'),
    'hex');

  insert into menumaker.enrollment_submissions
    (org_id, center_id, submission_type, form_data, signatures, signature_date, status, source,
     idempotency_key, content_hash, sealed_signatures, form_version, submit_ip, submit_user_agent,
     esign_consent_at, signature_sample_id)
  values
    (p_org, p_center, p_submission_type,
     coalesce(p_form_data,'{}'::jsonb), v_sealed, p_signature_date, 'pending', coalesce(p_source,'online'),
     p_idempotency_key, v_hash, v_sealed, p_form_version, v_ip, v_ua,
     case when p_esign_consent then now() else null end, p_signature_sample_id)
  on conflict (idempotency_key) where idempotency_key is not null do nothing
  returning id into v_id;

  if v_id is null and p_idempotency_key is not null then
    select id into v_id from menumaker.enrollment_submissions where idempotency_key = p_idempotency_key;
  end if;

  return v_id;
end $function$;

-- Гранты сохраняем как были (anon + authenticated вызывают DEFINER-RPC).
revoke execute on function menumaker.submit_enrollment_form(uuid,uuid,text,jsonb,jsonb,date,text,uuid,text,boolean,uuid) from public;
grant  execute on function menumaker.submit_enrollment_form(uuid,uuid,text,jsonb,jsonb,date,text,uuid,text,boolean,uuid) to anon, authenticated;

-- ⚠️ submit_public_form (staff/public путь) НЕ тронут этим заходом — его тело сначала читаем,
--    затем зеркалим тот же паттерн отдельным дифом. Отмечено как parallel follow-up.

commit;

-- ═════════════════════════════════════════════════════════════════════════════
-- (ОПЦИОНАЛЬНО, ОТДЕЛЬНЫМ СЛОВОМ) БЭКФИЛЛ — запечатать существующие строки.
-- Это ДАННЫЕ-write: по умолчанию НЕ выполняем. Раскомментировать по решению Николая.
-- Печатает старые строки их же содержимым; после этого они становятся неизменяемыми.
-- ─────────────────────────────────────────────────────────────────────────────
-- update menumaker.enrollment_submissions s
--    set sealed_signatures = coalesce(s.signatures,'{}'::jsonb),
--        content_hash = encode(extensions.digest(
--          convert_to(coalesce(s.form_data,'{}'::jsonb)::text || chr(31) || coalesce(s.signatures,'{}'::jsonb)::text,'UTF8'),
--          'sha256'),'hex')
--  where s.content_hash is null;

-- ═════════════════════════════════════════════════════════════════════════════
-- READ-BACK — вердикт колонками (вписать после apply)
-- ═════════════════════════════════════════════════════════════════════════════
-- R1. Колонки на месте (9 новых, все nullable):
--   select column_name,data_type,is_nullable from information_schema.columns
--    where table_schema='menumaker' and table_name='enrollment_submissions'
--      and column_name in ('content_hash','sealed_signatures','form_version','submit_ip',
--        'submit_user_agent','signature_sample_id','esign_consent_at','supersedes_id','correction_reason')
--    order by column_name;   -- 9 строк
-- R2. Триггеры печати есть:
--   select tgname from pg_trigger where tgrelid='menumaker.enrollment_submissions'::regclass
--     and tgname like 'trg_enr_sub_seal%';   -- 2 строки (upd, del)
-- R3. RPC пересоздана с 11 параметрами, DEFINER, anon+auth execute:
--   select p.pronargs, p.prosecdef,
--          has_function_privilege('anon',p.oid,'execute') a,
--          has_function_privilege('authenticated',p.oid,'execute') au
--     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--    where n.nspname='menumaker' and p.proname='submit_enrollment_form';   -- 11 · t · t · t
-- R4. ФУНКЦИОНАЛЬНЫЙ (в транзакции, ROLLBACK — НИКОГДА на живой без слова):
--   -- (a) submit → строка несёт content_hash≠null, sealed_signatures, esign_consent_at при consent=true.
--   -- (b) UPDATE form_data запечатанной строки → EXCEPTION (check_violation).
--   -- (c) UPDATE signatures (аддитивно, контрподпись) → OK.
--   -- (d) DELETE запечатанной → EXCEPTION.
--   -- (e) старая строка (content_hash null) → UPDATE/DELETE проходят (совместимость).
-- R5. Approve-поток не сломан: markApproved/rejectSubmission/контрподпись меняют только
--     незамороженные колонки → 0 нарушений на реальных pending-строках (тест на копии).
