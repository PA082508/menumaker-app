-- ============================================================================
-- 20260719d — ZZZSMOKE: тест-ребёнок в Red + доверенное лицо на тест-номер
-- PREPARED 2026-07-19 · NOT APPLIED · ЖИВЁТ ОДИН ВЕЧЕР
--
-- ⚠️ ЭТО ЗАПИСЬ В ЖИВОЙ РОСТЕР РАБОТАЮЩЕГО ЦЕНТРА. Не в песочницу.
--    Ребёнок ZZZSMOKE появится в Ridge / Red наравне с настоящими девятью:
--    в Meal Count, в превью клейма, в списках воспитателя. Пока он там —
--    цифры Ridge за 19.07 содержат несуществующего ребёнка.
--    Claim-bridge invariant защищён до 1 октября: строка ОБЯЗАНА быть удалена
--    сегодня же вечером, до того как кто-либо отметит приём пищи.
--    Имя выбрано так, чтобы сортировка выбрасывала его в самый низ списка и
--    он бросался в глаза — ZZZ не бывает у настоящих детей.
--
-- ЗАЧЕМ. Ни одно из 4 существующих доверенных лиц не привязано к ребёнку Red
-- (они в Orange 2 / Purple / Green ×2). Планшет заряжен на Red, значит заявка
-- обязана прийти от ребёнка Red — иначе очередь пуста и тестировать нечего.
--
-- ТЕЛЕФОН +19999999999 выбран не случайно: это тестовый номер с фиксированным
-- кодом 123456 в SafePassParentPage.tsx. OTP генерируется в браузере родителя
-- и печатается в console, а на iPhone консоли нет — без фиксированного кода
-- войти физически невозможно. Бэкдор снимается тем же вечером.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- §1 Предполёт — ничего не пишет. Убедиться, что ZZZSMOKE ещё нет.
-- ---------------------------------------------------------------------------
select
  (select count(*) from menumaker.roster where child_name like 'ZZZSMOKE%')                 as roster_rows_now,
  (select count(*) from menumaker.safepass_trusted_persons where child_name like 'ZZZSMOKE%') as trusted_rows_now,
  (select count(*) from menumaker.roster r
     join menumaker.classrooms cl on cl.id=r.classroom_id
    where cl.name='Red' and cl.center_id='4aed7d5a-00d0-4a4c-ac99-311046ad2027'
      and r.is_active)                                                                       as red_kids_before;
-- ожидаем: 0 · 0 · 9

-- ---------------------------------------------------------------------------
-- §2 Вставка. Пишет. Обе строки одной транзакцией — половина пары бесполезна.
-- ---------------------------------------------------------------------------
begin;

with ids as (
  select ct.org_id, ct.id as center_id, cl.id as classroom_id
    from menumaker.centers ct
    join menumaker.classrooms cl on cl.center_id = ct.id and cl.name = 'Red'
   where ct.name ilike '%ridge%'
), kid as (
  -- org_id ОБЯЗАТЕЛЕН, хотя колонка nullable: v_meal_grid фильтрует
  -- core.is_org_member(r.org_id), и с NULL ребёнок стал бы невидим на планшете
  -- (ростер воспитателя читается именно через эту вьюху). Вставка прошла бы
  -- молча, а тест сорвался бы на пустом списке.
  insert into menumaker.roster (org_id, center_id, classroom_id, child_name, first_name, last_name, is_active)
  select org_id, center_id, classroom_id, 'ZZZSMOKE Testchild', 'ZZZSMOKE', 'Testchild', true
    from ids
  returning id, org_id, center_id, child_name
)
insert into menumaker.safepass_trusted_persons
  (org_id, center_id, child_id, child_name, person_name, phone,
   relationship, authorized_by, access_type, is_active)
select kid.org_id, kid.center_id, kid.id::text, kid.child_name,
       'HOME TEST Parent', '+19999999999',
       'parent', 'home-test-19.07', 'permanent', true
  from kid
returning child_id as zzzsmoke_child_id, child_name, person_name, phone;

commit;

-- ---------------------------------------------------------------------------
-- §3 Read-back — вердикт колонками (Case 5), ничего не пишет.
-- ---------------------------------------------------------------------------
select
  r.child_name,
  cl.name = 'Red'                                     as in_red_room,
  r.is_active                                         as child_active,
  tp.phone = '+19999999999'                           as phone_is_test_number,
  tp.is_active                                        as trusted_active,
  tp.child_id = r.id::text                            as link_intact,
  r.org_id is not null                                as org_id_set
from menumaker.roster r
  join menumaker.classrooms cl on cl.id = r.classroom_id
  join menumaker.safepass_trusted_persons tp on tp.child_id = r.id::text
where r.child_name like 'ZZZSMOKE%';
-- ожидаем одну строку, все пять булевых = true

-- Проверка со стороны RPC (после применения 20260719b): ребёнок виден по телефону
-- и несёт НАСТОЯЩУЮ комнату, а не org-uuid:
-- select menumaker.safepass_children_for_phone('+19999999999');
--   → в children есть ZZZSMOKE с classroom_name = 'Red'

-- ============================================================================
-- §4 ЧИСТКА — ВЕЧЕРОМ 19.07, ОБЯЗАТЕЛЬНО. SELECT → DELETE → SELECT.
--     Отдельная строка вечернего чек-листа, рядом с отзывом токена и снятием
--     бэкдора. Порядок удаления обратный вставке: сначала заявки, потом
--     доверенное лицо, потом ребёнок — иначе останутся висячие ссылки.
-- ============================================================================

-- 4a. ЧТО удаляем — посмотреть перед тем, как удалять
select 'sessions' as what, count(*) from menumaker.safepass_sessions      where child_name like 'ZZZSMOKE%'
union all
select 'trusted',          count(*) from menumaker.safepass_trusted_persons where child_name like 'ZZZSMOKE%'
union all
select 'roster',           count(*) from menumaker.roster                 where child_name like 'ZZZSMOKE%';

-- 4b. DELETE
begin;
  delete from menumaker.safepass_sessions        where child_name like 'ZZZSMOKE%';
  delete from menumaker.safepass_trusted_persons where child_name like 'ZZZSMOKE%';
  delete from menumaker.roster                   where child_name like 'ZZZSMOKE%';
commit;

-- 4c. КОНТРОЛЬ — три нуля и вернувшиеся 9 детей Red
select
  (select count(*) from menumaker.safepass_sessions      where child_name like 'ZZZSMOKE%') as sessions_left,
  (select count(*) from menumaker.safepass_trusted_persons where child_name like 'ZZZSMOKE%') as trusted_left,
  (select count(*) from menumaker.roster                 where child_name like 'ZZZSMOKE%') as roster_left,
  (select count(*) from menumaker.roster r
     join menumaker.classrooms cl on cl.id=r.classroom_id
    where cl.name='Red' and cl.center_id='4aed7d5a-00d0-4a4c-ac99-311046ad2027'
      and r.is_active)                                                                       as red_kids_after;
-- ожидаем: 0 · 0 · 0 · 9   ← red_kids_after ОБЯЗАН совпасть с red_kids_before из §1
-- ============================================================================
