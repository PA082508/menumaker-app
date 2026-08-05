-- get_daily_counts БЕЗ ЗАКРЕПЛЁННОГО search_path ОТВЕЧАЛ ТИХОЙ ПУСТОТОЙ.
-- Применено по слову GO 2026-08-05.
--
-- Замер до правки: `search_path = menumaker, public` → 20 строк;
-- `search_path = public, menumaker` → 0 строк И НИ ОДНОЙ ОШИБКИ.
-- Причина: имена таблиц стояли без схемы, а `public.age_groups` и `public.centers` —
-- ДРУГИЕ таблицы с другими UUID (сверено: ни один id не совпадает). Соединение
-- не находило ничего, и функция уверенно отвечала «нет данных».
--
-- Тихая пустота — ложь: по ней чинят данные, которых не ломали. Поэтому обе защиты
-- сразу: search_path закреплён у функции И каждое имя написано со схемой.
create or replace function menumaker.get_daily_counts(p_center_slug text, p_day integer)
returns table(meal_type text, age_group text, expected integer, program text)
language plpgsql
stable
set search_path to 'menumaker', 'public'
as $function$
BEGIN
  RETURN QUERY
  SELECT
    mt.slug,
    ag.slug,
    ap.expected_count,
    ag.program
  FROM menumaker.attendance_patterns ap
  JOIN menumaker.centers     c  ON c.id  = ap.center_id
  JOIN menumaker.age_groups  ag ON ag.id = ap.age_group_id
  JOIN menumaker.meal_types  mt ON mt.id = ap.meal_type_id
  WHERE c.slug         = p_center_slug
    AND ap.day_of_week = p_day
  ORDER BY mt.sort_order, ag.sort_order;
END;
$function$;
