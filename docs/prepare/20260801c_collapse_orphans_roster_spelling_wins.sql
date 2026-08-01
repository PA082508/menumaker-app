-- =====================================================================================
-- 20260801c — СХЛОПЫВАНИЕ СИРОТ, ИСПРАВЛЕННОЕ ПРАВИЛО ПОБЕДИТЕЛЯ.
--             ⚠️⚠️ НЕ ПРИМЕНЕНО. ЗАМЕНЯЕТ 20260731b, КОТОРУЮ ПРИМЕНЯТЬ НЕЛЬЗЯ.
--
-- ПОВОД — ВОЗРАЖЕНИЕ ВЛАДЕЛЬЦА 01.08, И ЗАМЕР ЕГО ПОДТВЕРДИЛ ПОЛНОСТЬЮ.
-- 20260731b оставляет победителем САМУЮ РАННЮЮ строку (`order by created_at, id`) и
-- написание не проверяет вовсе. Замер по всем 24 группам:
--
--        🔴 24 из 24 — у победителя написание НЕ РОСТЕРНОЕ.
--        Ни одного совпадения. Не случайность, а причинно-следственная связь:
--        июньский кухонный импорт написал «Имя Фамилия» и создал строку РАНЬШЕ;
--        экран ищет по ростерному «Фамилия Имя», не находит, повар отмечает
--        неделю заново — и ростерная строка рождается ПОЗЖЕ. Правило «кто раньше»
--        поэтому систематически выбирает импортную строку.
--
-- ЧЕМ ЭТО КОНЧИЛОСЬ БЫ. Экран индексирует строки по имени — и старый
-- (`MealCountPage.tsx` до f25d55d, `map[r.child_name]`), и СЕГОДНЯШНИЙ
-- (`MealCountPage.tsx:351,365`). Выживи импортное написание — в понедельник неделя
-- покажется пустой:
--   · на СТАРОМ клиенте (Ridge) повар отметит заново → upsert по снятому... нет,
--     пока не снятому ключу создаст НОВУЮ сироту. Чистка воспроизвела бы то, что чистит;
--   · на НОВОМ клиенте новой сироты не будет (sync_meal_marks после 20260731a целится
--     в roster_id), но экран всё равно покажет пустые клетки при отмеченной строке —
--     это ложь экрана, а не порча данных. Тоже недопустимо: повар верит экрану.
--
-- ИСПРАВЛЕНИЕ. Победитель выбирается так:
--     order by (child_name = roster.child_name) desc, created_at, id
-- то есть РОСТЕРНОЕ НАПИСАНИЕ ПОБЕЖДАЕТ ВСЕГДА, и только при равенстве —
-- «кто раньше». Слово владельца дословно: «Где не совпадает — победителем должна
-- стать ростерная строка, а не та, у которой больше отметок».
--
-- ⚠️ ПОДПИСИ ОТ ЭТОГО НЕ СТРАДАЮТ, И ЭТО ПРОВЕРЕНО, А НЕ ПРЕДПОЛОЖЕНО.
-- Подписаны ОБЕ стороны расщепления: импортных строк с подписью 24 из 25,
-- ростерных — 22 из 23. Кто бы ни выжил, проигравший уезжает в архив ДОСЛОВНО
-- вместе с подписью (механика 20260731b §4 сохранена без изменений). Мы не
-- переписываем подписанное — мы добавляем запись о слиянии.
--
-- 🔴 ОДНА ГРУППА ПРАВИЛУ НЕ ПОДЧИНЯЕТСЯ И ТРЕБУЕТ ЧЕЛОВЕКА:
--     Ridge · Orange 2 · неделя 06.07 · Rodriguez-Texidor Izabella
--     ростер:      «Rodriguez- Texidor Izabella»   ← лишний пробел после дефиса
--     строка 1:    «Izabella Rodriguez-Texidor»
--     строка 2:    «Rodriguez-Texidor Izabella»
--     Ростерному написанию не равна НИ ОДНА из двух.
-- Эта группа НАМЕРЕННО пропускается (см. §2) и остаётся расщеплённой. Значит гард
-- 20260731a («расщеплений не осталось») не пропустит ключ, пока человек не решит,
-- что здесь правильно. Так и надо: это вопрос об идентичности ребёнка, а не о SQL.
-- Переименовать подписанную строку под ростер — переписать подписанное; поправить
-- ростер — правка имени ребёнка. Оба варианта требуют слова, и ни один не делается
-- миграцией втихую.
--
-- ВСЁ ОСТАЛЬНОЕ ИЗ 20260731b СОХРАНЕНО ДОСЛОВНО: гард свежести (30 минут), слияние
-- клеток по ИЛИ (greatest), архив проигравших, самопроверка перед коммитом.
-- =====================================================================================

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
      message = format('20260801c ОСТАНОВЛЕН: %s целевых строк правились только что '
                       '(последняя %s). Похоже, директор сейчас работает руками.', _hot, _last),
      hint    = 'Дождаться слова «Татьяна закончила», перечитать группы заново и применить снова.';
  end if;
