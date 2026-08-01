-- =====================================================================================
-- СВЕТОФОР ГОТОВНОСТИ УСТРОЙСТВ — ГЕЙТ МИГРАЦИИ КЛЮЧА (20260731a).
-- Read-only. Ничего не пишет. Запускать перед КАЖДЫМ разговором о ключе.
--
-- УСЛОВИЕ ВЛАДЕЛЬЦА (01.08): не «Ridge обновили», а «КАЖДОЕ отмечающее устройство
-- отчиталось свежим app_version». Пока хоть одна строка не 🟢 (или ⚪) — ключ не идёт.
--
-- ⚠️ ЧЕТВЁРТОЕ СОСТОЯНИЕ ЕСТЬ НЕ ДЛЯ КРАСОТЫ. Клиент, шлющий версию, выкачен
--    31.07 в 22:09 UTC, а последняя отметка в базе сделана 31.07 в 20:24 UTC —
--    РАНЬШЕ выкатки. Значит сегодня «версии нет» означает «устройство ещё не
--    отмечало после выкатки», а НЕ «устройство старое». Без отдельного состояния
--    светофор в первый же день показал бы семь красных, которых нет, — та же
--    ошибка, что читать ноль Ridge как «никто не отмечает вовремя».
-- =====================================================================================

with params as (
  -- Момент, начиная с которого клиент обязан присылать app_version.
  -- Коммит db69cf3 «версия клиента», выкачен 2026-07-31 22:09 UTC.
  select timestamptz '2026-07-31 22:09:00+00' as version_live_since
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
)
select c.name                                                        as center,
       left(l.device_id, 8) || '…'                                   as device,
       to_char(l.last_sync at time zone 'America/New_York',
               'MM-DD HH24:MI')                                       as last_mark,
       (current_date - (l.last_sync at time zone 'America/New_York')::date) as days_silent,
       coalesce(l.latest_version, '—')                                as app_version,
       l.marks_total, l.marks_14d,
       case
         -- ⚪ Браузер проверок, а не рабочий планшет. В гейт не входит.
         when l.marks_total <= 10
           then '⚪ браузер проверок — не в счёт'
         -- 🟢 Отчитался версией на своей ПОСЛЕДНЕЙ отметке.
         when l.latest_version is not null and l.last_sync_with_version >= l.last_sync
           then '🟢 ГОТОВО'
         -- ⏳ Ещё не отмечал после выкатки клиента с версией. Вердикта НЕТ.
         when l.last_sync < p.version_live_since
           then '⏳ не отмечал после выкатки — вердикта нет'
         -- ⚫ Давно молчит: узнать судьбу устройства у владельца.
         when l.last_sync < now() - interval '7 days'
           then '⚫ МОЛЧИТ — узнать судьбу устройства'
         -- 🔴 Отмечал ПОСЛЕ выкатки и версии не прислал = точно старый клиент.
         else '🔴 СТАРОЕ — обновить руками'
       end                                                            as verdict
from last_seen l
cross join params p
left join menumaker.centers c on c.id = l.center_id
order by case
           when l.marks_total <= 10 then 5
           when l.latest_version is not null and l.last_sync_with_version >= l.last_sync then 4
           when l.last_sync < p.version_live_since then 3
           when l.last_sync < now() - interval '7 days' then 1
           else 2
         end,
         l.marks_total desc;

-- ── ОДНОЙ СТРОКОЙ: МОЖНО ЛИ ПУСКАТЬ КЛЮЧ ─────────────────────────────────────
-- Ждём 'ДА'. Любое другое значение = ключ не идёт.
with params as (select timestamptz '2026-07-31 22:09:00+00' as version_live_since),
last_seen as (
  select m.device_id,
         max(m.synced_at) as last_sync,
         max(m.synced_at) filter (where m.app_version is not null) as last_sync_with_version,
         count(*) as marks_total
  from menumaker.meal_count_marks m group by m.device_id
)
select case when count(*) = 0 then 'ДА — все отмечающие устройства отчитались версией'
            else format('НЕТ — %s устройств(а) без свежей версии', count(*)) end as gate
from last_seen l cross join params p
where l.marks_total > 10
  and not (l.last_sync_with_version is not null and l.last_sync_with_version >= l.last_sync);
