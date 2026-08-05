-- АГРЕГАТНЫЙ СЛОЙ ПОСЕЩАЕМОСТИ — носитель для довнесения дельты старой программы.
-- Показано владельцу 05.08 (отчёт «замер дельты июня»), применено по слову GO
-- к проекту menumaker (trrmyqfpxntmgxnqkikp) 2026-08-05.
--
-- ЗАЧЕМ ОТДЕЛЬНАЯ ТАБЛИЦА, А НЕ ГАЛОЧКИ. `meal_week_records` — носитель
-- клейм-моста, защищённого до 1 октября, и он поимённый: довнесение туда
-- переписывало бы подписанные недели задним числом. Здесь лежат ЧИСЛА, а не люди,
-- и лежат отдельно.
--
-- ЧЕГО ЭТА ТАБЛИЦА НЕ ДЕЛАЕТ: её не читает клейм. `compute_monthly_claim`
-- не изменён ни одной строкой и продолжает считать только по отметкам.
-- Единственный потребитель — пересев `attendance_patterns` (миграция 20260806b).
--
-- ВПЕРЁД-ТОЛЬКО. Ошибка в импорте исправляется НОВЫМ импортом под новым `source`
-- (например 'sheets_2026_06_r2'), а не правкой старой строки: UNIQUE держит
-- идемпотентность повторного прогона (`on conflict do nothing`), а grant
-- намеренно даёт только select+insert — ни update, ни delete.

-- (1) Возрастная ось владельца. 1y и 2y слиты в `1_2` — это ось старой таблицы,
-- утверждена словом 05.08. Шестая строка — «возраст не определён»: у части
-- ростера нет `birthday` (Pearl 44 строки июня), и растворять их по группам
-- запрещено. Она существует, чтобы такие порции были ВИДНЫ, а не молча исчезли
-- на INNER JOIN внутри get_daily_counts.
alter table menumaker.age_groups drop constraint if exists age_groups_program_check;
alter table menumaker.age_groups add  constraint age_groups_program_check
  check (program = any (array['child'::text, 'infant'::text, 'undetermined'::text]));

insert into menumaker.age_groups (program, slug, label, sort_order, min_months, max_months, source)
values ('undetermined', 'undetermined', 'Возраст не определён', 9, null, null,
        'платформа — birthday отсутствует; строка-свидетель, не группа CACFP')
on conflict (slug) do nothing;

-- (2) Носитель.
create table if not exists menumaker.attendance_daily_aggregates (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references core.organizations(id),
  center_id        uuid not null references menumaker.centers(id),
  service_date     date not null,
  meal_type_id     uuid not null references menumaker.meal_types(id),
  age_group_id     uuid not null references menumaker.age_groups(id),
  portions         integer not null check (portions >= 0),
  source           text not null check (source ~ '^[a-z0-9_]+$'),
  note             text,
  imported_by      uuid references auth.users(id),
  imported_by_name text,
  imported_at      timestamptz not null default now(),
  unique (center_id, service_date, meal_type_id, age_group_id, source)
);

create index if not exists attendance_daily_aggregates_lookup_idx
  on menumaker.attendance_daily_aggregates (center_id, service_date);

alter table menumaker.attendance_daily_aggregates enable row level security;

drop policy if exists org_isolation on menumaker.attendance_daily_aggregates;
create policy org_isolation on menumaker.attendance_daily_aggregates
  for all using (core.is_org_member(org_id)) with check (core.is_org_member(org_id));

drop policy if exists deny_teacher on menumaker.attendance_daily_aggregates;
create policy deny_teacher on menumaker.attendance_daily_aggregates
  as restrictive for all
  using (not core.has_org_role(org_id, array['teacher']))
  with check (not core.has_org_role(org_id, array['teacher']));

grant select, insert on menumaker.attendance_daily_aggregates to authenticated;

comment on table menumaker.attendance_daily_aggregates is
  'Порции за день по (центр, дата, приём, возрастная группа). Довнесение чисел из старой таблицы Sheets и любой другой внешний агрегат. Клейм эту таблицу НЕ читает.';
comment on column menumaker.attendance_daily_aggregates.source is
  'Откуда пришло число: sheets_2026_06, sheets_2026_06_r2 и т.д. Различимость источника — обязательна: видно, что откуда пришло, навсегда.';
comment on column menumaker.attendance_daily_aggregates.portions is
  'Число порций за день. НЕ число детей: ребёнок с завтраком и обедом даёт две порции в разных строках.';
