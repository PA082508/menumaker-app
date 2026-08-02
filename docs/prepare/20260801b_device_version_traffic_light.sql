-- =====================================================================================
-- СВЕТОФОР ГОТОВНОСТИ УСТРОЙСТВ — ГЕЙТ МИГРАЦИИ КЛЮЧА (20260731a).
-- Read-only. Ничего не пишет. Запускать перед КАЖДЫМ разговором о ключе.
--
-- УСЛОВИЕ ВЛАДЕЛЬЦА (01.08): не «Ridge обновили», а «КАЖДОЕ отмечающее устройство
-- отчиталось свежим app_version». Пока хоть одна строка не 🟢 (или ⚪) — ключ не идёт.
--
-- ⚠️ ЧЕТВЁРТОЕ СОСТОЯНИЕ ЕСТЬ НЕ ДЛЯ КРАСОТЫ. Клиент, шлющий версию, выкачен
--    31.07 в 22:09 UTC, а последняя отметка на тот момент была сделана в 20:24 UTC —
--    РАНЬШЕ выкатки. Значит «версии нет» может означать «устройство ещё не
--    отмечало после выкатки», а НЕ «устройство старое». Без отдельного состояния
--    светофор в первый же день показал бы семь красных, которых нет, — та же
--    ошибка, что читать ноль Ridge как «никто не отмечает вовремя».
--
-- ── ПРАВКА 02.08: ОТСЕЧКА БРАУЗЕРА ПРОВЕРОК — ПО ПРИЗНАКУ УСТРОЙСТВА ──────────
-- БЫЛО: `marks_total <= 10`. Это отсечка по ОБЪЁМУ, и она сломалась в первый же
-- день работы детектора: 02.08 браузер проверок накопил 40 отметок в Highland,
-- перерос порог и стал считаться настоящим планшетом — да ещё и 🟢, потому что
-- версию он как раз шлёт. Числитель гейта соврал в лучшую сторону.
--
-- СТАЛО: признак самого устройства — В СКОЛЬКИХ ЦЕНТРАХ оно отмечалось.
-- Классный планшет физически стоит в одной кухне и живёт в одном центре;
-- браузер, которым проверяют, ходит по всем. Замер 02.08:
--     3101265a… — 3 центра, 5 комнат   ← браузер проверок
--     остальные 8 — ровно по 1 центру  ← рабочие планшеты
-- Признак не зависит от объёма и не протухает от того, что проверяющий много
-- натыкал. Список PROBE_DEVICES ниже — ручной запасной выход на случай, если
-- проверочный браузер когда-нибудь останется в одном центре.
-- =====================================================================================

with params as (
  -- Момент, начиная с которого клиент обязан присылать app_version.
  -- Коммит db69cf3 «версия клиента», выкачен 2026-07-31 22:09 UTC.
  select timestamptz '2026-07-31 22:09:00+00' as version_live_since,
         -- Ручной список проверочных устройств (дополняет признак «>1 центра»).
         array[]::text[] as probe_devices
),
device_shape as (
  -- Форма устройства считается по ВСЕЙ его истории, независимо от центра.
  select device_id,
         count(distinct center_id) as centres_seen,
         count(*)                  as marks_all_centres
  from menumaker.meal_count_marks
  group by device_id
),
last_seen as (
  select m.device_id, m.center_id,
         max(m.synced_at) as last_sync,
         max(m.synced_at) filter (where m.app_version is not null) as last_sync_with_version,
         (array_agg(m.app_version order by m.synced_at desc)
            filter (where m.app_version is not null))[1] as latest_version,
         count(*) as marks_total,
         count(*) filter (where m.synced_at >= now() - interval '14 days') as marks_14d
  from menumaker.meal_count_marks m
  group by m.device_id, m.center_id
),
judged as (
  select l.*, s.centres_seen, s.marks_all_centres, p.version_live_since,
         (s.centres_seen > 1 or l.device_id = any(p.probe_devices)) as is_probe
  from last_seen l
  join device_shape s on s.device_id = l.device_id
  cross join params p
)
select c.name                                                        as center,
       left(j.device_id, 8) || '…'                                   as device,
       to_char(j.last_sync at time zone 'America/New_York',
               'MM-DD HH24:MI')                                       as last_mark,
       (current_date - (j.last_sync at time zone 'America/New_York')::date) as days_silent,
       coalesce(j.latest_version, '—')                                as app_version,
       j.marks_total, j.marks_14d, j.centres_seen,
       case
         -- ⚪ Браузер проверок: ходит по нескольким центрам. В гейт не входит.
         when j.is_probe
           then '⚪ браузер проверок (центров: ' || j.centres_seen || ') — не в счёт'
         -- 🟢 Отчитался версией на своей ПОСЛЕДНЕЙ отметке.
         when j.latest_version is not null and j.last_sync_with_version >= j.last_sync
           then '🟢 ГОТОВО'
         -- ⏳ Ещё не отмечал после выкатки клиента с версией. Вердикта НЕТ.
         when j.last_sync < j.version_live_since
           then '⏳ не отмечал после выкатки — вердикта нет'
         -- ⚫ Давно молчит: узнать судьбу устройства у владельца.
         when j.last_sync < now() - interval '7 days'
           then '⚫ МОЛЧИТ — узнать судьбу устройства'
         -- 🔴 Отмечал ПОСЛЕ выкатки и версии не прислал = точно старый клиент.
         else '🔴 СТАРОЕ — обновить руками'
       end                                                            as verdict
from judged j
left join menumaker.centers c on c.id = j.center_id
order by case
           when j.is_probe then 5
           when j.latest_version is not null and j.last_sync_with_version >= j.last_sync then 4
           when j.last_sync < j.version_live_since then 3
           when j.last_sync < now() - interval '7 days' then 1
           else 2
         end,
         j.marks_total desc;

-- ── ОДНОЙ СТРОКОЙ: МОЖНО ЛИ ПУСКАТЬ КЛЮЧ ─────────────────────────────────────
-- Ждём 'ДА'. Любое другое значение = ключ не идёт.
with params as (
  select timestamptz '2026-07-31 22:09:00+00' as version_live_since,
         array[]::text[] as probe_devices
),
device_shape as (
  select device_id, count(distinct center_id) as centres_seen
  from menumaker.meal_count_marks group by device_id
),
last_seen as (
  select m.device_id,
         max(m.synced_at) as last_sync,
         max(m.synced_at) filter (where m.app_version is not null) as last_sync_with_version
  from menumaker.meal_count_marks m group by m.device_id
)
select case when count(*) = 0 then 'ДА — все отмечающие устройства отчитались версией'
            else format('НЕТ — %s устройств(а) без свежей версии', count(*)) end as gate
from last_seen l
join device_shape s on s.device_id = l.device_id
cross join params p
where not (s.centres_seen > 1 or l.device_id = any(p.probe_devices))
  and not (l.last_sync_with_version is not null and l.last_sync_with_version >= l.last_sync);
