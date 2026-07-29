-- ============================================================================
-- ПРОВЕРКИ MAINTAINER — один файл, один прогон.
--
-- Повод (Николай, 2026-07-28): две недели мы назначали проверки агенту, которого
-- нет. Чек без исполнителя — то же, что правило, живущее только в UI: существует
-- в документе и не существует в мире. Наш собственный канон, обращённый на нас.
--
-- ЗАПУСК: перед КАЖДЫМ пушем (момент уже есть в процессе, и гигиена важнее всего
-- именно тогда) + раз в неделю независимо.
-- РЕЗУЛЬТАТ: docs/maintenance/YYYY-MM-DD.md с дельтой к прошлому разу.
--
-- Автономный cron, Action Center и таблица system_checks — Stage 2, если понадобятся.
-- ============================================================================
select * from (

-- ── 1. Демо-центр не должен оставаться meal site дольше суток ───────────────
select 1 as n, 'demo centre is a meal site' as check,
       count(*)::text as value,
       case when count(*) = 0 then 'ok' else 'RED' end as status,
       'на время съёмки так и должно быть; это таймер, а не запрет' as note
from menumaker.centers where is_demo and is_meal_site

union all
-- ── 2. RLS: кто-то ПРОПУЩЕН и НИЧТО не удерживает по арендатору ─────────────
-- Признак уточнён на первом же прогоне: «ноль restrictive» само по себе даёт
-- ложную тревогу — у справочников (ставки, типы, возрастные группы) арендатора
-- нет вовсе, и удерживать там нечего. Настоящий признак — тройной:
--   таблица НЕСЁТ org_id/center_id · есть permissive (кого-то пропускают) ·
--   restrictive НЕТ (по арендатору не удерживает никто).
select 2, 'tenant tables admitted by permissive with NOTHING restrictive',
       count(*)::text,
       case when count(*) = 0 then 'ok' else 'RED' end,
       'список — в отчёте дня; это обзор для разбора, а не список утечек'
from (
  select c.oid
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname='menumaker' and c.relkind='r' and c.relrowsecurity
    and exists (select 1 from information_schema.columns col where col.table_schema='menumaker'
                 and col.table_name=c.relname and col.column_name in ('org_id','center_id'))
    and exists (select 1 from pg_policy p where p.polrelid=c.oid and p.polpermissive)
    and not exists (select 1 from pg_policy p where p.polrelid=c.oid and not p.polpermissive)
) t

union all
-- ── 3. Правка отметки в уже одобренной ЗАВЕРШЁННОЙ неделе ───────────────────
-- Замораживание недели сознательно НЕ построено (DECISIONS, основание — ноль
-- случаев из 41). Это детектор вместо правила.
select 3, 'meal edited after the director signature (completed week)',
       count(*)::text,
       case when count(*) = 0 then 'ok' else 'RED' end,
       'пусто = правило не нужно; непусто = решаем по факту'
from menumaker.meal_week_records w
where w.status = 'director_approved' and w.director_signed_at is not null
  and w.director_signed_at::date > (w.monday_date + 4)
  and w.updated_at > w.director_signed_at

union all
-- ── 4. ОКНА, ЗАКРЫВАЮЩИЕСЯ САМИ ────────────────────────────────────────────
-- Пока таблица пуста, изменение схемы бесплатно. Переход с нуля на ненулевое =
-- «окно закрылось, изменение схемы больше не бесплатно».
select 4, 'window: child-facing public forms (center_id backfill)',
       (select (count(*) from menumaker.special_diet_forms)
             + (select count(*) from menumaker.milk_substitutions)
             + (select count(*) from menumaker.infant_meal_preferences))::text,
       case when (select (count(*) from menumaker.special_diet_forms)
                      + (select count(*) from menumaker.milk_substitutions)
                      + (select count(*) from menumaker.infant_meal_preferences)) = 0
            then 'ok' else 'RED: окно закрылось' end,
       'ноль = схему ещё можно менять без бэкфилла'

union all
select 5, 'window: typed edge (prior_submission_id / relation)',
       count(*) filter (where prior_submission_id is not null)::text,
       case when count(*) filter (where prior_submission_id is not null) = 0 then 'ok' else 'RED: окно закрылось' end,
       'ноль = ребро ещё можно переименовать одной миграцией'
from menumaker.enrollment_submissions

union all
-- ── 5. ТЕЧЬ КЛЮЧА РЕБЁНКА ──────────────────────────────────────────────────
select 6, 'roster rows created without child_id (LEAK)',
       (select count(*) from menumaker.roster
         where child_id is null and created_at >= current_date - 7)::text,
       case when (select count(*) from menumaker.roster
                   where child_id is null and created_at >= current_date - 7) = 0
            then 'ok' else 'RED: течь идёт' end,
       'за 7 дней; пока течь идёт, всё остальное строится на песке'

union all
select 7, 'roster rows without child_id (accumulated)',
       (select count(*)::text from menumaker.roster where child_id is null),
       'info', 'бэкфилл — ПОСЛЕ остановки течи'

union all
-- ── 6. КОЛОНКА БЕЗ ФОРМЫ / ПОЛЕ БЕЗ ПОТРЕБИТЕЛЯ ────────────────────────────
select 8, 'form_version still NULL (the wire)',
       (select count(*) filter (where form_version is null)::text || ' of '
             || count(*)::text from menumaker.enrollment_submissions),
       'info', 'растёт = провод не эмитит; падает = эмитит'

union all
select 9, 'record_origin still NULL',
       (select count(*) filter (where record_origin is null)::text || ' of '
             || count(*)::text from menumaker.enrollment_submissions),
       'info', 'старые записи останутся NULL навсегда — бэкфилл невозможен'

union all
-- ── 7. ОЧЕРЕДИ, ВЫВОДИМЫЕ ИЗ ЖУРНАЛА ───────────────────────────────────────
select 10, 'open questions: person name mismatch',
       (select count(*)::text from menumaker.v_person_name_questions),
       'info', 'два выхода: переименовать или отклонить'

union all
select 11, 'open questions: person needs director identity call',
       (select count(*)::text from menumaker.v_person_link_questions),
       'info', 'два выхода: связать с кандидатом или завести нового'

union all
-- ── 8. КРАСНОЕ, КОТОРОЕ НЕЛЬЗЯ СНЯТЬ ───────────────────────────────────────
select 12, 'children whose Family badge cannot be cleared (no child key)',
       (select count(*)::text from menumaker.roster
         where coalesce(is_active,true) and child_id is null),
       'info', 'три единицы бейджа на каждого, снять нечем до key-backfill'

) checks order by n;
