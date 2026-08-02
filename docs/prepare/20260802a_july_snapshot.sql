-- =====================================================================================
-- 20260802a — СНИМОК ИЮЛЯ «ДО 20260731a» (перенос ключа строки недели).
--
-- ⚠️⚠️ НЕ ПРИМЕНЕНО. ЗАГОТОВКА. Применять только по слову владельца.
--
-- ЗАЧЕМ. Починка ключа (20260731a) меняет идентичность строки недели. Пока состояние
-- «до» существует только в живой таблице, любой спор о том, что именно миграция
-- сделала с числами июля, упирается в память. Снимок превращает память в запись.
--
-- ⚠️ ЧЕГО ЭТОТ СНИМОК НЕ ЯВЛЯЕТСЯ. Он НЕ «до всей починки ключа». Второй шаг,
--    20260731b (схлопывание строк-сирот), УЖЕ ПРИМЕНЁН 01.08 между 15:37 и 16:11 UTC:
--    24 строки уехали в meal_week_records_merged, 23 из них с подписью директора.
--    Слияние писало в выжившую строку greatest(своя клетка, чужая клетка) — архив
--    хранит дословно только ПРОИГРАВШИЕ строки, а доклеточные значения ВЫЖИВШИХ не
--    сохранены нигде. Состояние «до 20260731b» задним числом не восстановимо.
--    Поэтому снимок честно называется «до 20260731a», и ничем большим считаться не должен.
--
-- ⚠️ МЕСЯЦ ЖИВОЙ. 02.08 в июльскую неделю 27.07 легли 38 новых отметок. Снимок верен
--    на секунду своего взятия, и таблица хранит эту секунду. Брать его надо тогда,
--    когда владелец готов сказать «с этого момента считаем», а не «когда-нибудь».
--
-- FORWARD-ONLY. Снимок с тем же ярлыком второй раз не берётся: повтор — это новая
-- запись с новым ярлыком, а не переписывание старой. Ниже стоит гард, который это держит.
-- =====================================================================================

begin;

-- ── 0. ГАРД: не переписывать уже взятый снимок ───────────────────────────────
-- Вложенный IF, а не `A and B`: PL/pgSQL планирует всё выражение целиком, и при
-- первом прогоне (таблицы ещё нет) ссылка на неё роняет гард раньше проверки.
do $$
begin
  if to_regclass('menumaker.meal_week_snapshots') is not null then
    if exists (select 1 from menumaker.meal_week_snapshots where label = 'pre-20260731a-july') then
      raise exception using
        errcode = 'raise_exception',
        message = '20260802a ОСТАНОВЛЕН: снимок «pre-20260731a-july» уже взят.',
        hint    = 'Снимок forward-only. Нужен новый — дай ему новый ярлык.';
    end if;
  end if;
end $$;

-- ── 1. Шапка снимка ──────────────────────────────────────────────────────────
create table if not exists menumaker.meal_week_snapshots (
  id            uuid primary key default gen_random_uuid(),
  label         text not null unique,
  reason        text not null,
  period_start  date not null,
  period_end    date not null,
  taken_at      timestamptz not null default now(),
  taken_by      uuid default auth.uid(),
  row_count     int  not null,
  content_hash  text not null
);

comment on table menumaker.meal_week_snapshots is
  'Снимки строк недели, взятые ПЕРЕД правкой, которая может сдвинуть числа заявки. '
  'Forward-only: снимок не переписывается, новый повод — новый ярлык.';

-- ── 2. Строки снимка: дословная копия ────────────────────────────────────────
create table if not exists menumaker.meal_week_snapshot_rows (
  like menumaker.meal_week_records including defaults,
  snapshot_id uuid not null references menumaker.meal_week_snapshots(id) on delete restrict,
  constraint meal_week_snapshot_rows_pkey primary key (snapshot_id, id)
);

comment on table menumaker.meal_week_snapshot_rows is
  'Дословные строки недели на момент снимка, включая статус и подпись директора. '
  'В подсчёт питания НЕ входят — это запись прошлого, а не живая сетка.';

create index if not exists meal_week_snapshot_rows_snap_idx
  on menumaker.meal_week_snapshot_rows (snapshot_id, center_id, monday_date);

-- ── 3. Права: читать может организация, писать — никто через RLS ─────────────
alter table menumaker.meal_week_snapshots      enable row level security;
alter table menumaker.meal_week_snapshot_rows  enable row level security;

