-- 20260726b_safepass_center_local_day.sql — «сегодня» = ЛОКАЛЬНЫЙ ДЕНЬ ЦЕНТРА, не UTC-полночь
--
-- КАНОН (Николай, 2026-07-26): «сегодня» на обеих сторонах SafePass = локальный день ЦЕНТРА.
--   Тот же класс бага, что дата рождения: момент времени, прогнанный через чужую таймзону,
--   уезжает на сутки.
--
-- ── ЧТО ИЗМЕРЕНО (read-only, 2026-07-26):
--   safepass_parent_sessions отбирал записи `s.created_at >= date_trunc('day', now())`.
--   PostgREST-сессия работает в UTC ⇒ граница = 2026-07-26 00:00+00 = 20:00 EDT 25-го.
--   Для родителя «сегодня» начиналось накануне в 20:00 и заканчивалось в 20:00: вечерний
--   забор после 20:00 EDT уезжал в «завтра» и ПРОПАДАЛ из Today's record, тогда как
--   учительский экран (startOfTodayISO(), локальная полночь) его показывал. Одно событие,
--   две разные даты — ровно та развилка, которую канон закрывает.
--
-- ── РЕШЕНИЕ:
--   (1) menumaker.center_local_day_start(center) — ОДИН шов для таймзоны. У menumaker.centers
--       колонки timezone нет (проверено: 23 колонки, ни одной про tz), поэтому источник —
--       app_settings.key='timezone' на орг (эффективно-датируемый ключ, как остальные), а при
--       его отсутствии — 'America/New_York'. Когда центр появится вне Огайо, меняется ОДНА
--       функция (или заводится колонка), а не каждый вызов.
--   (2) safepass_parent_sessions переведён на эту границу. Центр берётся из той самой строки
--       trusted_persons, которой мы и авторизуем звонок — второго источника не заводим.
--
-- forward-only: 20260719b/20260724a не редактируются.

begin;

create or replace function menumaker.center_local_day_start(p_center uuid)
returns timestamptz language sql stable security definer
set search_path to 'menumaker','public' as $fn$
  select date_trunc('day', now() at time zone tz) at time zone tz
    from (
      select coalesce(
               (select s.value #>> '{}' from menumaker.app_settings s
                 join menumaker.centers c on c.org_id = s.org_id
                where c.id = p_center and s.key = 'timezone'
                order by s.effective_date desc nulls last limit 1),
               'America/New_York') as tz
    ) t;
$fn$;
revoke execute on function menumaker.center_local_day_start(uuid) from public;
grant  execute on function menumaker.center_local_day_start(uuid) to anon, authenticated;

create or replace function menumaker.safepass_parent_sessions(p_phone text, p_child_id text)
returns jsonb language plpgsql security definer set search_path to 'menumaker','public' as $fn$
declare v_center uuid; v_from timestamptz;
begin
  -- та же авторизация, что и была (активная строка на пару телефон+ребёнок), но заодно
  -- отдаёт центр — «сегодня» считается по ЕГО дню, а не по дню сервера.
  select tp.center_id into v_center
    from menumaker.safepass_trusted_persons tp
   where tp.phone = p_phone and tp.child_id = p_child_id and tp.is_active
   limit 1;
  if v_center is null then
    return jsonb_build_object('ok', false, 'error', 'not_authorized');
  end if;

  v_from := menumaker.center_local_day_start(v_center);

  return jsonb_build_object('ok', true, 'sessions', coalesce((
    select jsonb_agg(to_jsonb(x) order by x.person_initiated_at desc)
      from (select s.id, s.action_type, s.status, s.teacher_name,
                   s.teacher_confirmed_at, s.person_initiated_at
              from menumaker.safepass_sessions s
             where s.child_id = p_child_id
               and s.created_at >= v_from) x
  ), '[]'::jsonb));
end $fn$;
revoke execute on function menumaker.safepass_parent_sessions(text,text) from public;
grant  execute on function menumaker.safepass_parent_sessions(text,text) to anon, authenticated;

commit;

-- READ-BACK (выполняется сразу после apply):
--  R1. center_local_day_start(Ridge) = локальная полночь NY, НЕ 00:00+00.
--  R2. safepass_parent_sessions по живой паре: ok=true и то же число записей за день.
--  R3. Гранты: anon+authenticated на обе (родитель анонимен).
