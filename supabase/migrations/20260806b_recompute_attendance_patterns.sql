-- ПЕРЕСЕВ ПАТТЕРНОВ ПОСЕЩАЕМОСТИ — формула владельца: МАКСИМУМ за 4 полные недели.
-- Показано владельцу 05.08, применено по слову GO к проекту menumaker
-- (trrmyqfpxntmgxnqkikp) 2026-08-05. ФУНКЦИЯ СОЗДАНА, ПЕРЕСЕВ НЕ ЗАПУСКАЛСЯ:
-- порядок жёсткий — сначала довнесение июньской дельты в
-- `attendance_daily_aggregates`, только потом пересев. Запуск сегодня закрепил бы
-- дыры Ridge (6 пустых дней июня) и Highland (4) как норму.
--
-- ОТКУДА ОКНО. Формулу в закрытом листе прочитать нельзя, но читается лист-источник,
-- на котором она стоит: `copyLast4WeeksData_` в Office.gs отбирает строки по
-- `дата понедельника >= сегодня − 28`. Это 4 скользящие недели. Здесь окно взято
-- как «последние 4 ПОЛНЫЕ недели» вместо «сегодня − 28» намеренно: у листа при
-- запуске в понедельник условие `>=` захватывает пятый понедельник, и результат
-- зависит от дня запуска. Если в самой ячейке MAXIFS найдётся более узкий критерий —
-- правится ЗДЕСЬ, одной новой миграцией.

-- (1) Возрастная группа на дату приёма пищи. Именно на дату, а не на сегодня:
-- `v_child_age_profile` считает возраст от CURRENT_DATE и для прошлых месяцев
-- отвечает возрастом на сегодня — для пересева она непригодна.
-- 1y+2y слиты в `1_2` — ось таблицы владельца, утверждена словом 05.08.
create or replace function menumaker.cacfp_age_slug(p_birthday date, p_on date)
returns text
language sql stable
as $function$
  select case
    when p_birthday is null or p_on is null then 'undetermined'
    when (extract(year from age(p_on, p_birthday)) * 12
        + extract(month from age(p_on, p_birthday))) <  6 then 'birth_5mo'
    when (extract(year from age(p_on, p_birthday)) * 12
        + extract(month from age(p_on, p_birthday))) < 12 then '6_11mo'
    when (extract(year from age(p_on, p_birthday)) * 12
        + extract(month from age(p_on, p_birthday))) < 36 then '1_2'
    when (extract(year from age(p_on, p_birthday)) * 12
        + extract(month from age(p_on, p_birthday))) < 72 then '3_5'
    else '6_12'
  end;
$function$;

-- (2) Окно: понедельники последних 4 ПОЛНЫХ недель относительно p_as_of.
-- Неделя полная, когда её пятница уже прошла.
create or replace function menumaker.pattern_window_mondays(p_as_of date)
returns table(monday date)
language sql stable
as $function$
  with last_full as (
    select case
             when date_trunc('week', p_as_of)::date + 4 < p_as_of
             then date_trunc('week', p_as_of)::date
             else date_trunc('week', p_as_of)::date - 7
           end as m
  )
  select (lf.m - i * 7)::date from last_full lf, generate_series(0, 3) i;
$function$;