end $$;

-- ── 1. Архив (та же таблица и те же права, что в 20260731b) ──────────────────
create table if not exists menumaker.meal_week_records_merged (
  like menumaker.meal_week_records including defaults,
  merged_into   uuid        not null,
  merged_at     timestamptz not null default now(),
  merged_by     uuid        default auth.uid(),
  merged_reason text        not null default 'name-split orphan (20260731b)',
  constraint meal_week_records_merged_pkey primary key (id)
);
alter table menumaker.meal_week_records_merged enable row level security;
drop policy if exists org_isolation       on menumaker.meal_week_records_merged;
drop policy if exists module_cacfp_active on menumaker.meal_week_records_merged;
create policy org_isolation on menumaker.meal_week_records_merged
  for all using (core.is_org_member(org_id)) with check (core.is_org_member(org_id));
create policy module_cacfp_active on menumaker.meal_week_records_merged
  for all using (core.org_has_module('cacfp', org_id)) with check (core.org_has_module('cacfp', org_id));
grant select on menumaker.meal_week_records_merged to authenticated;

comment on table menumaker.meal_week_records_merged is
  'Строки недели, слитые в другую строку при починке ключа (20260731b/20260801c). '
  'Хранятся дословно, включая подпись директора: подписанное не переписывают. '
  'В подсчёт питания НЕ входят — их отметки перенесены в строку merged_into.';

-- ── 2. Кто выживает: РОСТЕРНОЕ НАПИСАНИЕ ПЕРВЫМ ──────────────────────────────
-- Группы, где ростерного написания нет НИ У ОДНОЙ строки, исключаются целиком:
-- за них решает человек, а не правило.
-- ⏸ ОТЛОЖЕННЫЕ ДЕТИ — слово владельца 01.08: «схлопывание без Izabella, её случай ждёт».
-- Список ЯВНЫЙ, а не выведенный из разрешимости: после правки ростера её группы стали бы
-- разрешимыми и файл схлопнул бы их молча, вопреки слову. Пропуск обязан быть решением,
-- а не побочным эффектом.
--
-- ⚠️ Групп у неё ДВЕ, а не одна (06.07 и 13.07) — значит схлопывается 22 группы, не 23.
create temporary table _held on commit drop as
select unnest(array['7c3af8ad-f421-4767-b701-59ec08296c8c']::uuid[]) as roster_id;

create temporary table _split on commit drop as
with grp as (
  select m.classroom_id, m.roster_id, m.monday_date
  from menumaker.meal_week_records m
  where m.roster_id is not null
    and m.roster_id not in (select roster_id from _held)   -- ⏸ отложены по слову
  group by 1,2,3 having count(*) > 1
),
rows_in as (
  select m.id, m.classroom_id, m.roster_id, m.monday_date,
         (m.child_name = ro.child_name) as is_roster_spelling, m.created_at
  from menumaker.meal_week_records m
  join grp g using (classroom_id, roster_id, monday_date)
  join menumaker.roster ro on ro.id = m.roster_id
),
resolvable as (   -- только группы, где ростерное написание вообще существует
  select classroom_id, roster_id, monday_date
  from rows_in group by 1,2,3
  having bool_or(is_roster_spelling)
)
select r.id, r.classroom_id, r.roster_id, r.monday_date,
       row_number() over (partition by r.classroom_id, r.roster_id, r.monday_date
                          order by r.is_roster_spelling desc, r.created_at, r.id) as seq
