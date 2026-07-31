-- 20260731a — ИДЕНТИЧНОСТЬ СТРОКИ НЕДЕЛИ ПЕРЕЕЗЖАЕТ С ИМЕНИ НА roster_id.
--
-- ⚠️⚠️ НЕ ПРИМЕНЕНО. ЗАГОТОВКА. Применять только по слову владельца и только
--      ПОСЛЕ 20260731b (схлопывание сирот). Порядок (2) → (1) обязателен:
--      уникальный индекс не создастся, пока в таблице лежат расщеплённые пары.
--      Первый шаг файла — гард, который это проверяет и падает сам.
--
-- ЗАЧЕМ. sync_meal_marks (20260710c) делает
--     on conflict (classroom_id, child_name, monday_date)
-- то есть ИМЯ РЕБЁНКА входит в идентичность строки недели. Другое написание
-- того же имени — не конфликт, а ВТОРАЯ СТРОКА. Так родились 115 задвоенных
-- клеток вида А ($244.30 за июль): ростер пишет «Andras Inara», июньский
-- кухонный импорт написал «Inara Andras», написание импорта тянулось вперёд,
-- экран (он индексирует по написанию ростера) строку не показывал, повар
-- отмечал неделю заново — и получал третью строку вместо правки первой.
-- Полный разбор: docs/plans/2026-07-31-screen-vs-claim-two-sets.md
--
-- КАНОН (platform-standards, 31.07): идентичность не строится на
-- человекочитаемом поле. Имя — ПОДПИСЬ строки, ключ — roster_id.
--
-- ЗАМЕР 31.07 нашёл ВТОРОЙ носитель той же болезни, которого в плане не было:
--   meal_week_records_center_id_classroom_child_name_monday_dat_key
--     UNIQUE (center_id, classroom, child_name, monday_date)
-- здесь в идентичности стоит ещё и ТЕКСТОВОЕ ИМЯ КОМНАТЫ. В восьми классах
-- одна и та же комната уже записана двумя способами внутри одного
-- classroom_id («Blue» и «Blue Room», «Pre-K» и «PreK», …). Сегодня это ничего
-- не расщепило только потому, что upsert целится в другой индекс. Оставить
-- его — значит оставить заряженным второй генератор сирот, поэтому файл
-- снимает ОБА ключа, а не один.
--
-- ГРАНИЦА ЭТОГО ФАЙЛА. Он меняет КЛЮЧ и ничего больше: ни одной отметки, ни
-- одной подписи, ни одной строки не удаляет и не переносит. Данные приводит в
-- порядок 20260731b, экран — отдельный шаг (3) плана.

-- ── 0. ГАРД: схема не опережает данные, которые она объявляет невозможными ────
do $$
declare _groups int; _rows int;
begin
  select count(*), coalesce(sum(n),0) into _groups, _rows
  from (select count(*) as n
        from menumaker.meal_week_records
        where roster_id is not null
        group by classroom_id, roster_id, monday_date
        having count(*) > 1) q;

  if _groups > 0 then
    raise exception using
      errcode = 'raise_exception',
      message = format('20260731a ОСТАНОВЛЕН: в таблице ещё %s расщеплённых групп (%s строк). '
                       'Сначала 20260731b (схлопывание), потом этот файл.', _groups, _rows),
      hint    = 'Список: select classroom_id, roster_id, monday_date, count(*) '
                'from menumaker.meal_week_records where roster_id is not null '
                'group by 1,2,3 having count(*) > 1;';
  end if;
end $$;

-- ── 1. Новый ключ: комната + РЕБЁНОК + неделя ────────────────────────────────
-- Частичный (where roster_id is not null) по измеренной причине: 92 строки в
-- таблице живут без roster_id, и 88 из них — Ridge «Staff Room» (июнь, 852
-- отметки). Ростера у персонала нет и не будет, поэтому строки без ребёнка
-- получают СВОЙ ключ (п. 2), а не отменяют ключ для детей. Простой (не
-- частичный) индекс их бы не удержал вовсе: NULL в уникальном индексе Postgres
-- не равен NULL, и 28 строк «Staff Room» одной недели прошли бы как разные.
create unique index if not exists meal_week_records_roster_week_uq
  on menumaker.meal_week_records (classroom_id, roster_id, monday_date)
  where roster_id is not null;

-- ── 2. Наследство: строки без ребёнка сохраняют СТАРОЕ поведение ─────────────
-- Ровно тот ключ, что был, но действует только там, где ребёнка в строке нет.
-- Ничего не чинит и не ломает — держит 92 строки в том же режиме, в каком они
-- прожили июнь, чтобы починка детских строк не тронула персонал.
create unique index if not exists meal_week_records_nameless_week_uq
  on menumaker.meal_week_records (classroom_id, child_name, monday_date)
  where roster_id is null;

-- ── 3. Снять оба имени с идентичности ────────────────────────────────────────
-- (a) голый уникальный индекс по имени ребёнка
drop index if exists menumaker.meal_week_records_unique;
-- (b) ограничение, где в ключе стоят И имя ребёнка, И текстовое имя комнаты
alter table menumaker.meal_week_records
  drop constraint if exists meal_week_records_center_id_classroom_child_name_monday_dat_key;

