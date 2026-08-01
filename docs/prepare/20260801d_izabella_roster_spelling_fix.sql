-- =====================================================================================
-- 20260801d — ОПЕЧАТКА В ФАМИЛИИ: «Rodriguez- Texidor» → «Rodriguez-Texidor».
--             ⚠️⚠️ НЕ ПРИМЕНЕНО. Идёт ПЕРЕД 20260801c (схлопывание).
--
-- ПОЧЕМУ МИГРАЦИЕЙ, А НЕ КАРТОЧКОЙ. `roster.child_name` сегодня — КЛЮЧ, а не подпись,
-- и `stripStoredKey` (src/lib/rosterKey.ts) вырезает его из любой правки с экрана.
-- Карточкой это не чинится ПО ЗАМЫСЛУ. Показательно, что в тесте того самого гарда
-- примером стоит именно эта девочка — шрам известный.
--
-- ПОЧЕМУ ЭТО ОПЕЧАТКА, А НЕ ВАРИАНТ НАПИСАНИЯ — два довода:
--   · у родного брата в том же центре фамилия записана чисто: `Rodriguez-Texidor Juan`
--     (roster dcf511fd…, комната Rainbow);
--   · во всём ростере трёх центров это ЕДИНСТВЕННАЯ строка с пробелом у дефиса или
--     двойным пробелом. Замер: 1 из 1. Семейства в ростере нет.
--
-- ⚠️ ГЛАВНАЯ ОПАСНОСТЬ, НАЗВАННАЯ ВЛАДЕЛЬЦЕМ, И ОНА РЕАЛЬНА.
-- Экран ищет строку недели по `roster.child_name`. Поправить ростер и не тронуть сетку —
-- значит ОСИРОТИТЬ все строки со старым написанием: они есть в базе, дают деньги, но на
-- экране исчезают. У этой девочки таких строк ШЕСТЬ, и две из них — ТЕКУЩИЕ НЕДЕЛИ
-- (20.07 и 27.07, 28 отметок). Поэтому правка ростера и приведение строк идут ОДНИМ файлом.
--
-- ПОЛНАЯ КАРТИНА (замер 01.08, 10 строк недели, ТРИ написания):
--
--  неделя  | написание в сетке              | сейчас | после | статус            | отметок
--  --------|--------------------------------|--------|-------|-------------------|--------
--  06-01   | Izabella Rodriguez-Texidor     |   ✗    |   ✗   | open              |   17
--  06-08   | Izabella Rodriguez-Texidor     |   ✗    |   ✗   | open              |   13
--  06-15   | Izabella Rodriguez-Texidor     |   ✗    |   ✗   | open              |   15
--  06-22   | Izabella Rodriguez-Texidor     |   ✗    |   ✗   | open              |    1
--  07-06   | Izabella Rodriguez-Texidor     |   ✗    |   ✗   | ПОДПИСАНА STR     |    2   ← проигравшая
--  07-06   | Rodriguez-Texidor Izabella     |   ✗    |  ✅   | ПОДПИСАНА STR     |   12   ← выживает
--  07-13   | Rodriguez-Texidor Izabella     |   ✗    |  ✅   | ПОДПИСАНА STR     |   15   ← выживает
--  07-13   | Rodriguez- Texidor Izabella    |  ✅    |   ✗   | ПОДПИСАНА STR     |   17   ← проигравшая
--  07-20   | Rodriguez- Texidor Izabella    |  ✅    |   ✗   | open              |   14   ← ОСИРОТЕЛА БЫ
--  07-27   | Rodriguez- Texidor Izabella    |  ✅    |   ✗   | open              |   14   ← ОСИРОТЕЛА БЫ
--
-- 🔴 ПОПУТНАЯ НАХОДКА: расщеплённых групп у неё ДВЕ, а не одна — 06.07 И 13.07.
--    В обзоре 24 групп они обе есть; неразрешимой была только 06.07. После этой правки
--    разрешимы обе, и ВСЕ 24 группы становятся схлопываемыми. Архив ждать 24.
--
-- ЧЕГО ЭТОТ ФАЙЛ НЕ ДЕЛАЕТ, И ЭТО ГЛАВНОЕ ОГРАНИЧЕНИЕ:
--   ⛔ НЕ ТРОГАЕТ НИ ОДНОЙ ПОДПИСАННОЙ СТРОКИ. Подписанное не переписывают. Четыре
--      подписанные строки (07-06 ×2, 07-13 ×2) остаются как есть; две из них выживут уже
--      с чистым написанием, две уедут в архив дословно при схлопывании 20260801c.
--   ⛔ НЕ ТРОГАЕТ отметок, дат, статусов и денег. Меняется ТОЛЬКО текст имени.
--
-- ИЮНЬСКИЕ СТРОКИ (06-01…06-22) приводятся тоже. Они и сегодня осиротевшие — их
-- написание `Izabella Rodriguez-Texidor` не совпадало с ростером НИКОГДА, поэтому июнь
-- этой девочки на экране не виден вовсе. Правка их не осиротит, а вернёт. Если июнь
-- решено не трогать — убрать `monday_date < '2026-07-01'` из §3 одной строкой.
-- Июнь по Ridge уже подан из старой программы; текст имени поданного не меняет.
-- =====================================================================================

begin;

