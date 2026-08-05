-- ЕЖЕНЕДЕЛЬНЫЙ ПЕРЕСЕВ ПРОГНОЗА — след, пропуск и живой отчёт.
-- Три решения владельца 05.08, каждое реализовано ниже буквально:
--   (а) окно, в котором у центра меньше 8 дней с данными, — центр ПРОПУСКАЕТСЯ,
--       и пропуск пишется в лог: «ноль в прогнозе хуже, чем вчерашнее число»;
--   (б) после каждого прогона — строка в `internal_messages` владельцу и Татьяне;
--   (в) ручных правок прогноза не бывает — признак «закреплено» НЕ строим
--       (правило записано в DECISIONS; пересев вправе переписать любую клетку).
--
-- Механизм — `pg_cron` чистым SQL, без edge-функции и без HTTP. Прецедент в этой
-- же базе: `refresh-action-items-daily` (46 прогонов, 0 отказов). Соседние
-- HTTP-задания за то же время дали 1512 незамеченных отказов из 10 079 — у SQL
-- нет сети, которой можно упасть.

-- ─── (1) След прогона. Read-back живёт В САМОЙ СТРОКЕ ────────────────────────
-- sum_before и sum_after снимаются ВОКРУГ записи в одной транзакции. Отметка
-- «отработало» без этих двух чисел ничего не доказывает: прогон, переписавший
-- 120 клеток теми же значениями, и прогон, обнуливший центр, выглядят одинаково.
create table if not exists menumaker.attendance_pattern_runs (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references core.organizations(id),
  center_id       uuid not null references menumaker.centers(id),
  run_at          timestamptz not null default now(),
  window_start    date,
  window_end      date,
  days_with_data  integer,
  cells_written   integer,
  sum_before      integer,
  sum_after       integer,
  cells_changed   integer,
  skipped         boolean not null default false,
  skip_reason     text,
  error           text,
  ran_by          text not null check (ran_by in ('cron', 'manual'))
);

create index if not exists attendance_pattern_runs_lookup_idx
  on menumaker.attendance_pattern_runs (center_id, run_at desc);

alter table menumaker.attendance_pattern_runs enable row level security;

drop policy if exists org_isolation on menumaker.attendance_pattern_runs;
create policy org_isolation on menumaker.attendance_pattern_runs
  for select using (core.is_org_member(org_id));

drop policy if exists deny_teacher on menumaker.attendance_pattern_runs;
create policy deny_teacher on menumaker.attendance_pattern_runs
  as restrictive for all
  using (not core.has_org_role(org_id, array['teacher']))
  with check (not core.has_org_role(org_id, array['teacher']));

-- Только чтение: строки пишет пересев, человек их не заводит и не правит.
grant select on menumaker.attendance_pattern_runs to authenticated;

comment on table menumaker.attendance_pattern_runs is
  'След пересева прогноза: окно, сколько дней с данными, суммы ДО и ПОСЛЕ одной транзакцией, кто запустил. Пропуск центра — тоже строка.';

-- ─── (2) Сколько дней в окне у центра вообще есть данные ─────────────────────
-- Считаются ОБА источника — отметки платформы и довнесённые агрегаты, — потому
-- что для июня платформа пуста, а числа есть, и наоборот.
create or replace function menumaker.pattern_days_with_data(p_center_id uuid, p_as_of date)
returns integer
language sql stable
set search_path to 'menumaker', 'public', 'core'
as $function$
  with mondays as (select monday from menumaker.pattern_window_mondays(p_as_of)),
  days as (select (m.monday + i)::date as dt from mondays m, generate_series(0,4) i),
  marks as (
    select distinct (r.monday_date + x.off)::date as dt
    from menumaker.meal_week_records r
    left join menumaker.classrooms cl on cl.id = r.classroom_id
    cross join lateral (values (0),(1),(2),(3),(4)) as x(off)
    where r.center_id = p_center_id
      and r.monday_date in (select monday from mondays)
      and coalesce(cl.is_roster, true)
      and (case x.off
             when 0 then coalesce(r.mon_b,0)+coalesce(r.mon_as,0)+coalesce(r.mon_l,0)+coalesce(r.mon_su,0)
             when 1 then coalesce(r.tue_b,0)+coalesce(r.tue_as,0)+coalesce(r.tue_l,0)+coalesce(r.tue_su,0)
             when 2 then coalesce(r.wed_b,0)+coalesce(r.wed_as,0)+coalesce(r.wed_l,0)+coalesce(r.wed_su,0)
             when 3 then coalesce(r.thu_b,0)+coalesce(r.thu_as,0)+coalesce(r.thu_l,0)+coalesce(r.thu_su,0)
             else        coalesce(r.fri_b,0)+coalesce(r.fri_as,0)+coalesce(r.fri_l,0)+coalesce(r.fri_su,0)
           end) > 0
  ),
  agg as (
    select distinct a.service_date as dt
    from menumaker.attendance_daily_aggregates a
    where a.center_id = p_center_id and a.portions > 0
      and a.service_date in (select dt from days)
  )
  select count(*)::int from (
    select dt from marks where dt in (select dt from days)
    union select dt from agg
  ) q;
$function$;

