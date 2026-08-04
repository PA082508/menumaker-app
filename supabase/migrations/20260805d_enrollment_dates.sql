-- ============================================================================
-- ДАТЫ ЗАЧИСЛЕНИЯ И УХОДА (заход F).
-- Показано владельцу 04.08, применено по слову GO тремя шагами:
--   20260805d_enrollment_dates_carrier — флаг, тексты, две функции подсчёта
--   20260805d_enrollment_dates_fn      — функция с p_confirm_override
--   20260805e_drop_old_...             — снятие ПЕРЕГРУЗКИ (см. ниже)
--
-- ⚠️ ЛОВУШКА, ПОЙМАННАЯ СМОУКОМ: `create or replace` с НОВЫМ параметром создаёт
-- ВТОРУЮ функцию, а не заменяет прежнюю. Две сигнатуры рядом сделали вызов с 11
-- аргументами неоднозначным, и половина смоука отбилась на «function is not
-- unique». Старая сигнатура снята отдельной миграцией; осталась одна функция.
--
-- ЗАМЕР 04.08, на котором всё построено:
--   · compute_monthly_claim НЕ ЧИТАЕТ ни date_in, ни date_out — заявку считают
--     ОТМЕТКИ. Значит прямого влияния на сумму у этих дат нет;
--   · опасность обратная и живая: отметка ПОСЛЕ ухода. Ребёнок ушёл 10-го,
--     отметили 15-го — заявка возьмёт отметку, потому что про дату ухода не
--     спрашивает. На проверке это вопрос «как вы кормили ребёнка, который у вас
--     не числился», и ответить нечем;
--   · 624 строки ростера, у 460 date_in пуст; date_out стоит у 23, активных с
--     датой ухода — ноль (пара сегодня согласована).
-- ============================================================================

-- ─── 1. Носитель: обязательная причина для поля БЕЗ лестницы выгоды ──────────
-- Заход D добавил needs_reason_text, но спрашивается он только у полей с
-- benefit_ladder. Датам лестница не нужна, а причина нужна — отсюда отдельный
-- флаг. Разделены нарочно: «есть направление» и «нужна причина» — разные
-- свойства, и слепить их значит однажды потребовать причину там, где её нет.
alter table menumaker.child_field_locks
  add column if not exists needs_reason boolean not null default false;

comment on column menumaker.child_field_locks.needs_reason is
  'Требовать причину при записи со слов у поля без лестницы выгоды.';

-- ─── 2. Обе даты — из документного замка в marked ───────────────────────────
-- Уход ребёнка — операционный факт («мама сказала, что забирает»), и
-- «withdrawal notice» почти никогда не существует. Тот же капкан, что был у
-- перевода класса: требование бумаги, которой не бывает, даёт не строгость, а
-- обход мимо системы.
update menumaker.child_field_locks
   set lock_level = 'marked',
       needs_document_text = null,
       needs_reason = true,
       needs_reason_text =
         'Say in your own words why this date changed — for example: the family gave notice, '
         'or the start date on the enrollment form was read wrong. It is written to the change '
         'history and it is the only record of why.'
 where field_key in ('date_in', 'date_out');

-- ─── 3. Последний день, за который у ребёнка есть отметка ────────────────────
-- Считается ТАМ ЖЕ, где живут отметки, и по тем же колонкам, что кормят заявку.
-- Второй счётчик рядом однажды разойдётся с первым (spec meal count §8 п.9).
create or replace function menumaker.last_mark_day(p_roster uuid)
returns date language sql stable
set search_path to 'menumaker','public'
as $function$
  select max(t.d)
    from menumaker.meal_week_records w,
    lateral (values
      (w.monday_date,    coalesce(w.mon_b,0)+coalesce(w.mon_as,0)+coalesce(w.mon_l,0)+coalesce(w.mon_ps,0)+coalesce(w.mon_su,0)+coalesce(w.mon_es,0)),
      (w.tuesday_date,   coalesce(w.tue_b,0)+coalesce(w.tue_as,0)+coalesce(w.tue_l,0)+coalesce(w.tue_ps,0)+coalesce(w.tue_su,0)+coalesce(w.tue_es,0)),
      (w.wednesday_date, coalesce(w.wed_b,0)+coalesce(w.wed_as,0)+coalesce(w.wed_l,0)+coalesce(w.wed_ps,0)+coalesce(w.wed_su,0)+coalesce(w.wed_es,0)),
      (w.thursday_date,  coalesce(w.thu_b,0)+coalesce(w.thu_as,0)+coalesce(w.thu_l,0)+coalesce(w.thu_ps,0)+coalesce(w.thu_su,0)+coalesce(w.thu_es,0)),
      (w.friday_date,    coalesce(w.fri_b,0)+coalesce(w.fri_as,0)+coalesce(w.fri_l,0)+coalesce(w.fri_ps,0)+coalesce(w.fri_su,0)+coalesce(w.fri_es,0))
    ) as t(d, n)
   where w.roster_id = p_roster and t.d is not null and t.n > 0;