-- ── 0. ГАРД СВЕЖЕСТИ — не работать поверх живых рук ──────────────────────────
do $$
declare _hot int;
begin
  select count(*) into _hot from menumaker.meal_week_records
  where roster_id = '7c3af8ad-f421-4767-b701-59ec08296c8c'
    and updated_at > now() - interval '30 minutes';
  if _hot > 0 then
    raise exception '20260801d ОСТАНОВЛЕН: % строк этой девочки правились только что', _hot;
  end if;
end $$;

-- ── 1. ГАРД СОСТОЯНИЯ — fail-closed, если мир уже не тот ─────────────────────
-- Если кто-то поправил ростер до нас, файл не должен «на всякий случай» отработать
-- вхолостую: он обязан сказать, что применён не к тому состоянию.
do $$
declare _n int;
begin
  select count(*) into _n from menumaker.roster
  where id = '7c3af8ad-f421-4767-b701-59ec08296c8c'
    and child_name = 'Rodriguez- Texidor Izabella'
    and last_name  = 'Rodriguez- Texidor'
    and first_name = 'Izabella';
  if _n <> 1 then
    raise exception '20260801d ОСТАНОВЛЕН: ростерная строка не в ожидаемом состоянии '
                    '(нашли %). Перечитать замер и переписать файл.', _n;
  end if;
end $$;

-- ── 2. Правка ростера: обе колонки согласованно ──────────────────────────────
-- `child_name` в этом центре собран как «Фамилия Имя»; сохраняем ту же форму,
-- меняем ТОЛЬКО фамилию. Иначе починка опечатки завела бы вторую опечатку.
update menumaker.roster
set last_name  = 'Rodriguez-Texidor',
    child_name = 'Rodriguez-Texidor Izabella',
    updated_at = now()
where id = '7c3af8ad-f421-4767-b701-59ec08296c8c';

-- ── 3. Привести НЕПОДПИСАННЫЕ строки недели к новому написанию ───────────────
-- Условие `director_initials is null and status <> 'director_approved'` — не
-- перестраховка, а канон: подпись замораживает строку целиком, включая её текст.
update menumaker.meal_week_records
set child_name = 'Rodriguez-Texidor Izabella',
    updated_at = now()
where roster_id = '7c3af8ad-f421-4767-b701-59ec08296c8c'
  and child_name <> 'Rodriguez-Texidor Izabella'
  and director_initials is null
  and status is distinct from 'director_approved';

-- ── 4. САМОПРОВЕРКИ ПЕРЕД КОММИТОМ ───────────────────────────────────────────
do $$
declare _orphan int; _signed_touched int; _groups int;
begin
  -- (а) ни одна НЕПОДПИСАННАЯ строка не осиротела
  select count(*) into _orphan
  from menumaker.meal_week_records m
  join menumaker.roster ro on ro.id = m.roster_id
  where m.roster_id = '7c3af8ad-f421-4767-b701-59ec08296c8c'
    and m.director_initials is null
    and m.status is distinct from 'director_approved'
    and m.child_name <> ro.child_name;
  if _orphan > 0 then
    raise exception '20260801d: % неподписанных строк осиротели — откат', _orphan;
  end if;

  -- (б) подписанных строк ровно 4 и все целы (текст не тронут)
  select count(*) into _signed_touched
  from menumaker.meal_week_records
  where roster_id = '7c3af8ad-f421-4767-b701-59ec08296c8c'
    and director_initials is not null;
  if _signed_touched <> 4 then
    raise exception '20260801d: подписанных строк % вместо 4 — откат', _signed_touched;
  end if;

  -- (в) обе её расщеплённые группы стали разрешимыми: в каждой есть строка
  --     с ростерным написанием
  select count(*) into _groups
  from (select m.classroom_id, m.roster_id, m.monday_date
        from menumaker.meal_week_records m
        join menumaker.roster ro on ro.id = m.roster_id
        where m.roster_id = '7c3af8ad-f421-4767-b701-59ec08296c8c'
        group by 1,2,3
        having count(*) > 1 and not bool_or(m.child_name = ro.child_name)) q;
  if _groups > 0 then
    raise exception '20260801d: % групп остались неразрешимыми — откат', _groups;
  end if;

  raise notice '20260801d: опечатка исправлена, сирот нет, подписи целы.';
end $$;

commit;

-- ── VERIFY (read-back; ЧИТАЕТ, НЕ ПИШЕТ) ─────────────────────────────────────
-- 1) ростер: ждём «Rodriguez-Texidor Izabella» / «Rodriguez-Texidor»
--    select '['||child_name||']', '['||last_name||']' from menumaker.roster
--    where id='7c3af8ad-f421-4767-b701-59ec08296c8c';
-- 2) все 10 строк недели с написаниями — ждём: 6 приведены, 4 подписанные как были
--    select monday_date, '['||child_name||']', status, director_initials
--    from menumaker.meal_week_records
--    where roster_id='7c3af8ad-f421-4767-b701-59ec08296c8c' order by monday_date, created_at;
-- 3) сирот по ВСЕМУ ростеру не прибавилось (справочно, до/после):
--    select count(*) from menumaker.meal_week_records m
--    join menumaker.roster ro on ro.id=m.roster_id where m.child_name <> ro.child_name;
-- 4) групп к схлопыванию — ждём 24, и все разрешимые:
--    см. 20260801c, шаг «пропущено групп без ростерного написания» — ждём 0.
