-- 20260727g_transport_smoke_step4_seed.sql
-- PREPARE — НЕ ПРИМЕНЕНО. Запускается по сигналу Николая «дошёл до шага 4», ни секундой раньше.
-- Наполнение шага 4 смоука 2-Т: Alpha и Bravo → Wickliffe Elementary, Charlie → Mater Dei.
--
-- ── ЧЕСТНО О ПРИРОДЕ ЭТОГО ФАЙЛА
-- Это ФИКСТУРА, а не проверка канала. Канон «смоук пишется через настоящий anon-RPC-канал»
-- относится к тому, что мы тестируем, — а тестируем мы ТАПЫ водителя (шаги 3/4/5 гида).
-- Сборка маршрута каналом сегодня не является: поверхности у неё нет ни у офиса, ни у водителя
-- (`driverAddChild` лежит в lib/safepassDevice.ts и не вызывается ни из одного экрана —
-- 0 использований в src/). Поэтому маршрут сажаем фикстурой, и в отчёте о смоуке это
-- называется вслух: шаг 4 проверил тапы, комплектование рейса осталось непроверенным,
-- потому что его не на чем проверять.
--
-- ── ПРЕДУСЛОВИЯ (иначе не запускать)
--  П1. Применён 20260727f — иначе рейс на шаге 2 вообще не создастся (status='in_progress'
--      отбивается CHECK-ом), и сажать будет некуда.
--  П2. Николай на телефоне прошёл шаги 1–2: устройство driver зарегистрировано и рейс ОТКРЫТ.
--      На 27.07 в проде: 0 водительских устройств, 0 рейсов, 0 строк маршрута.
--  П3. Вместимость рейса он ввёл сам; §2.3 — жёсткая норма, и фикстура её НЕ обходит (см. ниже).

-- ══════════════════════════════════════════════════════════════════════════════════
-- §1 ПРЕДПОЛЁТ — ничего не пишет. Показать Николаю, в какой рейс поедут трое.
-- ══════════════════════════════════════════════════════════════════════════════════
select r.id            as run_id,
       r.run_type, r.vehicle, r.vehicle_capacity, r.status,
       r.driver_name, r.departed_at,
       (select count(*) from menumaker.safepass_transport_children x where x.run_id = r.id) as listed_now
  from menumaker.safepass_transport_runs r
 where r.run_date = current_date
   and r.status <> 'completed'
 order by r.created_at desc;
-- Ожидание: РОВНО ОДНА строка — его сегодняшний рейс. Если строк несколько, дальше не идти:
-- взять run_id глазами и подставить его вручную вместо подзапроса в §2.

-- ══════════════════════════════════════════════════════════════════════════════════
-- §2 ПОСАДКА — три строки маршрута. Одним DO, чтобы гейт вместимости работал ЧЕСТНО.
--    Фикстура не имеет права обойти §2.3: если трое не влезают в объявленную вместимость,
--    она ОТКАЗЫВАЕТ словами, а не досаживает молча.
-- ══════════════════════════════════════════════════════════════════════════════════
do $$
declare v_run uuid; v_cap int; v_listed int; v_ins int;
begin
  select r.id, r.vehicle_capacity,
         (select count(*) from menumaker.safepass_transport_children x where x.run_id = r.id)
    into v_run, v_cap, v_listed
    from menumaker.safepass_transport_runs r
   where r.run_date = current_date and r.status <> 'completed'
   order by r.created_at desc
   limit 1;

  if v_run is null then
    raise exception 'НЕТ ОТКРЫТОГО РЕЙСА на сегодня — шаг 2 на телефоне не прошёл. Сажать некуда, ничего не записано.';
  end if;

  if v_listed + 3 > v_cap then
    raise exception 'ОТКАЗ ПО ВМЕСТИМОСТИ (§2.3): в рейсе % мест, уже вписано %, ещё трое не влезают. Второй рейс — не молчаливая досадка. Ничего не записано.', v_cap, v_listed;
  end if;

  insert into menumaker.safepass_transport_children (run_id, child_id, child_name, school_name, status)
  values (v_run, 'ZZSMOKE-ALPHA',   'Alpha (ZZSMOKE)',   'Wickliffe Elementary', 'pending'),
         (v_run, 'ZZSMOKE-BRAVO',   'Bravo (ZZSMOKE)',   'Wickliffe Elementary', 'pending'),
         (v_run, 'ZZSMOKE-CHARLIE', 'Charlie (ZZSMOKE)', 'Mater Dei',            'pending');
  get diagnostics v_ins = row_count;

  raise notice 'ПОСАЖЕНО % в рейс % (мест %, теперь вписано %)', v_ins, v_run, v_cap, v_listed + v_ins;
