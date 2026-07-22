-- 20260722b_signature_samples_sponsor_scope.sql — четвёртая полка: `sponsor`.
--
-- GO Николая, утро 2026-07-22: apply шелфа #15 (sponsor-scope + adoptSample).
-- Способ по протоколу — сам, с read-back'ами.
--
-- ЗАЧЕМ (DECISIONS §12 п.15, ратифицировано этим go)
-- ─────────────────────────────────────────────────
-- `sponsor_sig` (IEA) = роль ГЕНЕРАЛЬНОГО ДИРЕКТОРА (владелец орг), ОТДЕЛЬНАЯ от
-- центрового `director`. Стандарт «полка = РОЛЬ подписанта, не человек» запрещает
-- коллапс sponsor→director: тот же живой пример, Sonia Texidor в двух ролях. До
-- этой миграции SigScope = parent|staff|director, и GD рисовала/печатала контр-
-- подпись КАЖДЫЙ раз. Полка sponsor даёт переиспользуемый оттиск под ЕЁ логином.
--
-- ХРАНЕНИЕ sponsor_sig В signatures — КАНОНИЧНО (слово Николая 22.07): подпись на
-- документе живёт рядом с parent_sig в enrollment_submissions.signatures, merge-
-- not-replace. Эта миграция НЕ трогает где живёт подпись — только заводит ПОЛКУ
-- образца, чтобы её можно было штамповать в слот на Approve.
--
-- ВЛАДЕЛЕЦ sponsor = owner_auth_id (тот же столбец, что director — оба это
-- auth.users). Полку различает scope, не столбец: GD, будь она заодно центровым
-- директором, имеет ДВА разных образца (director и sponsor) — ровно как задумано.
--
-- ЧТО ЗАТРАГИВАЕТСЯ
-- ────────────────
--   · CHECK signature_samples_scope_check   → +'sponsor'
--   · CHECK signature_samples_one_owner      → +ветка sponsor (как director)
--   · новый partial unique index            → один живой sponsor-образец на логин
-- RLS/гранты/политики НЕ трогаем: та же таблица, staff_only уже пускает роль
-- director/office_manager/admin (GD одна из них), anon — ничего.

begin;

-- 1) scope: разрешить 'sponsor'
alter table menumaker.signature_samples
  drop constraint if exists signature_samples_scope_check;
alter table menumaker.signature_samples
  add constraint signature_samples_scope_check
  check (scope in ('parent','staff','director','sponsor'));

-- 2) один-владелец: sponsor держит владельца в owner_auth_id (как director)
alter table menumaker.signature_samples
  drop constraint if exists signature_samples_one_owner;
alter table menumaker.signature_samples
  add constraint signature_samples_one_owner check (
    (scope = 'director' and owner_auth_id     is not null and owner_guardian_id is null and owner_staff_id is null) or
    (scope = 'sponsor'  and owner_auth_id     is not null and owner_guardian_id is null and owner_staff_id is null) or
    (scope = 'parent'   and owner_guardian_id is not null and owner_auth_id     is null and owner_staff_id is null) or
    (scope = 'staff'    and owner_staff_id    is not null and owner_auth_id     is null and owner_guardian_id is null)
  );

-- 3) ОДИН живой sponsor-образец на владельца. Отдельный частичный индекс: он НЕ
--    конфликтует с signature_samples_live_director (тот же owner_auth_id, но
--    scope='director') — две живые полки под одним логином легальны и нужны.
create unique index if not exists signature_samples_live_sponsor
  on menumaker.signature_samples (owner_auth_id) where scope = 'sponsor' and revoked_at is null;

comment on column menumaker.signature_samples.scope is
  'Полка = РОЛЬ ПОДПИСАНТА, не человек. parent/staff/director/sponsor. sponsor = '
  'Генеральный директор (владелец орг), контрподпись IEA sponsor_sig — ОТДЕЛЬНАЯ '
  'от центрового director, коллапс запрещён. Sonia Texidor — и родитель, и '
  'администратор Ridge: её образцы РАЗНЫЕ. Пад читает только свою полку и НИКОГДА '
  'не подставляет чужую (platform-standards, 2026-07-14).';

commit;

-- ── READ-BACK ПОСЛЕ ПРИМЕНЕНИЯ (заполнить фактом) ───────────────────────────
--   scope_check def       → содержит 'sponsor'
--   one_owner def         → содержит ветку sponsor
--   index live_sponsor    → существует, partial (scope='sponsor' and revoked_at is null)
--   count(*) до/после     → без изменений (миграция DDL, строк не трогает)
--   пробный insert scope='sponsor' + owner_auth_id → проходит; rollback
--
-- ── ROLLBACK ─────────────────────────────────────────────────────────────────
--   drop index if exists menumaker.signature_samples_live_sponsor;
--   и вернуть оба CHECK к варианту без 'sponsor' (20260722_signature_samples.sql).
