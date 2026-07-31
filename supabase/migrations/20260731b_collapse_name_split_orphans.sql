-- 20260731b — СХЛОПЫВАНИЕ СТРОК-СИРОТ (вид А: расщепление по написанию имени).
--
-- ⚠️⚠️ НЕ ПРИМЕНЕНО. ЗАГОТОВКА. Это ШАГ (2) плана, он идёт ПЕРЕД 20260731a.
--
-- ⚠️⚠️ И ОН НЕ ПРИМЕНЯЕТСЯ, ПОКА ДИРЕКТОР ПРАВИТ РУКАМИ. 31.07 с 12:19 до 14:12
--      UTC Татьяна тронула 174 строки недели в 18 классах и подписала неделю
--      13.07 — ровно те строки, которые файл собирался бы слить. Ниже стоит
--      ГАРД СВЕЖЕСТИ: файл падает сам, если хоть одна целевая строка правилась
--      в последние 30 минут. Дисциплина не должна опираться на память.
--
-- ЧТО ЭТО ЗА СТРОКИ. Один ребёнок, одна комната, одна неделя — но ДВЕ строки,
-- потому что имя стояло в ключе (см. 20260731a). Обе несут НАСТОЯЩИЕ тапы:
-- журнал точки обслуживания даёт по второй строке Инары двадцать нажатий 13.07
-- за пять минут с одного устройства. Поэтому это не «удалить мусор», а СЛИТЬ
-- две правды об одном ребёнке в одну строку.
--
-- ПРАВИЛО СЛИЯНИЯ — ИЛИ (greatest), а не «выбрать копию»:
--   клетка = 1, если она отмечена ХОТЯ БЫ в одной из строк группы.
-- Ребёнок получил приём один раз; сегодня клетка, отмеченная в обеих строках,
-- считается ДВАЖДЫ — в этом и есть задвоение. Выбор «одной из копий» потерял бы
-- приёмы, отмеченные только во второй строке.
--
-- ⚠️ ЧЕГО ЭТОТ ФАЙЛ КАСАЕТСЯ, И ЭТО РЕШЕНИЕ ВЛАДЕЛЬЦА, А НЕ ТЕХНИКИ.
-- Замер 31.07: в 24 группах 24 «проигравшие» строки, и 23 из них НЕСУТ ПОДПИСЬ
-- ДИРЕКТОРА (status='director_approved'). Директор подписал обе стороны
-- расщепления — он видел на экране одну строку, а подпись легла на две.
-- Канон forward-only: подписанное не переписывают. Поэтому:
--   • проигравшая строка НЕ УДАЛЯЕТСЯ в никуда — она уезжает в архивную
--     таблицу ДОСЛОВНО, вместе с подписью, статусом и временем;
--   • в живой сетке остаётся одна строка, и она несёт объединённые отметки;
--   • сам факт слияния — новая запись (merged_into / merged_at / merged_reason),
--     а не правка задним числом.
-- Июльский клейм НЕ ПОДАН (menumaker.monthly_claims пуста), поэтому замороженной
-- подачи этот файл не трогает. Если к моменту применения июль будет подан —
-- ОСТАНОВИТЬСЯ и переспросить: тогда это уже правка поданного месяца.
--
-- ЦЕНА (замер 31.07, весь июль, три центра): приёмы 12 659 → 12 467,
-- ADA 217 → 215, C1 без изменений, C2 4557 → 4515, деньги ≈ −$472.65.
-- Из них вид А (этот файл) — 115 клеток, $244.30. Вид Б (между комнатами) этим
-- файлом НЕ ЛЕЧИТСЯ и уходит к директору по спеке 2026-07-31-duplicate-mark-check.
--
-- СПИСОК НЕ ЗАШИТ. Файл вычисляет группы САМ, в момент применения. Это
-- намеренно: список, снятый вчера, к сегодняшнему дню уже другой (вчера было
-- 21 класснеделя, сегодня 24 группы), и зашитый список слил бы не то.

begin;

-- ── 0. ГАРД СВЕЖЕСТИ — не работать поверх живых рук ──────────────────────────
do $$
declare _hot int; _last timestamptz;
begin
  select count(*), max(m.updated_at) into _hot, _last
  from menumaker.meal_week_records m
  join (select classroom_id, roster_id, monday_date
        from menumaker.meal_week_records
        where roster_id is not null
        group by 1,2,3 having count(*) > 1) g
    using (classroom_id, roster_id, monday_date)
  where m.updated_at > now() - interval '30 minutes';

  if _hot > 0 then
    raise exception using
      errcode = 'raise_exception',
      message = format('20260731b ОСТАНОВЛЕН: %s целевых строк правились только что '
                       '(последняя %s). Похоже, директор сейчас работает руками.', _hot, _last),
      hint    = 'Дождаться слова «Татьяна закончила», перечитать группы заново и применить снова.';
  end if;
