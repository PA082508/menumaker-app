-- ============================================================================
-- НАПРАВЛЕННЫЙ ЗАМОК ВЫГОДЫ (заход D).
-- Показан владельцу 04.08, применён по слову «GO» к проекту menumaker
-- (trrmyqfpxntmgxnqkikp) 2026-08-04 двумя шагами: носитель, затем функция.
--
-- ЧТО НЕ ТАК СЕГОДНЯ. Замок у поля `frp` бинарный: уровень `document` запрещает
-- любую запись «со слов», в какую бы сторону она ни шла. Из-за этого директор,
-- которому семья сказала «мы больше не проходим по доходу», НЕ МОЖЕТ понизить
-- ребёнка с Free на Paid, пока не добудет бумагу, — а бумаги на ПОНИЖЕНИЕ не
-- бывает: никто не приносит справку о том, что перестал претендовать на льготу.
-- Итог замка ровно обратный задуманному: ребёнок остаётся Free без основания,
-- и это переклайм, то есть возврат денег на проверке.
--
-- ПРАВИЛО ВЛАДЕЛЬЦА (04.08), асимметричное нарочно:
--   · ПОНИЖЕНИЕ выгоды (F→R, F→P, R→P) — можно «со слов», но ТОЛЬКО с названной
--     причиной. Понижение против интереса центра: соврать им нечего, а причина
--     нужна, чтобы через год было видно, на каком основании сняли льготу.
--   · ПОВЫШЕНИЕ (→R, →F, и любое назначение льготы там, где её не было) — только
--     подписанный документ с датой на нём. Повышение — это деньги в пользу
--     центра, и оно обязано опираться на бумагу.
--
-- ЗАМЕР 04.08 (на чём построено): активный ростер несёт frp = F 158 · P 127 ·
-- R 28 · NULL 3. Значений вне {F,R,P} нет. У `child_field_locks` четыре колонки:
-- field_key, lock_level, needs_document_text, why.
-- ============================================================================

-- ─── 1. Носитель направления и причины ──────────────────────────────────────
-- Лестница выгоды хранится ДАННЫМИ, а не зашита в код функции: она читается там
-- же, где лежат тексты отказов, и её видно тому, кто правит правило. NULL =
-- у поля направления нет, оно ведёт себя ровно как сегодня.
alter table menumaker.child_field_locks
  add column if not exists benefit_ladder text[];          -- от НИЗШЕЙ выгоды к высшей
alter table menumaker.child_field_locks
  add column if not exists needs_reason_text text;         -- что сказать, когда причина не названа

comment on column menumaker.child_field_locks.benefit_ladder is
  'Порядок значений от НИЗШЕЙ выгоды к высшей, напр. {P,R,F}. NULL — у поля нет направления.';
comment on column menumaker.child_field_locks.needs_reason_text is
  'Отказ, когда понижение вносят со слов без причины.';

update menumaker.child_field_locks
   set benefit_ladder = array['P','R','F'],
       needs_reason_text =
         'Lowering a child''s category needs a reason in your own words — say what changed '
         '(for example: the family told us their income went up, or they stopped claiming). '
         'It is written to the change history and it is the only record of why the benefit was removed.',
       needs_document_text =
         'Raising a child to Reduced or Free needs a signed document — take the income eligibility '
         'application (IEA) or the USDA waiver and enter the date printed on it. '
         'Lowering to Paid can be done from what the family told you, with a reason.'
 where field_key = 'frp';

-- `frp_expires` НЕ трогаем: срок — это всегда число С БУМАГИ, направления у него нет.

-- ─── 2. Функция ─────────────────────────────────────────────────────────────
-- Изменения против действующей редакции — ТОЛЬКО в блоке замка (отмечен ниже).
-- Всё остальное (ключ ребёнка, тип колонки, правило старшинства документной
-- даты, запись события) перенесено дословно.
create or replace function menumaker.record_child_field_change(
  p_roster_id uuid, p_field_key text, p_table text, p_column text, p_new_value text,
  p_source text, p_document_date date default null, p_source_form_key text default null,
  p_source_submission_id uuid default null, p_note text default null,
  p_entered_by_name text default null)
returns jsonb language plpgsql security definer
set search_path to 'menumaker','public','core'
as $function$
declare
  v_org uuid; v_center uuid; v_child_key uuid;
  v_target uuid; v_key_col text; v_coltype text; v_old text; v_new text;
  v_effective date; v_applied boolean := true; v_reason text;
  v_uid uuid := auth.uid();
  v_lock text; v_lock_text text;
  v_ladder text[]; v_reason_text text;
  v_old_rank int; v_new_rank int; v_direction text;