$function$;

-- Сколько отметок останется ПОСЛЕ предполагаемой даты ухода — число для отказа.
create or replace function menumaker.marks_after(p_roster uuid, p_day date)
returns int language sql stable
set search_path to 'menumaker','public'
as $function$
  select coalesce(sum(t.n), 0)::int
    from menumaker.meal_week_records w,
    lateral (values
      (w.monday_date,    coalesce(w.mon_b,0)+coalesce(w.mon_as,0)+coalesce(w.mon_l,0)+coalesce(w.mon_ps,0)+coalesce(w.mon_su,0)+coalesce(w.mon_es,0)),
      (w.tuesday_date,   coalesce(w.tue_b,0)+coalesce(w.tue_as,0)+coalesce(w.tue_l,0)+coalesce(w.tue_ps,0)+coalesce(w.tue_su,0)+coalesce(w.tue_es,0)),
      (w.wednesday_date, coalesce(w.wed_b,0)+coalesce(w.wed_as,0)+coalesce(w.wed_l,0)+coalesce(w.wed_ps,0)+coalesce(w.wed_su,0)+coalesce(w.wed_es,0)),
      (w.thursday_date,  coalesce(w.thu_b,0)+coalesce(w.thu_as,0)+coalesce(w.thu_l,0)+coalesce(w.thu_ps,0)+coalesce(w.thu_su,0)+coalesce(w.thu_es,0)),
      (w.friday_date,    coalesce(w.fri_b,0)+coalesce(w.fri_as,0)+coalesce(w.fri_l,0)+coalesce(w.fri_ps,0)+coalesce(w.fri_su,0)+coalesce(w.fri_es,0))
    ) as t(d, n)
   where w.roster_id = p_roster and t.d is not null and t.d > p_day and t.n > 0;
$function$;

-- ─── 4. Функция: причина у marked-полей + денежный гейт date_out ────────────
-- Изменён ТОЛЬКО блок замка; всё прочее тело переносится дословно из
-- 20260805b. Новый параметр p_confirm_override идёт ПОСЛЕДНИМ и с умолчанием,
-- поэтому все существующие вызовы продолжают работать без правки.
--
--   ...прежняя сигнатура..., p_confirm_override boolean default false
--
-- Блок замка после ветки лестницы (v_ladder is null):
--
--   elsif coalesce(v_lock,'free') = 'document' and p_source = 'verbal' then
--     raise exception '%', v_lock_text;            -- как прежде
--
--   elsif coalesce(v_lock,'free') = 'marked' then
--     -- причина обязательна там, где она объявлена обязательной
--     if v_needs_reason and p_source = 'verbal'
--        and nullif(btrim(coalesce(p_note,'')),'') is null then
--       raise exception '%', coalesce(v_reason_text,
--         'Say in your own words why this date changed.') using errcode='check_violation';
--     end if;
--
--     -- ДЕНЕЖНЫЙ ГЕЙТ. Единственное место, где эти даты трогают деньги.
--     if p_field_key = 'date_out' and v_new is not null then
--       v_last_mark := menumaker.last_mark_day(p_roster_id);
--       if v_last_mark is not null and v_last_mark > v_new::date then
--         v_after := menumaker.marks_after(p_roster_id, v_new::date);
--         if not p_confirm_override then
--           raise exception
--             'Marks exist through %. An end date of % would leave % mark(s) after the child left. '
--             'Check the date; if it is right, confirm explicitly and say why — the confirmation '
--             'is written to the history.',
--             to_char(v_last_mark,'DD.MM.YYYY'), to_char(v_new::date,'DD.MM.YYYY'), v_after
--             using errcode='check_violation';
--         end if;
--         -- Подтверждено: факт УХОДИТ В ЖУРНАЛ вместе с числами, а не растворяется.
--         p_note := coalesce(p_note,'') ||
--           format(' [confirmed: %s mark(s) after %s, last mark %s]',
--                  v_after, to_char(v_new::date,'DD.MM.YYYY'), to_char(v_last_mark,'DD.MM.YYYY'));
--       end if;
--     end if;
--   end if;
--
-- ЧЕГО ЗДЕСЬ НЕТ НАРОЧНО: запрета отмечать ребёнка после даты ухода на экране
-- счёта. Повар в 11:30 не должен упираться в замок из-за бумажной работы офиса,
-- а ребёнок мог вернуться при ошибочно поставленной дате. Возражение стоит
-- ТАМ, ГДЕ СТАВЯТ ДАТУ, и звучит числами.
--
-- Отметки задним числом не переписываются вовсе: недельные строки замораживают
-- состав, это канон.
