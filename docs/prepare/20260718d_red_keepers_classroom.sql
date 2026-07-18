-- APPLIED: 2026-07-18  (claim — verify before building on it)
-- READ-BACK: 2/2, 2/2
-- VERIFY:   select count(*) = 2 as keepers_bound_to_red
--             from menumaker.staff st
--             join menumaker.classrooms cl on cl.id = st.classroom_id
--            where st.is_active and cl.name = 'Red'
--              and st.id::text like any (array['84401340%','d98ebb4e%']);
--
-- 20260718d — ПРИМЕНЁН 18.07 (заголовок ниже сохранён как история заявки).
-- Шаг (3) применяй-серии 18.07 — ИДЁТ ПЕРЕД 20260718b.
-- (Нумерация файла не равна порядку применения: серия задана Николаем как
--  a → 20260717e → 20260718 → ЭТОТ → b → c.)
--
-- ЗАЧЕМ: понедельничная репетиция SafePass на Ridge Red — Carolyn + Maureen.
-- Измерено 18.07: обе живые записи staff висят БЕЗ classroom_id, поэтому к
-- классу Red не привязан НИ ОДИН сотрудник, и репетиция упрётся в это первой же
-- минутой. Привязка есть только у их СТАРЫХ, погашенных дублей.
--
--   keeper  84401340 · Carolyn Hercik  · Lead Teacher      · is_active=t · classroom_id=NULL
--   дубль   a8709c0d · Carolyn Hercik  · Lead Teacher      · is_active=f · classroom_id=Red
--   keeper  d98ebb4e · Maureen Minadeo · Assistant Teacher · is_active=t · classroom_id=NULL
--   дубль   6bba6661 · Maureen Minadeo · Assistant Teacher · is_active=f · classroom_id=Red
--
-- Правка переносит привязку с дублей на keeper'ов. Дубли не трогаем — они уже
-- погашены, их classroom_id безвреден.
--
-- Целевой класс: a93a2e02-477c-4deb-8554-37ec2823bf98 = «Red», Ridge,
-- is_roster=true, 9 живых детей. Проверено, а не выведено из имени.
--
-- ⚠️ PIN'ы этим заходом НЕ ставятся. Измерено: pin_hash пуст у ВСЕХ 75 живых
-- сотрудников во всех трёх центрах. PIN обеим — отдельный шаг Николая под своим
-- логином через safepass_set_staff_pin (функция в базе есть). Без PIN привязка
-- к классу репетицию не откроет — это два условия, а не одно.
--
-- READ-BACK ПОСЛЕ ПРИМЕНЕНИЯ (ожидаемо):
--   select first_name, last_name, position, classroom_id, is_active
--     from menumaker.staff where id in
--       ('84401340-0e5f-4bc8-bc90-fbfbfddac6c7','d98ebb4e-b375-4814-9c5a-dc0844f66042');
--     → обе строки classroom_id = a93a2e02-477c-4deb-8554-37ec2823bf98, is_active=t
--   select count(*) from menumaker.staff
--    where classroom_id='a93a2e02-477c-4deb-8554-37ec2823bf98' and is_active;  → 2

begin;

update menumaker.staff set
  classroom_id = 'a93a2e02-477c-4deb-8554-37ec2823bf98',
  updated_at   = now()
where id in (
  '84401340-0e5f-4bc8-bc90-fbfbfddac6c7',  -- Carolyn Hercik  · Lead Teacher
  'd98ebb4e-b375-4814-9c5a-dc0844f66042'   -- Maureen Minadeo · Assistant Teacher
);

-- Страховка: ровно двое живых на Red, иначе откат.
do $$
declare n int;
begin
  select count(*) into n from menumaker.staff
   where classroom_id = 'a93a2e02-477c-4deb-8554-37ec2823bf98' and is_active;
  if n <> 2 then
    raise exception 'ожидалось 2 живых сотрудника на Red, получено %, откат', n;
  end if;
end $$;

commit;

-- ── SELF-CHECK (урок 18.07: do-блок не доехал при вставке) ──────────────────
-- Чисто читающий. Оборвалась вставка → блок не вернёт 2 строки.
select 'keepers on Red' as what,
       (count(*))::text as got, '2' as expect
  from menumaker.staff
 where id in ('84401340-0e5f-4bc8-bc90-fbfbfddac6c7',
              'd98ebb4e-b375-4814-9c5a-dc0844f66042')
   and classroom_id = 'a93a2e02-477c-4deb-8554-37ec2823bf98'
   and is_active
union all
select 'active staff in Red total',
       (count(*))::text, '2'
  from menumaker.staff
 where classroom_id = 'a93a2e02-477c-4deb-8554-37ec2823bf98' and is_active;
