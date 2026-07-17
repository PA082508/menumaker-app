-- 20260720_sched_source_enrollment_form.sql
-- Расписание из формы CACFP → roster.sched_*: разрешить происхождение 'enrollment_form'.
--
-- ✅ ПРИМЕНЕНА 2026-07-16 по слову Николая («Принимаю ваши условия»).
--
-- READ-BACK (фактический):
--   CHECK → in ('import','start_form','enrollment_form','manual')  ✓
--   roster                   → 621 строка (ни одна не потеряна)
--   sched_source: import 272 · manual 3 · enrollment_form 0 · null 346 — не тронуты
--
-- ПРАВИЛО РАСХОЖДЕНИЯ (Николай, 2026-07-16): «при расхождении по последней дате».
-- Реализовано в scheduleIsStale(): роняем перенос, если roster.sched_updated_at
-- ПОЗЖЕ даты формы. Проверено на живом случае — Rodriguez-Texidor Izabella:
-- её форма от 06.07 даёт 17:30, CSV от 16.07 держит 17:00 → CSV новее, остаётся.
--
-- ЗАЧЕМ
-- ─────
-- `20260716c_roster_schedule.sql` завёл CHECK:
--     sched_source in ('import','start_form','manual')
-- Форма CACFP («enroll», реестр v9) — это НЕ start_form: это отдельная форма
-- отдельного пакета. Написать 'start_form' значит соврать в колонке, которая
-- существует ровно ради происхождения данных: потом никто не отличит, откуда
-- взялись часы — из вашего CSV, из формы или из правки директора.
--
-- Без этой строки Approve на форме CACFP с чистым расписанием упадёт целиком:
-- CHECK отвергнет update, ребёнок не зачислится. То есть код ждёт миграцию,
-- а не наоборот — «вьюха ложится раньше кода, который читает колонку».
--
-- ЧТО ЭТО НЕ ДЕЛАЕТ
-- ─────────────────
-- Ничего не переписывает. CHECK только расширяется — все существующие строки
-- ему уже удовлетворяют (проверено ниже), ни одна не трогается.
--
-- ПРОГОН ДО ПРИМЕНЕНИЯ (read-only, выполнить и показать):
--   select coalesce(sched_source,'(null)') as src, count(*)
--     from menumaker.roster group by 1 order by 2 desc;
--   -- Ожидание: только 'import' / null. Если появилось что-то ещё —
--   -- ОСТАНОВИТЬСЯ: значит пишет кто-то, о ком мы не знаем.

begin;

alter table menumaker.roster drop constraint if exists roster_sched_source_check;
alter table menumaker.roster add constraint roster_sched_source_check
  check (sched_source is null or sched_source in ('import','start_form','enrollment_form','manual'));

comment on column menumaker.roster.sched_source is
  'Откуда взялись часы: import = CSV владельца (авторитетный, 20260716c) · '
  'enrollment_form = форма CACFP, перенесено на Approve (buildSchedulePort, только однозначное время) · '
  'start_form = стартовая форма · manual = правка директора. NULL = расписание не заведено.';

commit;

-- ── READ-BACK ПОСЛЕ ПРИМЕНЕНИЯ ──────────────────────────────────────────────
--   select pg_get_constraintdef(oid) from pg_constraint
--    where conname = 'roster_sched_source_check';
--   → ... in ('import','start_form','enrollment_form','manual')
--   select count(*) from menumaker.roster;            → 621 (ни одна не потеряна)
--
-- ── ROLLBACK ────────────────────────────────────────────────────────────────
--   Откат СУЖАЕТ CHECK — сначала убедиться, что строк 'enrollment_form' нет,
--   иначе constraint не создастся:
--     select count(*) from menumaker.roster where sched_source = 'enrollment_form';  → 0
--   alter table menumaker.roster drop constraint if exists roster_sched_source_check;
--   alter table menumaker.roster add constraint roster_sched_source_check
--     check (sched_source is null or sched_source in ('import','start_form','manual'));