from rows_in r
join resolvable using (classroom_id, roster_id, monday_date);

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

-- Назвать вслух то, что пропущено, ещё ДО записи — молчаливый пропуск читается
-- как «таких не было».
do $$
declare _skipped int;
begin
  select count(*) into _skipped
  from (select classroom_id, roster_id, monday_date
        from menumaker.meal_week_records
        where roster_id is not null
        group by 1,2,3 having count(*) > 1) all_g
  where not exists (select 1 from _keep k
                    where k.classroom_id = all_g.classroom_id
                      and k.roster_id    = all_g.roster_id
                      and k.monday_date  = all_g.monday_date);
  raise notice '20260801c: пропущено групп без ростерного написания: % (решает человек)', _skipped;
end $$;

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
select m.*, d.keep_id, now(), auth.uid(), 'name-split orphan (20260801c)'
from menumaker.meal_week_records m
join _drop d on d.drop_id = m.id
on conflict (id) do nothing;

-- ── 5. …и только теперь уходят из живой сетки ────────────────────────────────
delete from menumaker.meal_week_records m using _drop d where m.id = d.drop_id;

-- ── 6. ДВЕ САМОПРОВЕРКИ ПЕРЕД КОММИТОМ ───────────────────────────────────────
do $$
declare _bad_spelling int; _left int;
begin
  -- (а) НОВАЯ, ради которой этот файл и написан: у каждой выжившей строки из
  --     схлопнутых групп написание обязано совпасть с ростером. Иначе экран её
  --     не найдёт, и мы вернём ровно то, что чинили.
  select count(*) into _bad_spelling
  from _keep k
  join menumaker.meal_week_records m on m.id = k.keep_id
  join menumaker.roster ro on ro.id = m.roster_id
  where m.child_name is distinct from ro.child_name;

  if _bad_spelling > 0 then
    raise exception '20260801c: у % выживших строк написание НЕ ростерное — откат. '
                    'Экран не найдёт такую строку и повар отметит неделю заново.', _bad_spelling;
  end if;

  -- (б) старая: расщеплений среди ОБРАБОТАННЫХ групп не осталось.
  select count(*) into _left
  from (select m.classroom_id, m.roster_id, m.monday_date
        from menumaker.meal_week_records m
        join _keep k on k.classroom_id = m.classroom_id
                    and k.roster_id    = m.roster_id
                    and k.monday_date  = m.monday_date
        group by 1,2,3 having count(*) > 1) q;
  if _left > 0 then
    raise exception '20260801c: после слияния осталось % расщеплённых групп — откат', _left;
  end if;

  raise notice '20260801c: слияние прошло, у всех выживших ростерное написание.';
end $$;

commit;

-- ── VERIFY (read-back после применения; ЧИТАЕТ, НЕ ПИШЕТ) ────────────────────
-- 0) 🔴 ГЛАВНОЕ: у всех выживших написание ростерное — ждём 0
--    select count(*) from menumaker.meal_week_records m
--    join menumaker.roster ro on ro.id = m.roster_id
--    where m.child_name is distinct from ro.child_name;
-- 1) сколько расщеплений осталось (ждём 1 группу — Izabella, решает человек):
--    select count(*) from (select 1 from menumaker.meal_week_records
--      where roster_id is not null group by classroom_id, roster_id, monday_date
--      having count(*)>1) q;
-- 2) архив и подписи в нём:
--    select count(*), count(*) filter (where director_initials is not null)
--    from menumaker.meal_week_records_merged;
-- 3) ТРОЙКА §5.1: итоги июля по трём центрам до/после ·
--    лист Ridge Blue Room 06.07 (16 строк → 14, суммы без двойного счёта) · архив 24/23
--    ⚠️ теперь архив ждать 23, а не 24: группа Izabella пропущена.
