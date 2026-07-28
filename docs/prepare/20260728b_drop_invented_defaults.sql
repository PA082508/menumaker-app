-- 20260728b_drop_invented_defaults.sql
-- ✅ ПРИМЕНЕНО 2026-07-28 по слову (миграция 20260728b). Читка обратно — в конце файла.
--
-- Код-половина этого захода УЖЕ В РЕПО и от DDL не зависит — оба INSERT-пути
-- ростера теперь задают null явно. То есть окно «новый ребёнок получает
-- выдуманное да» закрыто кодом уже сейчас; DDL убирает саму возможность.
--
-- ── ЗАЧЕМ
-- menumaker.roster.emergency_transport_auth  DEFAULT true
-- menumaker.roster.has_health_condition      DEFAULT false
-- Первый заставлял систему отвечать «да» на РОДИТЕЛЬСКУЮ АВТОРИЗАЦИЮ экстренной
-- перевозки за 623 семьи, которых никто не спрашивал. Ответ, которого не давали,
-- обязан быть NULL, а не дефолтом.
--
-- ── ПОЧЕМУ БЕЗОПАСНО СНИМАТЬ СЕЙЧАС
-- INSERT-путей в roster ровно ДВА, оба в приложении, оба теперь задают null явно:
--   src/lib/enrollmentApprove.ts  insertRosterChild      (approveCacfpInsert + создание-из-формы)
--   src/pages/children/CenterRosterPage.tsx              (панель «Добавить ребёнка»)
-- Со стороны БД — НОЛЬ: ни одна функция/триггер/вью не вставляет в roster.
-- import_children_run слова `roster` не содержит вовсе (проверено pg_get_functiondef).
-- Читателей колонок нет: 0 функций / вью / политик; в приложении обе уже `boolean | null`.
--
-- ── ПОРЯДОК ОТНОСИТЕЛЬНО 20260728a
-- НЕЗАВИСИМЫ, но 20260728b логично применять ПЕРВЫМ: он останавливает приток
-- новой фикции, 20260728a чистит накопленную. Обратный порядок тоже допустим —
-- просто между применениями успеет родиться пара строк с дефолтом.
-- 20260728a ждёт СВОЕГО отдельного слова владельца.
-- ============================================================================


-- §0 ПРЕДПОЛЁТ — ничего не пишет.
select column_name, column_default, is_nullable
from information_schema.columns
where table_schema='menumaker' and table_name='roster'
  and column_name in ('emergency_transport_auth','has_health_condition');
-- ОЖИДАНИЕ на 28.07: true / YES  и  false / YES


-- §1 ПРИМЕНЕНИЕ — по слову. Только дефолт; тип, nullability и данные не трогаются.
alter table menumaker.roster alter column emergency_transport_auth drop default;
alter table menumaker.roster alter column has_health_condition     drop default;


-- §2 ЧИТКА ОБРАТНО.
select column_name, column_default, is_nullable
from information_schema.columns
where table_schema='menumaker' and table_name='roster'
  and column_name in ('emergency_transport_auth','has_health_condition');
-- ОЖИДАНИЕ: column_default = NULL у обеих, is_nullable = YES

-- §3 КОНТРОЛЬ: существующие строки НЕ должны измениться (drop default их не трогает).
select count(*) filter (where emergency_transport_auth is true)  as eta_true,
       count(*) filter (where emergency_transport_auth is null)  as eta_null,
       count(*) filter (where has_health_condition is false)     as hhc_false,
       count(*) filter (where has_health_condition is null)      as hhc_null
from menumaker.roster;
-- ОЖИДАНИЕ (если 20260728a ещё НЕ применён): 623 | 0 | 621 | 0 — без изменений.

-- ============================================================================
-- ПРИМЕНЕНО 2026-07-28 миграцией 20260728b_drop_invented_defaults.
-- Читка обратно: column_default = (none) у обеих колонок, is_nullable = YES.
-- Строки не изменились: 623 | eta_true 623 | hhc_false 621 / hhc_true 2.
-- ============================================================================
