-- 20260718b — PREPARE, НЕ ПРИМЕНЁН. Ждёт «go» Николая.
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
-- клеймов нет, гашение claim-безопасно. НО: на 11 паразитных строках висит
-- 19 записей meal_week_records — то есть взрослые СЧИТАЛИСЬ КАК ДЕТИ в превью
-- Highland. Это отдельная находка, гашение её не разгребает: записи остаются,
-- пересчёт превью — решение Николая. Не делаю молча.
-- checkmark export ✅ — экспорт галочек в Sheet эта правка не трогает.
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

begin;

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

-- Страховка: ровно 15, иначе откат.
do $$
declare n int;
begin
  select count(*) into n from menumaker.roster
   where deactivation_reason = 'staff row, not a child (20260718b)';
  if n <> 15 then
    raise exception 'ожидалось 15 погашенных строк, получено %, откат', n;
  end if;
end $$;

commit;
