-- 20260716c_roster_schedule.sql — плановое расписание посещения в ростере
--
-- ✅ APPLIED 2026-07-16 on Nikolay's go («модель — катить первой»).
--
-- Цель: у каждого активного ребёнка — плановые дни и часы. Вводятся один раз,
-- живут в ростере, печатаются в бланке (Hours), сверяются с формой питания.
--
-- ДНИ — БИТОВАЯ МАСКА Mon–Fri (заказ: «дни-маска»).
--   Mon=1 · Tue=2 · Wed=4 · Thu=8 · Fri=16 · вся неделя = 31.
--   Легаси деления по дням НЕ ИМЕЛО (подтверждено владельцем), поэтому импорт
--   проставляет 31 — это не догадка про ребёнка, а перенос того, что было.
--   Маска, а не пять boolean: бланк и сетка спрашивают «работает ли день», а не
--   каждый день по отдельности, и добавить субботу потом = 32, без ALTER на колонку.
--
-- ЧАСЫ — time, не text. '6:30am-4:30pm' из легаси парсится ОДИН раз при импорте.
--   Хранить строку значило бы парсить её на каждой печати и на каждой сверке с
--   формой питания — а приёмы пищи считаются от часов × слоты центра.
alter table menumaker.roster
  add column if not exists sched_days       smallint,
  add column if not exists sched_in         time,
  add column if not exists sched_out        time,
  add column if not exists sched_source     text,
  add column if not exists sched_updated_by uuid,
  add column if not exists sched_updated_at timestamptz;

alter table menumaker.roster drop constraint if exists roster_sched_days_check;
alter table menumaker.roster add constraint roster_sched_days_check
  check (sched_days is null or (sched_days >= 1 and sched_days <= 31));

alter table menumaker.roster drop constraint if exists roster_sched_source_check;
alter table menumaker.roster add constraint roster_sched_source_check
  check (sched_source is null or sched_source in ('import','start_form','manual'));

-- Часы либо оба заданы, либо оба пусты, и out строго позже in.
-- Ночёвок нет: это дневной центр, out<in = опечатка, а не смена через полночь.
alter table menumaker.roster drop constraint if exists roster_sched_hours_check;
alter table menumaker.roster add constraint roster_sched_hours_check
  check ((sched_in is null) = (sched_out is null)
         and (sched_in is null or sched_out > sched_in));

comment on column menumaker.roster.sched_days is
  'Планове дни посещения, битовая маска Mon=1 Tue=2 Wed=4 Thu=8 Fri=16 (вся неделя=31). NULL = расписание не заведено.';
comment on column menumaker.roster.sched_source is
  'import = разовый перенос из легаси-книг владельца · start_form = нормализовано при Approve стартовой формы · manual = правка директора.';
comment on column menumaker.roster.sched_updated_at is
  'Каждая правка датируется. Напечатанные бланки прошлых недель НЕ переписываются: печать всегда идёт от расписания на момент генерации.';

-- Печать бланка и сверка с формой питания читают только заведённые расписания.
create index if not exists roster_sched_idx on menumaker.roster (center_id, classroom_id)
  where sched_days is not null;

-- ── READ-BACK (выполнен, результат ниже) ────────────────────────────────────
--   select column_name, data_type from information_schema.columns
--    where table_schema='menumaker' and table_name='roster' and column_name like 'sched%';
--   → sched_days smallint · sched_in time · sched_out time · sched_source text
--     · sched_updated_by uuid · sched_updated_at timestamptz          ✅ 6/6
--   Все существующие 621 строка ростера: sched_days is null (расписание не заведено).
--   Ни одна колонка не перезаписана — только добавлены.
--
-- ── ROLLBACK ────────────────────────────────────────────────────────────────
--   alter table menumaker.roster
--     drop column if exists sched_days, drop column if exists sched_in,
--     drop column if exists sched_out,  drop column if exists sched_source,
--     drop column if exists sched_updated_by, drop column if exists sched_updated_at;
