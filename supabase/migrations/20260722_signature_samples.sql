-- 20260722_signature_samples.sql — три полки образцов подписи, в БД
--
-- ✅ ПРИМЕНЕНА 2026-07-16 по слову Николая («согласен делаем»).
--
-- READ-BACK (фактический):
--   menumaker.signature_samples → существует · строк 0 · RLS true · политик 3 · индексов 4
--   гранты: authenticated → INSERT, SELECT, UPDATE  ·  anon → НИ ОДНОГО
--   Ничего существующего не тронуто: таблица новая.
--
-- ⚠️ ПОЙМАНО ПРИ ЧТЕНИИ ГРАНТОВ, А НЕ КОММЕНТАРИЕВ: после create table грантов не
-- было НИ У КОГО, кроме postgres/service_role — то есть три политики для
-- authenticated были бы бессмысленны, директор до таблицы просто не дотянулся бы.
-- Это ровно урок 20260715: комментарий миграции — не доказательство.
--
-- ЗАЧЕМ
-- ─────
-- Николай, 2026-07-16: «есть ли в БД разделение образцов подписей на родителей,
-- работников и директоров… без этого директор не сможет подписать».
--
-- ЗАМЕРЕНО: в БД образцов НЕТ ВООБЩЕ, ни для кого. Есть только подписи НА
-- документах — enrollment_submissions.signatures, staff_agreement_signatures,
-- byod_signatures, картинки на формах спецдиеты/молока. Их никто не перечитывает
-- как образец.
--
-- Разделение по ролям существует, но ТОЛЬКО в браузере: `pa_sig_sample:<scope>`
-- в localStorage form-kit, полки `parent` и `staff`. Полки `director` нет нигде.
-- Следствие: образец живёт ровно столько, сколько вкладка. Пакет №1 у двери и
-- пакет №2 по ссылке из почты — это два захода, часто с разных устройств; на
-- втором полка пуста и родитель рисует заново.
--
-- ПОЧЕМУ НЕ ВЗЯТЬ ОБРАЗЕЦ ДИРЕКТОРА ИЗ STAFF
-- ──────────────────────────────────────────
-- Один человек бывает в двух ролях. Живой пример: Sonia Texidor — и родитель
-- Izabella Rodriguez-Texidor, и администратор Ridge. Она подписывает:
--   · свой JD          → как СОТРУДНИК → полка `staff`
--   · DCY 01234 чужого ребёнка → как ВЛАСТЬ ЦЕНТРА → полка `director`
-- Возьми мы образец директора из Staff — полка станет общей, и любая форма
-- сотрудника на киоске предложит подпись власти. Это дыра Staff Consent
-- (platform-standards, 2026-07-14), только дороже: подделывается не JD, а
-- контрподпись. Полки ТРИ, и полка директора рождается под ЕГО ЛОГИНОМ, а не
-- из формы на общем планшете.
--
-- КОГДА ОБРАЗЕЦ ПРИНИМАЕТСЯ — ЭТО ОТВЕТ НИКОЛАЯ
-- ─────────────────────────────────────────────
-- «одобрение образца подписи родителя через форму Parent Consent» — момент
-- принятия это APPROVE. Замерено, почему иначе нельзя:
--   staff  → 105 строк, НИ У ОДНОГО нет логина (колонки user_id не существует)
--   guardian → 414, child_guardian → 540, auth.users → ВСЕГО 9
-- То есть в момент подписи человека ещё НЕТ как записи. Он появляется на
-- Approve — тогда и цепляем образец. До этого пакет №1 идёт на одном телефоне
-- в один присест, там полки в браузере достаточно.
--
-- ЭТО НЕ ВТОРОЙ СТОР ПОДПИСЕЙ. Подпись НА документе — улика того подписания, её
-- переписывать нельзя («a signed record is never rewritten»). Образец — иное:
-- переиспользуемый оттиск. Поэтому копия, а не ссылка: сама заявка остаётся
-- нетронутой навсегда.

begin;

