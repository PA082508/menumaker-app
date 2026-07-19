-- ============================================================================
-- 20260719f — SafePass: заселить trusted_persons из enrollment (Red pilot)
-- PREPARED 2026-07-19 · NOT APPLIED · нужен go
--
-- ЗАЧЕМ. trusted_persons для Red был пуст (9 нулей) — вход родителя невозможен.
-- Но телефоны УЖЕ в базе: вкладка Family = guardian + child_guardian. Значит не
-- ручной сбор, а миграция.
--
-- МОСТ (измерен, не угадан): child_guardian.child_id → child.id (НЕ roster.id).
-- roster ↔ child связаны через roster.child_id = child.id (uuid). У 7 из 9 Red
-- это поле заполнено; у Kendzierski Colton оно NULL, но имя совпадает с child —
-- мостим по имени как запас. У Graves Tristan НЕТ ни моста, ни guardian — см. §0.
--
-- ЧТО БЕРЁМ: только can_pickup IS TRUE (гейт «кто вправе забирать»), не каждый
-- family-row. Дедуп по (ребёнок, нормализованный телефон): один номер на двоих
-- сиблингов (Bryant Jackson у обоих Bates) даёт ДВЕ строки — по одной на ребёнка,
-- это правильно, так children_for_phone вернёт обоих.
--
-- ТЕЛЕФОН: в enrollment формат РАЗНЫЙ — часть E.164 (+12166477477), часть голые
-- 10 цифр (4407855178 у Adam Kendzierski, 8636771120 у Quorey Payne). Клиент на
-- входе делает '+1'||last10 (normPhone). Мигрируем ТАК ЖЕ: '+1'||last10 — тогда
-- то, что в таблице, совпадёт с тем, что родитель введёт, при любом его вводе
-- (скобки/пробелы/со «+1»/без). Сухой прогон: 22 строки, 0 отброшено.
--
-- honest-маркер происхождения (бэклог-пункт про authorized_by применён здесь):
--   authorized_by = 'migrated-from-enrollment-20260719'
-- — по нему эти строки всегда отличимы от ручных и от демо ('system').
--
-- ⚠️ §0 РЕШЕНИЯ ДЛЯ НИКОЛАЯ (не блокируют вставку, но знать до запуска):
--   1. Graves Tristan — 0 pickup-контактов в enrollment. В SafePass войти
--      некому. Нужно: завести guardian во вкладке Family и повторить миграцию
--      только для него. Он НЕ попадёт в эти 22 строки — это честно, не тихо.
--   2. Широта: у Laylanii Robinson 6 pickup-взрослых, у Roman Guarnera 5. Все
--      получат вход в SafePass и смогут инициировать передачу. Это следствие
--      «берём всех ✓Pickup». Если для ВХОДА нужно уже родителей (а pickup
--      оставить шире) — скажи, сузим по ordinal/role. Сейчас — как заказано.
-- ============================================================================

begin;

with red as (
  select r.id as roster_id, r.org_id, r.center_id, r.child_name, r.child_id,
         r.first_name, r.last_name
  from menumaker.roster r
  join menumaker.classrooms cl on cl.id = r.classroom_id
  where cl.name = 'Red' and cl.center_id = '4aed7d5a-00d0-4a4c-ac99-311046ad2027'
    and r.is_active and r.child_name not like 'ZZZSMOKE%'
),
bridged as (
  select red.*, c.id as child_pk
  from red
  left join menumaker.child c
    on c.id = red.child_id
    or (red.child_id is null
        and lower(c.first_name) = lower(red.first_name)
        and lower(c.last_name)  = lower(red.last_name))
),
pickups as (
  select distinct on (b.roster_id, phone_norm)
         b.org_id, b.center_id, b.roster_id, b.child_name,
         g.first_name || ' ' || g.last_name as person_name,
         coalesce(nullif(btrim(cg.relationship), ''), 'Guardian') as relationship,
         '+1' || right(regexp_replace(
                   coalesce(g.mobile_phone, g.phone_1, g.phone_2), '\D', '', 'g'), 10) as phone_norm
  from bridged b
  join menumaker.child_guardian cg on cg.child_id = b.child_pk and cg.can_pickup is true
  join menumaker.guardian g on g.id = cg.guardian_id
  where length(regexp_replace(
          coalesce(g.mobile_phone, g.phone_1, g.phone_2), '\D', '', 'g')) >= 10
  order by b.roster_id, phone_norm, cg.ordinal nulls last
)
insert into menumaker.safepass_trusted_persons
  (org_id, center_id, child_id, child_name, person_name, phone,
   relationship, authorized_by, access_type, is_active)
select p.org_id, p.center_id, p.roster_id::text, p.child_name, p.person_name, p.phone_norm,
       p.relationship, 'migrated-from-enrollment-20260719', 'permanent', true
from pickups p
-- идемпотентность: не дублировать при повторном прогоне
where not exists (
  select 1 from menumaker.safepass_trusted_persons tp
   where tp.child_id = p.roster_id::text and tp.phone = p.phone_norm and tp.is_active
);

commit;

-- ---------------------------------------------------------------------------
-- READ-BACK (вердикт колонками, Case 5). Всё только читает.
-- ---------------------------------------------------------------------------

-- R1. parent_links у каждого ребёнка Red — та же проверка, что дала 9 нулей.
--     Теперь ждём ≥1 у восьми; Graves Tristan останется 0 (флаг §0.1).
select r.child_name,
       (select count(*) from menumaker.safepass_trusted_persons tp
         where tp.child_id = r.id::text and tp.is_active) as parent_links
from menumaker.roster r
join menumaker.classrooms cl on cl.id = r.classroom_id
where cl.name = 'Red' and cl.center_id = '4aed7d5a-00d0-4a4c-ac99-311046ad2027'
  and r.is_active and r.child_name not like 'ZZZSMOKE%'
order by parent_links, r.child_name;
-- ожидаем: Graves Tristan = 0 (единственный), остальные ≥ 1

-- R2. сводка: сколько детей покрыто, сколько строк всего мигрировано
select
  count(*) filter (where links >= 1) as covered_children,   -- ждём 8
  count(*) filter (where links = 0)  as uncovered_children,  -- ждём 1 (Graves)
  (select count(*) from menumaker.safepass_trusted_persons
    where authorized_by = 'migrated-from-enrollment-20260719') as rows_migrated  -- ждём 22
from (
  select r.id, (select count(*) from menumaker.safepass_trusted_persons tp
                 where tp.child_id = r.id::text and tp.is_active) as links
  from menumaker.roster r join menumaker.classrooms cl on cl.id=r.classroom_id
  where cl.name='Red' and cl.center_id='4aed7d5a-00d0-4a4c-ac99-311046ad2027'
    and r.is_active and r.child_name not like 'ZZZSMOKE%'
) x;

-- R3. МНОГОДЕТНАЯ ветка на реальных данных: телефон Deidra Booker должен вернуть
--     ОБОИХ сиблингов Bates (Khaza И Kylie) с настоящей комнатой Red.
select jsonb_array_length(menumaker.safepass_children_for_phone('+12166323285') -> 'children') as bates_children_count,
       (menumaker.safepass_children_for_phone('+12166323285') ->> 'ok') = 'true'               as ok,
       exists(select 1 from jsonb_array_elements(
                menumaker.safepass_children_for_phone('+12166323285') -> 'children') e
              where e->>'child_name' like 'Bates%' and e->>'classroom_name'='Red')             as bates_in_red;
-- ожидаем: 2 · true · true
-- ============================================================================
