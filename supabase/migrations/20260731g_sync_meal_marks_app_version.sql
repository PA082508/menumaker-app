CREATE OR REPLACE FUNCTION menumaker.sync_meal_marks(_marks jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'menumaker', 'public'
AS $function$
declare
  m jsonb;
  _col text;
  _allowed_cols constant text[] := array[
    'mon_b','mon_as','mon_l','mon_ps','mon_su','mon_es',
    'tue_b','tue_as','tue_l','tue_ps','tue_su','tue_es',
    'wed_b','wed_as','wed_l','wed_ps','wed_su','wed_es',
    'thu_b','thu_as','thu_l','thu_ps','thu_su','thu_es',
    'fri_b','fri_as','fri_l','fri_ps','fri_su','fri_es'
  ];
begin
  for m in select * from jsonb_array_elements(_marks)
  loop
    _col := m->>'col';
    if _col is null or not (_col = any(_allowed_cols)) then
      raise exception 'sync_meal_marks: invalid column %', _col;
    end if;

    execute format(
      'insert into menumaker.meal_week_records
         (center_id, classroom, classroom_id, roster_id, child_name, monday_date, %1$I, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7, now())
       on conflict (classroom_id, child_name, monday_date)
       do update set %1$I = excluded.%1$I, updated_at = now()',
      _col
    )
    using
      (m->>'center_id')::uuid,
      m->>'classroom',
      (m->>'classroom_id')::uuid,
      nullif(m->>'roster_id','')::uuid,
      m->>'child_name',
      (m->>'monday_date')::date,
      (m->>'value')::smallint;

    -- (b) Точка обслуживания. 20260731g: добавлена app_version — отметка без неё
    --     означает клиента старее 31.07, и это ПРЯМОЙ признак отставшей сборки.
    insert into menumaker.meal_count_marks
      (id, center_id, classroom_id, roster_id, child_name, monday_date,
       day, slot, col, value, marked_at, source, device_id, app_version)
    values
      ((m->>'id')::uuid, (m->>'center_id')::uuid, (m->>'classroom_id')::uuid,
       nullif(m->>'roster_id','')::uuid, m->>'child_name', (m->>'monday_date')::date,
       m->>'day', m->>'slot', _col, (m->>'value')::smallint,
       (m->>'marked_at')::timestamptz, coalesce(m->>'source','app_offline'),
       m->>'device_id', m->>'app_version')
    on conflict (id) do nothing;
  end loop;
end;
$function$;