end $$;

-- ── 1. Архив: forward-only, проигравшая строка сохраняется дословно ──────────
create table if not exists menumaker.meal_week_records_merged (
  like menumaker.meal_week_records including defaults,
  merged_into   uuid        not null,                    -- id выжившей строки
  merged_at     timestamptz not null default now(),
  merged_by     uuid        default auth.uid(),
  merged_reason text        not null default 'name-split orphan (20260731b)',
  constraint meal_week_records_merged_pkey primary key (id)
);

alter table menumaker.meal_week_records_merged enable row level security;
drop policy if exists org_isolation      on menumaker.meal_week_records_merged;
drop policy if exists module_cacfp_active on menumaker.meal_week_records_merged;
create policy org_isolation on menumaker.meal_week_records_merged
  for all using (core.is_org_member(org_id)) with check (core.is_org_member(org_id));
create policy module_cacfp_active on menumaker.meal_week_records_merged
  for all using (core.org_has_module('cacfp', org_id)) with check (core.org_has_module('cacfp', org_id));
grant select on menumaker.meal_week_records_merged to authenticated;

comment on table menumaker.meal_week_records_merged is
  'Строки недели, слитые в другую строку при починке ключа (20260731b). '
  'Хранятся дословно, включая подпись директора: подписанное не переписывают. '
  'В подсчёт питания НЕ входят — их отметки перенесены в строку merged_into.';

-- ── 2. Кто выживает, кто уезжает ─────────────────────────────────────────────
-- Выживает САМАЯ РАННЯЯ строка группы (created_at, ничья — по id): правило
-- детерминированное, повтор даёт тот же ответ. То же правило, по которому
-- 31.07 считалась цена дедупа.
create temporary table _split on commit drop as
select m.id, m.classroom_id, m.roster_id, m.monday_date,
       row_number() over (partition by m.classroom_id, m.roster_id, m.monday_date
                          order by m.created_at, m.id) as seq
from menumaker.meal_week_records m
join (select classroom_id, roster_id, monday_date
      from menumaker.meal_week_records
      where roster_id is not null
      group by 1,2,3 having count(*) > 1) g
  using (classroom_id, roster_id, monday_date);

create temporary table _keep on commit drop as
select k.id as keep_id, k.classroom_id, k.roster_id, k.monday_date
from _split k where k.seq = 1;

create temporary table _drop on commit drop as
select d.id as drop_id, kp.keep_id
from _split d
join _keep kp on kp.classroom_id = d.classroom_id
             and kp.roster_id    = d.roster_id
             and kp.monday_date  = d.monday_date
where d.seq > 1;

-- ── 3. Слить отметки в выжившую строку (ИЛИ по каждой из 30 клеток) ──────────
update menumaker.meal_week_records t set
  mon_b  = greatest(coalesce(t.mon_b ,0), s.mon_b ), mon_as = greatest(coalesce(t.mon_as,0), s.mon_as),
  mon_l  = greatest(coalesce(t.mon_l ,0), s.mon_l ), mon_ps = greatest(coalesce(t.mon_ps,0), s.mon_ps),
  mon_su = greatest(coalesce(t.mon_su,0), s.mon_su), mon_es = greatest(coalesce(t.mon_es,0), s.mon_es),
  tue_b  = greatest(coalesce(t.tue_b ,0), s.tue_b ), tue_as = greatest(coalesce(t.tue_as,0), s.tue_as),
  tue_l  = greatest(coalesce(t.tue_l ,0), s.tue_l ), tue_ps = greatest(coalesce(t.tue_ps,0), s.tue_ps),
  tue_su = greatest(coalesce(t.tue_su,0), s.tue_su), tue_es = greatest(coalesce(t.tue_es,0), s.tue_es),
  wed_b  = greatest(coalesce(t.wed_b ,0), s.wed_b ), wed_as = greatest(coalesce(t.wed_as,0), s.wed_as),
  wed_l  = greatest(coalesce(t.wed_l ,0), s.wed_l ), wed_ps = greatest(coalesce(t.wed_ps,0), s.wed_ps),
  wed_su = greatest(coalesce(t.wed_su,0), s.wed_su), wed_es = greatest(coalesce(t.wed_es,0), s.wed_es),
  thu_b  = greatest(coalesce(t.thu_b ,0), s.thu_b ), thu_as = greatest(coalesce(t.thu_as,0), s.thu_as),
  thu_l  = greatest(coalesce(t.thu_l ,0), s.thu_l ), thu_ps = greatest(coalesce(t.thu_ps,0), s.thu_ps),
  thu_su = greatest(coalesce(t.thu_su,0), s.thu_su), thu_es = greatest(coalesce(t.thu_es,0), s.thu_es),
  fri_b  = greatest(coalesce(t.fri_b ,0), s.fri_b ), fri_as = greatest(coalesce(t.fri_as,0), s.fri_as),
  fri_l  = greatest(coalesce(t.fri_l ,0), s.fri_l ), fri_ps = greatest(coalesce(t.fri_ps,0), s.fri_ps),
  fri_su = greatest(coalesce(t.fri_su,0), s.fri_su), fri_es = greatest(coalesce(t.fri_es,0), s.fri_es),
  updated_at = now()