begin
  if v_uid is null then
    raise exception 'Запись в карточку требует входа в систему' using errcode='42501';
  end if;

  select r.org_id, r.center_id, r.child_id into v_org, v_center, v_child_key
    from menumaker.roster r where r.id = p_roster_id;
  if v_org is null then
    raise exception 'Ребёнок % не найден в ростере', p_roster_id using errcode='no_data_found';
  end if;
  if not core.is_org_member(v_org) then
    raise exception 'Нет доступа к этому центру' using errcode='42501';
  end if;

  if p_table not in ('roster','child_medical','child') then
    raise exception 'Поле % не принадлежит карточке ребёнка (таблица %)', p_column, p_table using errcode='check_violation';
  end if;
  if p_source not in ('library_form','free_document','verbal') then
    raise exception 'Неизвестный источник % (library_form | free_document | verbal)', p_source using errcode='check_violation';
  end if;
  if p_source <> 'verbal' and p_document_date is null then
    raise exception 'У документа обязана быть ДАТА ДОКУМЕНТА — та, что стоит на бумаге, а не сегодняшняя'
      using errcode='check_violation';
  end if;
  if p_source = 'verbal' and p_document_date is not null then
    raise exception 'Запись со слов не может нести дату документа — документа нет' using errcode='check_violation';
  end if;

  -- Старое значение читается ДО замка: направление без него не определить.
  select format_type(a.atttypid, a.atttypmod) into v_coltype
    from pg_attribute a
   where a.attrelid = format('menumaker.%I', p_table)::regclass
     and a.attname = p_column and a.attnum > 0 and not a.attisdropped;
  if v_coltype is null then
    raise exception 'Колонки % в таблице % нет', p_column, p_table using errcode='undefined_column';
  end if;

  v_new := nullif(btrim(coalesce(p_new_value,'')), '');

  if p_table = 'roster' then
    v_target := p_roster_id; v_key_col := 'id';
  else
    if v_child_key is null then
      raise exception
        'У этой строки ростера нет ключа ребёнка (roster.child_id пуст), поэтому запись «%» к ней привязать НЕЛЬЗЯ. '
        'Это не ошибка ввода: строку нужно сначала сверить с таблицей детей (key-backfill). Ничего не записано.',
        p_table using errcode='check_violation';
    end if;
    v_target := v_child_key;
    if p_table = 'child_medical' then
      v_key_col := 'child_id';
      insert into menumaker.child_medical (child_id, org_id) values (v_child_key, v_org)
      on conflict (child_id) do nothing;
    else
      v_key_col := 'id';
    end if;
  end if;

  execute format('select %I::text from menumaker.%I where %I = $1', p_column, p_table, v_key_col)
    into v_old using v_target;

  -- ══════════════ ЗАМОК — ЕДИНСТВЕННОЕ, ЧТО ИЗМЕНИЛОСЬ ══════════════
  select lock_level, needs_document_text, benefit_ladder, needs_reason_text
    into v_lock, v_lock_text, v_ladder, v_reason_text
    from menumaker.child_field_locks where field_key = p_field_key;

  if v_ladder is not null then
    -- Ранг: позиция в лестнице выгоды. Сравнение по первой букве без регистра —
    -- в ростере лежат ровно F/R/P, но карточка присылает то, что набрал человек.
    v_old_rank := array_position(v_ladder, upper(left(coalesce(v_old,''),1)));
    v_new_rank := array_position(v_ladder, upper(left(coalesce(v_new,''),1)));

    if v_new_rank is null then
      raise exception 'Значение «%» не из набора %', coalesce(v_new,'∅'), array_to_string(v_ladder,'/')
        using errcode='check_violation';
    end if;

    -- Значения не было вовсе → это НАЗНАЧЕНИЕ. Низшая ступень (Paid) назначением
    -- выгоды не является и идёт как понижение; всё выше требует бумаги.
    v_direction := case
      when v_old_rank is null then case when v_new_rank = 1 then 'decrease' else 'increase' end
      when v_new_rank > v_old_rank then 'increase'
      when v_new_rank < v_old_rank then 'decrease'
      else 'same' end;

    if v_direction = 'increase' and p_source = 'verbal' then
      raise exception '%', coalesce(v_lock_text,
        'Raising a benefit needs a signed document — attach it and enter the date printed on it.')
        using errcode='check_violation';
    end if;

    -- ПОНИЖЕНИЕ СО СЛОВ — МОЖНО, НО С ПРИЧИНОЙ. Причина не украшение: это
    -- единственная запись о том, на каком основании льгота снята.
    if v_direction = 'decrease' and p_source = 'verbal'
       and nullif(btrim(coalesce(p_note,'')),'') is null then
      raise exception '%', coalesce(v_reason_text,
        'Lowering a category from what the family told you needs a reason in your own words.')
        using errcode='check_violation';
    end if;

  elsif coalesce(v_lock,'free') = 'document' and p_source = 'verbal' then
    -- Поля без направления ведут себя ровно как прежде.
    raise exception '%', coalesce(v_lock_text,
      'This field can only be changed from a signed document — take it and enter the date printed on it.')
      using errcode='check_violation';
  end if;
  -- ══════════════ конец изменённого блока ══════════════

  select max(e.document_date) into v_effective
    from menumaker.child_field_events e
   where e.roster_id = p_roster_id and e.field_key = p_field_key
     and e.applied and e.document_date is not null;

  if p_source <> 'verbal' and v_effective is not null and p_document_date < v_effective then
    v_applied := false;
    v_reason := format('документ от %s старше уже применённого от %s — значение не тронуто, событие записано',
                       to_char(p_document_date,'DD.MM.YYYY'), to_char(v_effective,'DD.MM.YYYY'));
  end if;

  if v_applied then
    execute format('update menumaker.%I set %I = $1::%s where %I = $2',
                   p_table, p_column, v_coltype, v_key_col) using v_new, v_target;
    if p_table in ('roster','child_medical') then
      execute format('update menumaker.%I set updated_at = now() where %I = $1', p_table, v_key_col) using v_target;
    end if;
  end if;

  insert into menumaker.child_field_events
    (org_id, center_id, roster_id, field_key, table_name, column_name,
     old_value, new_value, source, source_form_key, source_submission_id,
     document_date, entered_by, entered_by_name, note, applied, not_applied_reason)
  values
    (v_org, v_center, p_roster_id, p_field_key, p_table, p_column,
     v_old, v_new, p_source, p_source_form_key, p_source_submission_id,
     p_document_date, v_uid, p_entered_by_name, p_note, v_applied, v_reason);

  return jsonb_build_object('applied', v_applied, 'reason', v_reason,
    'old_value', v_old, 'new_value', v_new, 'effective_document_date', v_effective,
    'lock_level', coalesce(v_lock,'free'), 'is_verbal', p_source = 'verbal',
    'direction', v_direction);
end $function$;