create table if not exists menumaker.signature_samples (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null,
  center_id            uuid,                       -- null = вся организация (директор)
  scope                text not null check (scope in ('parent','staff','director')),

  -- Владелец. Ровно один, и он обязан соответствовать полке — см. constraint ниже.
  owner_auth_id        uuid,                       -- director: его логин
  owner_guardian_id    uuid,                       -- parent:   семья
  owner_staff_id       uuid,                       -- staff:    сотрудник (логина нет)

  -- Имя НА образце объявляется, не угадывается (platform-standards, 2026-07-14:
  -- хардкод #parent_name молча давал пустое имя на неродительской форме).
  owner_name           text not null check (btrim(owner_name) <> ''),

  signature_image      text not null check (signature_image like 'data:image/%'),
  signature_method     text not null check (signature_method in ('drawn','typed')),

  -- Откуда пришла. Для родителя/сотрудника — одобренный Consent. Для директора
  -- null: он подписывает у себя в профиле, формы под этим нет.
  source_submission_id uuid references menumaker.enrollment_submissions(id) on delete set null,

  -- Кто принял и когда. Это и есть «одобрение образца».
  adopted_by           uuid not null,
  adopted_at           timestamptz not null default now(),

  -- Отзыв вместо удаления: образец — улика, кто чем подписывал.
  revoked_at           timestamptz,
  revoked_by           uuid,

  created_at           timestamptz not null default now(),

  constraint signature_samples_one_owner check (
    (scope = 'director' and owner_auth_id     is not null and owner_guardian_id is null and owner_staff_id is null) or
    (scope = 'parent'   and owner_guardian_id is not null and owner_auth_id     is null and owner_staff_id is null) or
    (scope = 'staff'    and owner_staff_id    is not null and owner_auth_id     is null and owner_guardian_id is null)
  )
);

-- ОДИН живой образец на владельца в каждой полке. Частичные индексы: отозванные
-- не мешают выдать новый, но два живых одновременно невозможны.
create unique index if not exists signature_samples_live_director
  on menumaker.signature_samples (owner_auth_id) where scope = 'director' and revoked_at is null;
create unique index if not exists signature_samples_live_parent
  on menumaker.signature_samples (owner_guardian_id) where scope = 'parent' and revoked_at is null;
create unique index if not exists signature_samples_live_staff
  on menumaker.signature_samples (owner_staff_id) where scope = 'staff' and revoked_at is null;

alter table menumaker.signature_samples enable row level security;

-- Рисунок политик скопирован со staff_agreement_signatures (проверено запросом),
-- а не придуман: PERMISSIVE auth_manage + RESTRICTIVE org_isolation + staff_only.
drop policy if exists auth_manage   on menumaker.signature_samples;
drop policy if exists org_isolation on menumaker.signature_samples;
drop policy if exists staff_only    on menumaker.signature_samples;

create policy auth_manage on menumaker.signature_samples
  as permissive for all to authenticated using (true) with check (true);

create policy org_isolation on menumaker.signature_samples
  as restrictive for all to authenticated
  using (core.is_org_member(org_id)) with check (core.is_org_member(org_id));

create policy staff_only on menumaker.signature_samples
  as restrictive for all to authenticated
  using (menumaker.get_user_role() = any (array['director','office_manager','admin']))
  with check (menumaker.get_user_role() = any (array['director','office_manager','admin']));

-- ⚠️ deny_teacher СЮДА НЕ ВЕШАЕМ. Роли teacher не существует; staff_only и так
-- не пускает cook. Повесить ALL-deny значило бы убить полку в день, когда роль
-- появится (тот же урок, что с attendance_records и internal_messages).

-- ГРАНТЫ. Без них RLS бессмысленна: политики для authenticated ничего не значат,
-- если роль до таблицы не дотягивается. Проверено запросом (а не по памяти):
--   enrollment_submissions      → authenticated: DELETE, INSERT, SELECT, UPDATE
--   staff_agreement_signatures  → authenticated: INSERT, SELECT, UPDATE  ← этот рисунок
--   anon                        → НИ ОДНОГО гранта ни там, ни там
-- DELETE не даём НАМЕРЕННО: образец отзывается (revoked_at), а не удаляется — он
-- улика того, кто чем подписывал.
grant select, insert, update on menumaker.signature_samples to authenticated;

-- anon не получает НИЧЕГО. Образец — оттиск подписи; anon-select по нему это
-- раздача чужих подписей. Родитель применяет свой образец через личную ссылку,
-- то есть через SECURITY DEFINER RPC с токеном, а не прямым select.
revoke all on menumaker.signature_samples from anon;

comment on table menumaker.signature_samples is
  'Образцы подписи, три полки (parent/staff/director). НЕ второй стор подписей: подпись на '
  'документе — улика подписания и неприкосновенна; образец — переиспользуемый оттиск. '
  'Принимается на Approve (одобрение образца, Николай 2026-07-16) — раньше человека нет как '
  'записи: staff без логина (105), guardian появляется на Approve, auth.users всего 9. '
  'Полка director рождается ПОД ЛОГИНОМ директора, никогда из формы на общем киоске: '
  'иначе форма сотрудника предложит подпись власти (дыра Staff Consent). '
  'Один живой образец на владельца в полке; отзыв, а не удаление.';

comment on column menumaker.signature_samples.scope is
  'Полка = РОЛЬ ПОДПИСАНТА, не человек. Sonia Texidor — и родитель, и администратор Ridge: '
  'её parent и её director — РАЗНЫЕ образцы. Пад читает только свою полку и НИКОГДА не '
  'подставляет чужую (platform-standards, 2026-07-14).';

commit;

-- ── READ-BACK ПОСЛЕ ПРИМЕНЕНИЯ ──────────────────────────────────────────────
--   select to_regclass('menumaker.signature_samples');            → не NULL
--   select count(*) from menumaker.signature_samples;             → 0
--   select polname, polpermissive from pg_policy
--    where polrelid='menumaker.signature_samples'::regclass;      → 3 политики
--   select relrowsecurity from pg_class
--    where oid='menumaker.signature_samples'::regclass;           → true
--   Ничего существующего не тронуто: таблица новая, FK только на
--   enrollment_submissions с on delete set null.
--
-- ── ROLLBACK ────────────────────────────────────────────────────────────────
--   drop table if exists menumaker.signature_samples;
--   Строк нет — терять нечего.
