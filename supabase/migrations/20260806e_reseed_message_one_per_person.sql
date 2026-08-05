-- ОДНО СООБЩЕНИЕ НА ЧЕЛОВЕКА, А НЕ НА СТРОКУ РОЛИ.
-- Первый прогон 05.08 разослал ТРИ письма на двоих: у владельца в
-- `menumaker.user_roles` две одинаковые строки (user + role + org совпадают
-- полностью). Дубль в справочнике ролей — не повод дублировать почту, и чинить
-- его правкой данных внутри этой миграции нельзя: слова на чистку не было.
-- Функция обязана быть невосприимчива к дублям сама.
create or replace function menumaker.recompute_attendance_patterns_all(
  p_as_of  date default current_date,
  p_ran_by text default 'cron'
)
returns jsonb
language plpgsql volatile
set search_path to 'menumaker', 'public', 'core'
as $function$
declare
  MIN_DAYS constant int := 8;
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
      insert into menumaker.attendance_pattern_runs
        (org_id, center_id, window_start, window_end, days_with_data, ran_by, error)
      values (c.org_id, c.id, w_start, w_end, n_days, p_ran_by, sqlerrm);
      n_failed := n_failed + 1;
    end;
  end loop;

  body_text := case
    when n_failed > 0 then format('Forecast reseed FAILED — details in run log (%s of %s centres failed)', n_failed, n_failed + n_centers)
    else format('Forecast reseed: %s centres, %s cells changed', n_centers, total_changed)
         || case when n_skipped > 0 then format(' · %s centre(s) skipped, too little data', n_skipped) else '' end
  end;

  if org is not null then
    insert into menumaker.internal_messages
      (org_id, center_id, sender_id, sender_name, recipient_type, recipient_value, recipient_label, body)
    select org, null, null, 'Forecast reseed', 'user', r.user_id::text,
           coalesce(u.raw_user_meta_data->>'full_name', u.email), body_text
      from (
        select distinct ur.user_id           -- <- дубль строки роли больше не удваивает письмо
          from menumaker.user_roles ur
         where ur.org_id = org and ur.role in ('admin', 'office_manager')
      ) r
      join auth.users u on u.id = r.user_id;
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