drop policy if exists org_isolation on menumaker.meal_week_snapshot_rows;
create policy org_isolation on menumaker.meal_week_snapshot_rows
  for select using (core.is_org_member(org_id));

drop policy if exists auth_read on menumaker.meal_week_snapshots;
create policy auth_read on menumaker.meal_week_snapshots
  for select to authenticated using (true);

grant select on menumaker.meal_week_snapshots     to authenticated;
grant select on menumaker.meal_week_snapshot_rows to authenticated;

-- ── 4. Взятие снимка ─────────────────────────────────────────────────────────
-- Период: июльские недели, то есть понедельники 29.06 … 27.07 включительно.
-- Хеш считается по тем же полям, что и в замере 02.08, чтобы числа сходились глазами.
with src as (
  select * from menumaker.meal_week_records
   where monday_date between date '2026-06-29' and date '2026-07-27'
),
agg as (
  select count(*) as n,
         md5(string_agg(
           id::text||':'||coalesce(roster_id::text,'-')||':'||child_name||':'||monday_date::text||':'||
           coalesce(mon_b,0)||coalesce(mon_as,0)||coalesce(mon_l,0)||coalesce(mon_ps,0)||coalesce(mon_su,0)||coalesce(mon_es,0)||
           coalesce(tue_b,0)||coalesce(tue_as,0)||coalesce(tue_l,0)||coalesce(tue_ps,0)||coalesce(tue_su,0)||coalesce(tue_es,0)||
           coalesce(wed_b,0)||coalesce(wed_as,0)||coalesce(wed_l,0)||coalesce(wed_ps,0)||coalesce(wed_su,0)||coalesce(wed_es,0)||
           coalesce(thu_b,0)||coalesce(thu_as,0)||coalesce(thu_l,0)||coalesce(thu_ps,0)||coalesce(thu_su,0)||coalesce(thu_es,0)||
           coalesce(fri_b,0)||coalesce(fri_as,0)||coalesce(fri_l,0)||coalesce(fri_ps,0)||coalesce(fri_su,0)||coalesce(fri_es,0)
           , '|' order by id)) as h
  from src
),
head as (
  insert into menumaker.meal_week_snapshots
    (label, reason, period_start, period_end, row_count, content_hash)
  select 'pre-20260731a-july',
         'Состояние июля перед переносом ключа строки недели на roster_id (20260731a). '
         'НЕ является состоянием до 20260731b — тот применён 01.08 и необратим для выживших строк.',
         date '2026-06-29', date '2026-07-27', agg.n, agg.h
  from agg
  returning id
)
insert into menumaker.meal_week_snapshot_rows
select src.*, head.id from src cross join head;

commit;

-- ── ДВЕ ТОЧКИ ЗАМЕРА ─────────────────────────────────────────────────────────
-- Точка 1 — инвентарь при подготовке файла:
--     02.08.2026 14:57:49 UTC · 1388 строк · 4682ba46fb6f9a0d95271a5b1ae95947
-- Точка 2 — контроль непосредственно перед взятием снимка:
--     02.08.2026 16:17:46 UTC · 1388 строк · 4682ba46fb6f9a0d95271a5b1ae95947
-- Хеш и число строк СОВПАЛИ: между подготовкой и взятием июль не двигался
-- (последняя правка июльских строк так и осталась 14:57:49 — те 38 отметок
-- браузера проверок). Снимок берётся у неподвижного месяца, и это проверено,
-- а не предположено.
--
-- ── ЧИТКА НАЗАД (выполнить отдельно, после commit) ───────────────────────────
-- Ждём: rows_stored = row_count = 1388, и hash_matches = true.
-- Число 1388 и хеш 4682ba46fb6f9a0d95271a5b1ae95947 — замер 02.08 14:57:49 UTC;
-- если месяц с тех пор правился, они законно разойдутся — тогда сверять с новым замером,
-- а не подгонять.
--
-- select s.label, s.taken_at, s.row_count, s.content_hash,
--        (select count(*) from menumaker.meal_week_snapshot_rows r where r.snapshot_id = s.id) as rows_stored,
--        (select count(*) from menumaker.meal_week_snapshot_rows r where r.snapshot_id = s.id) = s.row_count as counts_agree
--   from menumaker.meal_week_snapshots s
--  where s.label = 'pre-20260731a-july';
