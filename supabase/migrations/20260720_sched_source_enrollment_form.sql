-- 20260720_sched_source_enrollment_form.sql
-- Расписание из формы CACFP → roster.sched_*: разрешить происхождение 'enrollment_form'.
--
-- ⏸ ПОДГОТОВЛЕНА, НЕ ПРИМЕНЕНА. Ждёт слова Николая (протокол живой БД).
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
