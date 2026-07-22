-- 20260722_form_access.sql — ДОПУСК-СЛОЙ библиотеки (director_composable)
--
-- ⛔ PREPARE — НЕ ПРИМЕНЕНО. Применяет Николай (или CC по его go) по live-DB протоколу:
--    prepare → go → apply → read-back вердиктом колонками. См. [[menumaker-live-db-write-protocol]].
--
-- ЧТО ЭТО. ВТОРОЙ, независимый от publish-гейта слой (см. formsLibrary.isDirectorComposable):
--   • publishable = «форма построена?» (реестр PENDING/current:null → серая, неприбираемая);
--   • composable  = «хозяин (General Director) ОТКРЫЛ форму директорам для их СВОИХ наборов?».
-- Тонкий per-org оверлей поверх статичного реестра: сам реестр НЕ трогаем (позже реестр
-- переедет в БД целиком — пока в БД только признак допуска). GD щёлкает тумблер прямо в
-- библиотеке /packet-sets; директор ВИДИТ только открытые формы (скрыты, не серые — серит
-- publish-гейт). Отсутствие строки = ЗАКРЫТО (безопасный дефолт «закрыто, пока не открыла»).
--
-- ПРАВА (зеркалит packet_sets 20260721c): читают все члены орг; ПИШЕТ только is_org_owner
--   (admin/office_manager = владелец/Татьяна). Директор допуск не меняет.

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Таблица — per-(org, form_key) флаг. form_key = ключ реестра (не FK: реестр
--    статичен вне БД; «висячий» ключ безвреден — просто не сматчится с библиотекой).
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists menumaker.form_access (
  org_id              uuid    not null,
  form_key            text    not null,
  director_composable boolean not null default false,
  updated_at          timestamptz not null default now(),
  primary key (org_id, form_key)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. RLS. Org-boundary restrictive (как в packet_sets). Чтение — члены орг; запись —
--    только is_org_owner. anon грантов НЕ получает.
-- ─────────────────────────────────────────────────────────────────────────────
alter table menumaker.form_access enable row level security;

drop policy if exists org_isolation on menumaker.form_access;
create policy org_isolation on menumaker.form_access as restrictive for all to authenticated
  using (core.is_org_member(org_id)) with check (core.is_org_member(org_id));

-- SELECT: любой член орг (директор читает, чтобы отфильтровать свой Add-from-library).
drop policy if exists sel on menumaker.form_access;
create policy sel on menumaker.form_access for select to authenticated
  using (core.is_org_member(org_id));

-- INSERT/UPDATE/DELETE: только хозяин (is_org_owner). Переиспользуем каноничную функцию.
drop policy if exists ins on menumaker.form_access;
create policy ins on menumaker.form_access for insert to authenticated
  with check (menumaker.is_org_owner(org_id));

drop policy if exists upd on menumaker.form_access;
create policy upd on menumaker.form_access for update to authenticated
  using (menumaker.is_org_owner(org_id)) with check (menumaker.is_org_owner(org_id));

drop policy if exists del on menumaker.form_access;
create policy del on menumaker.form_access for delete to authenticated
  using (menumaker.is_org_owner(org_id));

grant select, insert, update, delete on menumaker.form_access to authenticated;
-- НАМЕРЕННО без grant anon.

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. СИД [РЕКОМЕНДАЦИЯ CC — Николай подтверждает при apply, НЕ запекаю молча].
--    Дефолт схемы = false («закрыто»). Но чистый blanket-false ОПУСТОШИТ библиотеку
--    КАЖДОГО директора в день apply, пока Татьяна не откроет ~20 форм вручную. Формы,
--    уже лежащие в ВЛАДЕЛЬЦЕМ-курируемых БАЗОВЫХ наборах, — очевидно провалидированы к
--    комбинированию. Открываем ИМЕННО их (director_composable=true); всё остальное
--    остаётся закрытым до решения Татьяны. Так поведение директора не рушится, а политика
--    «закрыто, пока не открыла» сохраняется для непровалидированного хвоста.
--    ▸ Если хочешь blanket-false (пустая библиотека до ручного открытия) — УБЕРИ этот insert.
--    ▸ Если хочешь blanket-true (полное текущее поведение, Татьяна лишь закрывает) — замени
--      источник на distinct form_key из ВСЕХ наборов, либо на весь реестр (в БД реестра нет —
--      тогда сид не из БД; не рекомендую).
insert into menumaker.form_access (org_id, form_key, director_composable)
select ps.org_id, fk, true
from menumaker.packet_sets ps
cross join lateral unnest(ps.form_keys) as fk
where ps.kind = 'base'
group by ps.org_id, fk
on conflict (org_id, form_key) do nothing;

commit;

-- ═════════════════════════════════════════════════════════════════════════════
-- READ-BACK — вердикт колонками (вписать фактические значения после apply)
-- ═════════════════════════════════════════════════════════════════════════════
-- R1. RLS on + 5 политик:
--   select relrowsecurity from pg_class where oid='menumaker.form_access'::regclass;   -- t
--   select policyname,cmd,permissive from pg_policies
--     where schemaname='menumaker' and tablename='form_access' order by policyname;      -- org_isolation(restr)+sel/ins/upd/del
-- R2. anon без прав:
--   select has_table_privilege('anon','menumaker.form_access','select');                -- false
-- R3. Сид = distinct base-ключи на орг (для Play Academy ≈ union admission∪infant∪toddler_preschool):
--   select org_id, count(*) opened from menumaker.form_access group by org_id;
-- R4. Функц. (txn+rollback, set local request.jwt.claims): Татьяна upsert → успех;
--     директор upsert/update → RLS-violation; директор select → видит строки своей орг.