-- ─── (3) Пересев всех центров + сообщение ────────────────────────────────────
create or replace function menumaker.recompute_attendance_patterns_all(
  p_as_of  date default current_date,
  p_ran_by text default 'cron'
)
returns jsonb
language plpgsql volatile
set search_path to 'menumaker', 'public', 'core'
as $function$
declare
  MIN_DAYS constant int := 8;   -- меньше — окно слишком дырявое, чтобы им учить кухню
  c            record;
  w_start      date;
  w_end        date;
  n_days       int;
  s_before     int;
  s_after      int;
  n_changed    int;
  n_written    int;
  total_changed int := 0;
  n_centers    int := 0;
  n_skipped    int := 0;
  n_failed     int := 0;
  org          uuid;
  body_text    text;
begin
  for c in select id, org_id, name from menumaker.centers where is_meal_site order by name loop
    org := c.org_id;
    select min(monday), max(monday) + 4 into w_start, w_end
      from menumaker.pattern_window_mondays(p_as_of);
    n_days := menumaker.pattern_days_with_data(c.id, p_as_of);

    -- (а) Дырявое окно — центр пропускается, вчерашний прогноз остаётся жить.
    if n_days < MIN_DAYS then
      insert into menumaker.attendance_pattern_runs
        (org_id, center_id, window_start, window_end, days_with_data, skipped, skip_reason, ran_by)
      values (c.org_id, c.id, w_start, w_end, n_days, true,
              format('only %s day(s) with data in the window — need %s; previous forecast left in place', n_days, MIN_DAYS),
              p_ran_by);
      n_skipped := n_skipped + 1;
      continue;
    end if;

    begin
      select coalesce(sum(expected_count),0) into s_before
        from menumaker.attendance_patterns where center_id = c.id;

      -- Сколько клеток РЕАЛЬНО поменяет запись — считается ДО неё.
      select count(*) into n_changed
        from menumaker.attendance_pattern_grid(c.id, p_as_of) g
        left join menumaker.attendance_patterns p
          on p.center_id = c.id and p.age_group_id = g.age_group_id
         and p.meal_type_id = g.meal_type_id and p.day_of_week = g.day_of_week
       where p.id is null or p.expected_count is distinct from g.expected_count;

      n_written := menumaker.recompute_attendance_patterns(c.id, p_as_of);

      select coalesce(sum(expected_count),0) into s_after
        from menumaker.attendance_patterns where center_id = c.id;

      insert into menumaker.attendance_pattern_runs
        (org_id, center_id, window_start, window_end, days_with_data,
         cells_written, sum_before, sum_after, cells_changed, ran_by)
      values (c.org_id, c.id, w_start, w_end, n_days,
              n_written, s_before, s_after, n_changed, p_ran_by);

      n_centers := n_centers + 1;
      total_changed := total_changed + n_changed;
    exception when others then
      -- Отказ по одному центру не должен уносить остальные и не должен молчать.
      insert into menumaker.attendance_pattern_runs
        (org_id, center_id, window_start, window_end, days_with_data, ran_by, error)
      values (c.org_id, c.id, w_start, w_end, n_days, p_ran_by, sqlerrm);
      n_failed := n_failed + 1;
    end;
  end loop;

  -- (б) Живой отчёт. Адресуется ПО user_id, а не по роли: `get_user_role()`
  -- отдаёт Татьяне 'director' (директор старше office_manager в её списке ролей),
  -- и письмо на роль ушло бы всем директорам центров мимо неё. center_id пуст —
  -- иначе `can_see_message` потребует доступа к центру, а у владельца и у Татьяны
  -- в `core.user_center_access` ноль строк, и сообщение стало бы невидимым.
  body_text := case
    when n_failed > 0 then format('Forecast reseed FAILED — details in run log (%s of %s centres failed)', n_failed, n_failed + n_centers)
    else format('Forecast reseed: %s centres, %s cells changed', n_centers, total_changed)
         || case when n_skipped > 0 then format(' · %s centre(s) skipped, too little data', n_skipped) else '' end
  end;

  if org is not null then
    insert into menumaker.internal_messages
      (org_id, center_id, sender_id, sender_name, recipient_type, recipient_value, recipient_label, body)
    select org, null, null, 'Forecast reseed', 'user', ur.user_id::text,
           coalesce(u.raw_user_meta_data->>'full_name', u.email), body_text
      from menumaker.user_roles ur
      join auth.users u on u.id = ur.user_id
     where ur.org_id = org and ur.role in ('admin', 'office_manager');
  end if;

  return jsonb_build_object(
    'as_of', p_as_of, 'ran_by', p_ran_by,
    'centres_reseeded', n_centers, 'cells_changed', total_changed,
    'skipped', n_skipped, 'failed', n_failed, 'message', body_text
  );
end;
$function$;

revoke execute on function menumaker.recompute_attendance_patterns_all(date, text) from public;
grant  execute on function menumaker.recompute_attendance_patterns_all(date, text) to service_role;

comment on function menumaker.recompute_attendance_patterns_all(date, text) is
  'Еженедельный пересев прогноза: MAX за 4 полные недели по всем is_meal_site центрам. Центр с <8 днями данных в окне пропускается. После прогона — строка в internal_messages владельцу и office_manager.';

-- ─── (4) Расписание ──────────────────────────────────────────────────────────
-- 09:20 UTC понедельника = 05:20 в Кливленде летом, 04:20 зимой. pg_cron читает
-- расписание в UTC, и час DST-скачка принят сознательно: любой способ держать
-- ровно 05:00 круглый год сложнее пользы. Главное — прогон ДО кухонного утра.
-- В понедельник окно берёт четыре недели, закрывшиеся прошлой пятницей.
select cron.schedule(
  'reseed-attendance-patterns-weekly',
  '20 9 * * 1',
  $cron$ select menumaker.recompute_attendance_patterns_all(current_date, 'cron') $cron$
);
