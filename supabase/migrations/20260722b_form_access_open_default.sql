-- 20260722b_form_access_open_default.sql — ПЕРЕ-СКОУП ДОПУСКОВ: смена полярности на ОТКРЫТО-по-умолчанию
--
-- ⛔ PREPARE → применяет CC по GO Николая (пере-скоуп «в работе»), read-back вердиктом колонками.
--
-- РЕШЕНИЕ Николая 2026-07-22: ДЕФОЛТ = ОТКРЫТО. Всё в библиотеке доступно директорам; Татьяна
-- ЗАКРЫВАЕТ точечно 🚫. Инвертирует 20260722_form_access (было: список ОТКРЫТОГО, 23 строки).
--
-- КАНОНИЧНАЯ СЕМАНТИКА (выбор CC, доложен): `form_access` = СПИСОК ЗАКРЫТОГО.
--   • строка = форма СКРЫТА от директорского «Add from library»;
--   • отсутствие строки = ОТКРЫТО (дефолт) → новый документ несёт допуск и стартует ОТКРЫТЫМ ДАРОМ.
-- Колонка переименована director_composable → director_hidden (само-документируется). Инверсия
-- текущего сида: 23 «открытых» строки → всё открыто → закрытых 0 → TRUNCATE.
-- RLS/гранты не трогаем (запись только is_org_owner, чтение члены орг — из 20260722).

begin;

-- 1. Смысловая инверсия колонки. Старые значения (true=было открыто) СБРАСЫВАЕМ ниже —
--    оставлять их нельзя: под новой семантикой строка=скрыто, т.е. 23 открытых стали бы 23 скрытыми.
alter table menumaker.form_access rename column director_composable to director_hidden;
alter table menumaker.form_access alter column director_hidden set default true;

-- 2. Инверсия сида: новый мир = всё открыто → закрытых ноль.
truncate menumaker.form_access;

comment on table menumaker.form_access is
  'Closed-list допусков: строка = форма СКРЫТА от директорского Add-from-library (director_hidden). '
  'Отсутствие строки = ОТКРЫТО (дефолт). Новый документ открыт даром. Пишет только is_org_owner (GD).';
comment on column menumaker.form_access.director_hidden is
  'true = скрыта от директоров. Строки существуют ТОЛЬКО для закрытых форм; открытие = удаление строки.';

commit;

-- ═════════════════════════════════════════════════════════════════════════════
-- READ-BACK — вердикт колонками (вписать после apply)
-- ═════════════════════════════════════════════════════════════════════════════
-- R1. колонка переименована, дефолт true:
--   select column_name, column_default from information_schema.columns
--    where table_schema='menumaker' and table_name='form_access' and column_name='director_hidden';
--   -- ждём: director_hidden · true
-- R2. закрытых ноль (всё открыто):
--   select count(*) as closed_rows from menumaker.form_access;   -- 0
-- R3. полярность на живом предикате (директор Pearl видит всё, ничего не скрыто):
--   -- 0 closed → любой ключ открыт; проверка на клиенте (self-проход).
-- R4. RLS цела (из 20260722): запись только is_org_owner — GD delete/insert проходит, директор нет.
