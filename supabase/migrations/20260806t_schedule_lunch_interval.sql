-- 20260806t — обед двумя временами вместо «минут» (Work Schedule v2, 06.08)
--
-- ПОВОД: расписания заполнены у 10 сотрудников из 73, причина названа владельцем —
-- заполнять долго. Заодно чинится смысл: «BREAK 60 min» не говорит, КОГДА учителя
-- нет в группе, а линия «требуется взрослых» в будущих сетках спрашивает именно это.
--
-- ДОРОГА (A), выбор владельца: 50 существующих строк (10 недель, у всех break_minutes=60)
-- остаются ВАЛИДНЫМИ до первой правки. break_minutes НЕ удаляется; строка без времени
-- обеда считает Hours по-старому и честно подписана «60 min — no time set yet».
-- Времена обеда не выдумываются никем и никогда: (C) отвергнута как выдуманный факт.
alter table menumaker.staff_schedules
  add column if not exists break_start time,
  add column if not exists break_end   time;

comment on column menumaker.staff_schedules.break_start is
  'Начало обеда. NULL вместе с break_end = время ещё не задано (legacy-строка считает по break_minutes).';
comment on column menumaker.staff_schedules.break_end is
  'Конец обеда. Пара с break_start: либо оба заданы, либо оба пусты.';

alter table menumaker.staff_schedules
  drop constraint if exists staff_schedules_break_inside_shift;
alter table menumaker.staff_schedules
  add constraint staff_schedules_break_inside_shift check (
    (break_start is null and break_end is null)
    or (break_start is not null and break_end is not null
        and break_start >= shift_start and break_end <= shift_end
        and break_start < break_end)
  );

-- Урок 20260806r: новая колонка без гранта роняет ВЕСЬ запрос, а не теряет поле.
do $$
begin
  if exists (select 1 from information_schema.column_privileges
              where table_schema='menumaker' and table_name='staff_schedules'
                and grantee='authenticated' and privilege_type='SELECT') then
    execute 'grant select (break_start, break_end), update (break_start, break_end), insert (break_start, break_end) on menumaker.staff_schedules to authenticated';
  end if;
end $$;
