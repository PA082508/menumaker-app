-- APPLIED: 2026-07-18  (claim — verify before building on it)
-- READ-BACK: 0/15/19/0/0
-- VERIFY:   select count(*) = 0 as no_adults_left_in_real_rooms
--             from menumaker.roster r
--             join menumaker.classrooms cl on cl.id = r.classroom_id
--             join menumaker.centers ct on ct.id = r.center_id
--            where ct.name ilike '%highland%' and r.is_active
--              and cl.is_roster and r.birthday < current_date - interval '18 years';
--
-- 20260718b — ПРИМЕНЁН 18.07 (заголовок ниже сохранён как история заявки).
-- Заход (4) применяй-серии 18.07. Решение «C сейчас, A позже, B нет».
--
-- ⚠️ ПОПРАВКА К ФОРМУЛИРОВКЕ ЗАДАЧИ. Просили «пометить 32 строки как не-ростерные
-- в данных». Помечать НЕЧЕМ: в menumaker.roster НЕТ колонки is_roster (проверено
-- по information_schema 18.07). Единственный маркер «не ребёнок» на платформе —
-- classrooms.is_roster=false, т.е. приписка к Staff Room.
--
-- И 32 — не то число, которое нужно трогать. Разбор среза (Highland, is_active,
-- birthday старше 18 лет):
--   32 строки = 15 человек × 2 строки + 2 человека × 1 строка
--   17 из них УЖЕ в Staff Room (is_roster=false) — они корректны, НЕ ТРОГАЕМ
--   15 — паразитные: 11 сидят в НАСТОЯЩИХ группах, 4 без classroom_id
-- Правка касается только этих 15.
--
-- ФОРМА ПРАВКИ. Перевести паразитную строку в Staff Room нельзя — у человека
-- станет две строки в Staff Room, т.е. настоящий дубль. Поэтому паразитная строка
-- гасится (is_active=false + причина), keeper = строка в Staff Room.
-- Строки НЕ удаляются: meal_week_records на них ссылаются, история сохраняется.
--
-- CLAIM-BRIDGE. Проверено 18.07: menumaker.monthly_claims = 0 строк, поданных
-- клеймов нет. На 11 паразитных строках висело 19 записей meal_week_records —
-- взрослые считались как дети в превью Highland. По решению Николая 18.07 они
-- гасятся ЭТИМ ЖЕ заходом (секция 2 ниже), превью Highland пересчитается само.
--
-- ПОЧЕМУ «19» — ТОЧНОЕ ЧИСЛО, И ЧТО ОСТАЁТСЯ. Измерено:
--   menumaker.compute_monthly_claim читает ТОЛЬКО meal_week_records;
--   meal_count_marks она НЕ читает (проверено по pg_get_functiondef).
-- Поэтому claim-релевантных записей ровно 19, число Николая подтверждается.
-- ⚠️ НО на тех же строках висит 273 записи meal_count_marks (на 10 строках из 15).
-- Их НЕ трогаем: в клейм они не входят, а после гашения roster-строк из сетки
-- (v_meal_grid фильтрует по is_active) человек пропадает, и отметки становятся
-- висячими и безвредными. Число 273 фиксирую, чтобы оно не всплыло сюрпризом.
--
-- ГАСИМ, НЕ УДАЛЯЕМ: status='archived' уже разрешён CHECK-ограничением
-- meal_week_records_status_check ('open','cook_signed','director_approved',
-- 'archived') — схему менять не требуется, история сохраняется.
-- Все 19 записей проверены: status='open', НИ ОДНОЙ подписи повара или
-- директора, period_month и week_range пусты. Подписанное не трогается.
--
-- checkmark export ✅ — экспорт галочек в Sheet идёт по живым roster-строкам
-- настоящих детей; ни одна из них этим заходом не затронута. Страховка на это
-- зашита в секцию 3.
--
-- A (полный перенос roster→staff) — в бэклоге, отдельным заходом.
--
-- READ-BACK ПОСЛЕ ПРИМЕНЕНИЯ (ожидаемо):
--   пикер Highland: было 119 → станет 119 − 17 (Staff Room, уже режет код правки)
--                                      − 15 (эти строки) = 87 живых детей
--   select count(*) from menumaker.roster r join menumaker.centers c on c.id=r.center_id
--     where c.name='Play Academy Highland Heights' and r.is_active
--       and r.birthday < current_date - interval '18 years'
--       and coalesce((select cl.is_roster from menumaker.classrooms cl
--                     where cl.id=r.classroom_id), true);              → 0
--   select count(*) from menumaker.roster where deactivation_reason
--     = 'staff row, not a child (20260718b)';                          → 15
--   select status, count(*) from menumaker.meal_week_records
--     where roster_id in (<те же 15>) group by 1;                      → archived | 19
--   select count(*) from menumaker.monthly_claims;                     → 0 (не изменилось)

begin;

-- ── 1. Паразитные roster-строки ──────────────────────────────────────────────
update menumaker.roster set
  is_active            = false,
  deactivated_at       = now(),
  deactivation_reason  = 'staff row, not a child (20260718b)',
  updated_at           = now()