end $$;

-- ══════════════════════════════════════════════════════════════════════════════════
-- §3 READ-BACK — сразу после §2, ДО того как Николай тапает. Read-back не пишет.
-- ══════════════════════════════════════════════════════════════════════════════════
select x.child_id, x.child_name, x.school_name, x.status, x.boarded_at, x.alighted_at
  from menumaker.safepass_transport_children x
  join menumaker.safepass_transport_runs r on r.id = x.run_id
 where r.run_date = current_date and r.status <> 'completed'
 order by x.school_name, x.child_name;
-- Ожидание: 3 строки, все status='pending'.
--   Mater Dei            · Charlie (ZZSMOKE)
--   Wickliffe Elementary · Alpha (ZZSMOKE)
--   Wickliffe Elementary · Bravo (ZZSMOKE)
-- На телефоне они должны лечь ДВУМЯ группами по школам (§4.1) — Mater Dei выше по алфавиту.
-- Счётчик наверху: «0 из <вместимость> на борту».

-- ══════════════════════════════════════════════════════════════════════════════════
-- §4 ЧТО СМОТРЕТЬ НА ТАПАХ (глазами, на телефоне — это и есть предмет смоука)
-- ══════════════════════════════════════════════════════════════════════════════════
--  1. Тап «On bus» по Alpha → строка становится «on the bus · чч:мм», счётчик 1.
--     ⚠️ Если счётчик остался 0 — слои НЕ сошлись, 20260727f не применён или применён не весь.
--  2. Посадить всех троих → счётчик 3.
--  3. Нажать «Run completed» С ДЕТЬМИ НА БОРТУ → обязан прийти отказ, ИМЕНАМИ:
--     «Still on the bus: Alpha (ZZSMOKE), Bravo (ZZSMOKE), Charlie (ZZSMOKE)».
--     Это Правило №1. Отказ числом вместо имён = дефект.
--  4. Высадить троих («Off») → каждый «off · чч:мм», счётчик 0.
--  5. «Run completed» → проходит.
--  Форс-мажор вместимости (двойной тап → «Board anyway») отдельным заходом: он требует рейса
--  с вместимостью МЕНЬШЕ числа детей, то есть своего рейса. На этом не смешивать.

-- ══════════════════════════════════════════════════════════════════════════════════
-- §5 SWEEP — доказан ДО вставки (канон «доказать delete до insert»).
--    Rollback-проба 27.07: посадка 3 → boarded → delivered → delete → children=0, runs=0.
--    На транспортных таблицах ПЕЧАТИ НЕТ (0 триггеров) — в отличие от enrollment_submissions
--    эти строки удаляются по-настоящему.
-- ══════════════════════════════════════════════════════════════════════════════════
-- Метём ТОЛЬКО фикстуру, по префиксу child_id. Рейс Николая — его решение: оставить как
-- первую живую запись рельса или снести. По умолчанию НЕ трогаем.
--
-- delete from menumaker.safepass_transport_children where child_id like 'ZZSMOKE-%';
--
-- Read-back после sweep (обязателен):
-- select count(*) as zzsmoke_left from menumaker.safepass_transport_children where child_id like 'ZZSMOKE-%';
--   → 0
-- select id, run_type, status, children_count from menumaker.safepass_transport_runs where run_date = current_date;
--   → рейс(ы) Николая; children_count у закрытого рейса покажет 3 — это ЗАСТЫВШИЙ снимок на
--     момент закрытия, он не пересчитывается после sweep и это нормально. Назвать в отчёте.