comment on column menumaker.meal_week_records.child_name is
  'ПОДПИСЬ строки, не ключ. Идентичность — (classroom_id, roster_id, monday_date), '
  'см. 20260731a. Ключ по имени породил 115 строк-сирот в июле 2026.';
comment on column menumaker.meal_week_records.classroom is
  'ПОДПИСЬ комнаты, не ключ. Внутри одного classroom_id встречаются два '
  'написания («Blue» / «Blue Room»), см. 20260731a.';

-- ── 4. sync_meal_marks — тот же единственный писатель, новый conflict target ──
-- Отличий от 20260710c ровно два, оба вынужденные:
--   • ветка по roster_id: строка ребёнка целится в новый ключ, строка без
--     ребёнка — в наследственный. Один statement не может иметь два разных
--     conflict target, поэтому ветка, а не хитрый индекс;
--   • child_name = excluded.child_name на конфликте. Клиент присылает
--     написание РОСТЕРА (MealCountPage берёт его из строки ростера), поэтому
--     подпись строки сходится к ростеру при первом же тапе. Без этой строчки
--     между шагом (1) и шагом (3) плана экран остался бы слепым к уже
--     существующим строкам со старым написанием — ключ бы починили, а Инару
--     на экране всё равно не увидели бы.
-- Всё остальное сохранено дословно: security invoker (RLS как у таблицы),
-- белый список колонок перед format(), обновление ТОЛЬКО одной клетки, чтобы
-- не затереть статус, подпись директора и соседние клетки.
create or replace function menumaker.sync_meal_marks(_marks jsonb)
returns void
language plpgsql
security invoker
set search_path = menumaker, public
as $$
declare
  m jsonb;
  _col text;
  _roster uuid;
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
    _col    := m->>'col';
    _roster := nullif(m->>'roster_id','')::uuid;

    if _col is null or not (_col = any(_allowed_cols)) then
      raise exception 'sync_meal_marks: invalid column %', _col;
    end if;

    if _roster is not null then
      -- (a) Строка ребёнка: ключ — комната + ребёнок + неделя.
      execute format(
        'insert into menumaker.meal_week_records
           (center_id, classroom, classroom_id, roster_id, child_name, monday_date, %1$I, updated_at)
         values ($1,$2,$3,$4,$5,$6,$7, now())
         on conflict (classroom_id, roster_id, monday_date) where roster_id is not null
         do update set %1$I = excluded.%1$I, child_name = excluded.child_name, updated_at = now()',
        _col
      )
      using
        (m->>'center_id')::uuid, m->>'classroom', (m->>'classroom_id')::uuid,
        _roster, m->>'child_name', (m->>'monday_date')::date, (m->>'value')::smallint;
    else
      -- (b) Строка без ребёнка (персонал): ключ прежний, по подписи.
      execute format(
        'insert into menumaker.meal_week_records
           (center_id, classroom, classroom_id, roster_id, child_name, monday_date, %1$I, updated_at)
         values ($1,$2,$3,null,$4,$5,$6, now())
         on conflict (classroom_id, child_name, monday_date) where roster_id is null
         do update set %1$I = excluded.%1$I, updated_at = now()',
        _col
      )
      using
        (m->>'center_id')::uuid, m->>'classroom', (m->>'classroom_id')::uuid,
        m->>'child_name', (m->>'monday_date')::date, (m->>'value')::smallint;
    end if;

    -- (c) Журнал точки обслуживания — без изменений, идемпотентен по uuid очереди.
    insert into menumaker.meal_count_marks
      (id, center_id, classroom_id, roster_id, child_name, monday_date,
       day, slot, col, value, marked_at, source, device_id)
    values
      ((m->>'id')::uuid, (m->>'center_id')::uuid, (m->>'classroom_id')::uuid,
       _roster, m->>'child_name', (m->>'monday_date')::date,
       m->>'day', m->>'slot', _col, (m->>'value')::smallint,
       (m->>'marked_at')::timestamptz, coalesce(m->>'source','app_offline'), m->>'device_id')
    on conflict (id) do nothing;
  end loop;
end;
$$;

grant execute on function menumaker.sync_meal_marks(jsonb) to authenticated;

-- ── VERIFY (read-back после применения; ЧИТАЕТ, НЕ ПИШЕТ) ────────────────────
-- 1) ключи на месте, старые сняты:
--    select indexname from pg_indexes
--     where schemaname='menumaker' and tablename='meal_week_records' order by 1;
--    ждём: meal_week_records_roster_week_uq, meal_week_records_nameless_week_uq,
--          meal_week_records_pkey; НЕ ждём: meal_week_records_unique,
--          meal_week_records_center_id_classroom_child_name_monday_dat_key
-- 2) расщеплений нет:
--    select count(*) from (select 1 from menumaker.meal_week_records
--      where roster_id is not null group by classroom_id, roster_id, monday_date
--      having count(*)>1) q;                                        -- ждём 0
-- 3) персонал цел:
--    select count(*) from menumaker.meal_week_records where roster_id is null;  -- ждём 92
-- 4) писатель — invoker:
--    select proname, prosecdef from pg_proc where proname='sync_meal_marks';    -- ждём f
-- 5) живой тап на тестовой комнате создаёт ОДНУ строку, второй тап её же правит.