from (
  select d.keep_id,
    max(coalesce(m.mon_b ,0)) mon_b , max(coalesce(m.mon_as,0)) mon_as,
    max(coalesce(m.mon_l ,0)) mon_l , max(coalesce(m.mon_ps,0)) mon_ps,
    max(coalesce(m.mon_su,0)) mon_su, max(coalesce(m.mon_es,0)) mon_es,
    max(coalesce(m.tue_b ,0)) tue_b , max(coalesce(m.tue_as,0)) tue_as,
    max(coalesce(m.tue_l ,0)) tue_l , max(coalesce(m.tue_ps,0)) tue_ps,
    max(coalesce(m.tue_su,0)) tue_su, max(coalesce(m.tue_es,0)) tue_es,
    max(coalesce(m.wed_b ,0)) wed_b , max(coalesce(m.wed_as,0)) wed_as,
    max(coalesce(m.wed_l ,0)) wed_l , max(coalesce(m.wed_ps,0)) wed_ps,
    max(coalesce(m.wed_su,0)) wed_su, max(coalesce(m.wed_es,0)) wed_es,
    max(coalesce(m.thu_b ,0)) thu_b , max(coalesce(m.thu_as,0)) thu_as,
    max(coalesce(m.thu_l ,0)) thu_l , max(coalesce(m.thu_ps,0)) thu_ps,
    max(coalesce(m.thu_su,0)) thu_su, max(coalesce(m.thu_es,0)) thu_es,
    max(coalesce(m.fri_b ,0)) fri_b , max(coalesce(m.fri_as,0)) fri_as,
    max(coalesce(m.fri_l ,0)) fri_l , max(coalesce(m.fri_ps,0)) fri_ps,
    max(coalesce(m.fri_su,0)) fri_su, max(coalesce(m.fri_es,0)) fri_es
  from _drop d join menumaker.meal_week_records m on m.id = d.drop_id
  group by d.keep_id
) s
where t.id = s.keep_id;

-- ── 4. Проигравшие уезжают в архив ДОСЛОВНО (подпись едет с ними) ────────────
insert into menumaker.meal_week_records_merged
select m.*, d.keep_id, now(), auth.uid(), 'name-split orphan (20260731b)'
from menumaker.meal_week_records m
join _drop d on d.drop_id = m.id
on conflict (id) do nothing;

-- ── 5. …и только теперь уходят из живой сетки ───────────────────────────────
-- Ничего не потеряно: строка целиком лежит в meal_week_records_merged, её
-- отметки перенесены в выжившую строку шагом 3. На meal_week_records нет ни
-- одной внешней ссылки (проверено 31.07), поэтому удаление ничего не рвёт.
delete from menumaker.meal_week_records m using _drop d where m.id = d.drop_id;

-- ── 6. Собственная проверка перед коммитом ───────────────────────────────────
do $$
declare _left int;
begin
  select count(*) into _left
  from (select 1 from menumaker.meal_week_records
        where roster_id is not null
        group by classroom_id, roster_id, monday_date having count(*) > 1) q;
  if _left > 0 then
    raise exception '20260731b: после слияния осталось % расщеплённых групп — откат', _left;
  end if;
  raise notice '20260731b: расщеплений не осталось. Теперь можно 20260731a.';
end $$;

commit;

-- ── VERIFY (read-back после применения; ЧИТАЕТ, НЕ ПИШЕТ) ────────────────────
-- 1) расщеплений нет:
--    select count(*) from (select 1 from menumaker.meal_week_records
--      where roster_id is not null group by classroom_id, roster_id, monday_date
--      having count(*)>1) q;                                       -- ждём 0
-- 2) сколько уехало в архив и ни одна ли подпись не потеряна:
--    select count(*), count(*) filter (where director_initials is not null)
--    from menumaker.meal_week_records_merged;
-- 3) Инара: одна строка в неделе 06.07, и в ней объединённые отметки:
--    select id, child_name, monday_date, mon_b, mon_as, mon_l, tue_b, thu_b, fri_b
--    from menumaker.meal_week_records
--    where roster_id='97939ce4-25c8-4778-b776-e10d838ffef3' and monday_date='2026-07-06';
-- 4) сверить лист Blue Room 06.07 заново — итог недели должен УПАСТЬ со 170:
--    строки 'Andras Inara' + 'Inara Andras' становятся одной.