-- (3) Сетка паттерна — ЧТЕНИЕ. Ничего не пишет, поэтому её можно звать до пересева
-- и смотреть, что пересев положит.
--
-- Дневная клетка = greatest(отметки платформы, довнесённый агрегат). Не сумма:
-- сумма удвоила бы день, который есть и там, и там. Не «агрегат вместо отметок»:
-- тогда потерялись бы дни, которых в старой таблице нет. Максимум не теряет и не
-- удваивает — та же логика, что и у формулы владельца этажом выше.
--
-- Комнаты персонала (`is_roster = false`) не входят: это не дети.
-- Сетка полная (5 дней × приёмы × все группы, включая «не определён») — ноль
-- пишется явно, чтобы «нет данных» и «ноль порций» не путались молчанием.
create or replace function menumaker.attendance_pattern_grid(
  p_center_id uuid,
  p_as_of     date default current_date
)
returns table(
  day_of_week    integer,
  meal_type_id   uuid,
  meal_slug      text,
  age_group_id   uuid,
  age_group_slug text,
  expected_count integer,
  sample_days    integer,
  window_start   date,
  window_end     date
)
language sql stable
set search_path to 'menumaker', 'public', 'core'
as $function$
  with mondays as (
    select monday from menumaker.pattern_window_mondays(p_as_of)
  ),
  days as (
    select (m.monday + i)::date as dt, (i + 1)::int as dow
    from mondays m, generate_series(0, 4) i
  ),
  bounds as (select min(dt) as w_start, max(dt) as w_end from days),
  marks_raw as (
    select (r.monday_date + x.off)::date as dt,
           s.slug as meal_slug,
           menumaker.cacfp_age_slug(ro.birthday, (r.monday_date + x.off)::date) as ag_slug,
           coalesce(s.v, 0) as v
    from menumaker.meal_week_records r
    left join menumaker.classrooms cl on cl.id = r.classroom_id
    left join menumaker.roster     ro on ro.id = r.roster_id
    cross join lateral (values (0), (1), (2), (3), (4)) as x(off)
    cross join lateral (values
      ('breakfast', case x.off when 0 then r.mon_b  when 1 then r.tue_b  when 2 then r.wed_b  when 3 then r.thu_b  else r.fri_b  end),
      ('am_snack',  case x.off when 0 then r.mon_as when 1 then r.tue_as when 2 then r.wed_as when 3 then r.thu_as else r.fri_as end),
      ('lunch',     case x.off when 0 then r.mon_l  when 1 then r.tue_l  when 2 then r.wed_l  when 3 then r.thu_l  else r.fri_l  end),
      ('supper',    case x.off when 0 then r.mon_su when 1 then r.tue_su when 2 then r.wed_su when 3 then r.thu_su else r.fri_su end)
    ) as s(slug, v)
    where r.center_id = p_center_id
      and r.monday_date in (select monday from mondays)
      and coalesce(cl.is_roster, true) = true
  ),
  platform as (
    select dt, meal_slug, ag_slug, sum(v)::int as n
    from marks_raw group by 1, 2, 3
  ),
  agg as (
    select a.service_date as dt, mt.slug as meal_slug, ag.slug as ag_slug,
           max(a.portions)::int as n
    from menumaker.attendance_daily_aggregates a
    join menumaker.meal_types mt on mt.id = a.meal_type_id
    join menumaker.age_groups ag on ag.id = a.age_group_id
    where a.center_id = p_center_id
      and a.service_date in (select dt from days)
    group by 1, 2, 3
  ),
  cells as (
    select d.dow, mt.id as mt_id, mt.slug as ms, ag.id as ag_id, ag.slug as ags, d.dt,
           greatest(coalesce(p.n, 0), coalesce(a.n, 0)) as n
    from days d
    cross join menumaker.meal_types mt
    cross join menumaker.age_groups ag
    left join platform p on p.dt = d.dt and p.meal_slug = mt.slug and p.ag_slug = ag.slug
    left join agg      a on a.dt = d.dt and a.meal_slug = mt.slug and a.ag_slug = ag.slug
  )
  select c.dow, c.mt_id, c.ms, c.ag_id, c.ags,
         max(c.n)::int,
         count(distinct c.dt) filter (where c.n > 0)::int,
         b.w_start, b.w_end
  from cells c, bounds b
  group by c.dow, c.mt_id, c.ms, c.ag_id, c.ags, b.w_start, b.w_end;
$function$;

-- (4) Происхождение числа в паттерне должно быть читаемо, поэтому источник
-- называется своим именем, а не прячется под 'agent'.
alter table menumaker.attendance_patterns drop constraint if exists attendance_patterns_source_check;
alter table menumaker.attendance_patterns add  constraint attendance_patterns_source_check
  check (source = any (array['manual'::text, 'mealcount_sync'::text, 'agent'::text, 'recomputed_max_4w'::text]));

-- (5) Пересев — ЗАПИСЬ. Вызывается словом, не по расписанию и не из экрана.
-- Возвращает число записанных клеток.
create or replace function menumaker.recompute_attendance_patterns(
  p_center_id uuid,
  p_as_of     date default current_date
)
returns integer
language plpgsql volatile
set search_path to 'menumaker', 'public', 'core'
as $function$
declare
  n int;
begin
  insert into menumaker.attendance_patterns
    (org_id, center_id, age_group_id, meal_type_id, day_of_week,
     expected_count, source, notes, updated_at)
  select c.org_id, p_center_id, g.age_group_id, g.meal_type_id, g.day_of_week,
         g.expected_count, 'recomputed_max_4w',
         format('MAX за 4 полные недели %s..%s; дней с данными в клетке: %s; возраст на дату приёма',
                g.window_start, g.window_end, g.sample_days),
         now()
  from menumaker.attendance_pattern_grid(p_center_id, p_as_of) g
  join menumaker.centers c on c.id = p_center_id
  on conflict (center_id, age_group_id, meal_type_id, day_of_week)
  do update set expected_count = excluded.expected_count,
                source         = excluded.source,
                notes          = excluded.notes,
                updated_at     = now();
  get diagnostics n = row_count;
  return n;
end;
$function$;

-- Смотреть сетку может директор; пересев — только осознанный вызов служебной ролью.
revoke execute on function menumaker.recompute_attendance_patterns(uuid, date) from public;
grant  execute on function menumaker.recompute_attendance_patterns(uuid, date) to service_role;
grant  execute on function menumaker.attendance_pattern_grid(uuid, date)       to authenticated;
grant  execute on function menumaker.pattern_window_mondays(date)              to authenticated;
grant  execute on function menumaker.cacfp_age_slug(date, date)                to authenticated;

comment on function menumaker.recompute_attendance_patterns(uuid, date) is
  'Пересев attendance_patterns: MAX порций по (день недели, приём, возрастная группа) за 4 полные недели. ЗАПУСКАТЬ ТОЛЬКО ПОСЛЕ довнесения дельты — иначе дыры в отметках закрепляются как норма.';