where id in (
  -- 11 паразитных строк в настоящих группах (человек · др · комната · meal-записей)
  '62b2877d-68d4-4c6f-8863-2816db7d6cab',  -- Arkramova Shakhlo         · 1997-10-21 · Green Room    · 2
  '3527dbfb-6f31-4cae-9a3a-8f36f64cc8dc',  -- Chernikova Tetiana        · 1993-04-22 · Orange 1 Room · 0
  '231fea0e-23d7-4de4-a7d0-2ae556a344f4',  -- Ellis Kathryn             · 1999-05-15 · SA Room       · 2
  '1e811825-79c4-402e-92cc-4e1d568b96ee',  -- Ford Sierra               · 1995-01-14 · Blue Room     · 2
  '11200bde-ecfb-483d-afe1-76fb55851c9e',  -- Haislah Tiemia            · 2001-10-29 · Blue Room     · 2
  'c2d0b09f-1937-4235-85c8-b3f2eabd0a01',  -- Kalantarou Gunay          · 1987-11-11 · Red Room      · 1
  'c774cfc1-ef4c-4017-81ca-7d92c673bf43',  -- Marlin Ameerah            · 2007-01-09 · Blue Room     · 2
  '06b5ac0e-1e5d-404c-9176-4ea654ad8197',  -- Rodriguez Gabriela Idalies· 2003-03-30 · Green Room    · 2
  '70955e7c-b431-4c3a-867b-35308159fcb6',  -- Uchitel Angela            · 1995-11-11 · Purple Room   · 2
  '8358eeaf-cf27-4df8-be06-3996ed5bf3bd',  -- Wadley Kayari             · 2007-05-23 · Orange 2 Room · 2
  '91abba45-e50f-4970-9e3b-13cc8e4b0f11',  -- Wilson-Triplett Deborah   · 1962-07-26 · Purple Room   · 2
  -- 4 паразитные строки без группы (classroom_id is null)
  'cf212157-efeb-4fd6-9c44-9305a9310156',  -- Ashrabkodjaeva Diloramkhon· 1973-11-05 · (нет группы)  · 0
  'b999073b-fd9d-4755-a0f5-1e345b7e3c4f',  -- Johnson Janay             · 2000-08-06 · (нет группы)  · 0
  '93bfab5f-0512-4227-bba7-b46e39f896c1',  -- Rolf Theresa              · 1986-01-30 · (нет группы)  · 0
  '9c47d962-bf24-417b-96aa-edf150831abf'   -- Volynska Svitlana         · 1970-10-18 · (нет группы)  · 0
);

-- ── 2. Их meal-записи: 19 штук, в архив ──────────────────────────────────────
-- Условие status='open' — намеренно: если к моменту применения кто-то успел
-- подписать запись, она НЕ гасится, и страховка ниже остановит заход.
update menumaker.meal_week_records set
  status     = 'archived',
  updated_at = now()
where status = 'open'
  and roster_id in (select id from menumaker.roster
                     where deactivation_reason = 'staff row, not a child (20260718b)');

-- ── 3. Страховки: точные числа, иначе откат ─────────────────────────────────
do $$
declare n_rows int; n_meals int; n_left int; n_claims int;
begin
  select count(*) into n_rows from menumaker.roster
   where deactivation_reason = 'staff row, not a child (20260718b)';
  if n_rows <> 15 then
    raise exception 'ожидалось 15 погашенных roster-строк, получено %, откат', n_rows;
  end if;

  select count(*) into n_meals from menumaker.meal_week_records
   where status = 'archived'
     and roster_id in (select id from menumaker.roster
                        where deactivation_reason = 'staff row, not a child (20260718b)');
  if n_meals <> 19 then
    raise exception 'ожидалось 19 архивированных meal-записей, получено %, откат', n_meals;
  end if;

  -- Ничего не должно остаться неархивированным: непустой остаток = кто-то
  -- подписал запись сотрудника, это разбирается руками, а не молча.
  select count(*) into n_left from menumaker.meal_week_records
   where status <> 'archived'
     and roster_id in (select id from menumaker.roster
                        where deactivation_reason = 'staff row, not a child (20260718b)');
  if n_left <> 0 then
    raise exception 'осталось % неархивированных meal-записей (подписаны?), откат', n_left;
  end if;

  -- checkmark export ✅ — поданных клеймов не было и не появилось.
  select count(*) into n_claims from menumaker.monthly_claims;
  if n_claims <> 0 then
    raise exception 'monthly_claims стало % — заход рассчитан на 0, откат', n_claims;
  end if;
end $$;

commit;

-- ── SELF-CHECK (урок 18.07: do-блок не доехал при вставке) ──────────────────
-- Чисто читающий. Оборвалась вставка → блок не вернёт 5 строк.
select 'adults left in real Highland rooms' as what,
       (count(*))::text as got, '0' as expect
  from menumaker.roster r
  join menumaker.centers c on c.id = r.center_id
 where c.name = 'Play Academy Highland Heights'
   and r.is_active
   and r.birthday < current_date - interval '18 years'
   and coalesce((select cl.is_roster from menumaker.classrooms cl
                  where cl.id = r.classroom_id), true)
union all
select 'roster rows deactivated by 20260718b',
       (count(*))::text, '15'
  from menumaker.roster
 where deactivation_reason = 'staff row, not a child (20260718b)'
union all
select 'their meal_week_records archived',
       (count(*))::text, '19'
  from menumaker.meal_week_records
 where status = 'archived'
   and roster_id in (select id from menumaker.roster
                      where deactivation_reason = 'staff row, not a child (20260718b)')
union all
-- Непустой остаток = кто-то успел подписать meal-запись сотрудника: разбирать руками.
select 'their meal rows left UNarchived',
       (count(*))::text, '0'
  from menumaker.meal_week_records
 where status <> 'archived'
   and roster_id in (select id from menumaker.roster
                      where deactivation_reason = 'staff row, not a child (20260718b)')
union all
select 'monthly_claims (claim-bridge)',
       (count(*))::text, '0'
  from menumaker.monthly_claims;
