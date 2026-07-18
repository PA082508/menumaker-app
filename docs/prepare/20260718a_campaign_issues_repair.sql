-- 20260718a — PREPARE, НЕ ПРИМЕНЁН. Ждёт «go» Николая.
-- Заход (0) применяй-серии 18.07.
--
-- ЗАЧЕМ: 20260717_renewal_wave1.sql в шапке заявляет «✅ APPLIED 2026-07-16».
-- Это верно на 3 секции из 4. ИЗМЕРЕНО на живой базе 18.07:
--   campaigns                        — ЕСТЬ (0 строк)
--   status CHECK ... 'received'      — ЕСТЬ
--   refresh_renewal_action_items     — ЕСТЬ (action_items source='renewal_scan' = 4)
--   campaign_issues                  — ОТСУТСТВУЕТ  ← вся эта правка
-- Секция B не приземлилась. Почему — неизвестно; файл не менялся с 16.07 13:06,
-- так что применялась, вероятно, отредактированная версия. Причину не реконструирую,
-- фиксирую факт.
--
-- Это ровно секция B wave1, скопированная дословно (строки 72–94 + RLS/grants 100–111),
-- вся под if-not-exists / if-not-exists-index, поэтому повторный прогон wave1 целиком
-- останется идемпотентным. Политики — под guard, т.к. на campaigns они уже висят.
--
-- READ-BACK ПОСЛЕ ПРИМЕНЕНИЯ (ожидаемо):
--   select count(*) from menumaker.campaign_issues;                     → 0
--   select count(*) from pg_policies where schemaname='menumaker'
--     and tablename='campaign_issues';                                  → 2
--   select relrowsecurity from pg_class where relname='campaign_issues'; → t

begin;

create table if not exists menumaker.campaign_issues (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null,
  campaign_id uuid not null references menumaker.campaigns(id) on delete cascade,
  center_id   uuid not null,
  child_id    uuid,                        -- → roster(id); null = адресат без матча
  guardian_id uuid,
  form_key    text not null,
  issued_at   timestamptz not null default now(),
  issued_by   uuid,
  channel     text check (channel in ('link','qr','email','paper')),
  -- Едет в prefill-ссылке и возвращается в сабмите — так «заполнено» смыкается
  -- с «отправлено» БЕЗ гадания.
  issue_token uuid not null default gen_random_uuid(),
  revoked_at  timestamptz
);

create unique index if not exists campaign_issues_unique_live
  on menumaker.campaign_issues (campaign_id, child_id, form_key)
  where revoked_at is null and child_id is not null;
create unique index if not exists campaign_issues_token_idx on menumaker.campaign_issues (issue_token);
create index if not exists campaign_issues_center_idx on menumaker.campaign_issues (center_id, campaign_id);

alter table menumaker.campaign_issues enable row level security;

-- ⚠️ deny_teacher НЕ вешаем: политика RESTRICTIVE и ALL-deny;
--    см. docs/specs/identity-teacher-spec.md §0.2.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='menumaker'
                   and tablename='campaign_issues' and policyname='auth_manage') then
    create policy auth_manage on menumaker.campaign_issues
      for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='menumaker'
                   and tablename='campaign_issues' and policyname='org_isolation') then
    create policy org_isolation on menumaker.campaign_issues as restrictive for all to authenticated
      using (core.is_org_member(org_id)) with check (core.is_org_member(org_id));
  end if;
end $$;

grant select, insert, update, delete on menumaker.campaign_issues to authenticated;

commit;
