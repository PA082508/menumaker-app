-- ============================================================================
-- 20260719d — License-трекер: Ridge + Highland с бумаги, колонка form_revision,
--              и запуск переноса 20260719c ОДНИМ заходом
-- PREPARED 2026-07-18 · NOT APPLIED
-- ⚠️ ПРЕДУСЛОВИЕ: две бумажные лицензии на столе. Без них §2 не выполнять.
--
-- Почему одним заходом: числа Ridge и Highland всё равно читаются с той же
-- бумаги, что нужна для 20260719c. Два захода = два раза брать бумагу в руки.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- §1 Колонка под редакцию бланка — единственный настоящий пробел трекера.
--     Именно редакция устаревает при смене формы ODJFS, и по ней придётся
--     однажды перевыпускать пакет.
-- ---------------------------------------------------------------------------
alter table menumaker.center_licenses
  add column if not exists form_revision text;

comment on column menumaker.center_licenses.form_revision is
  'Редакция бланка лицензии, как напечатано на бумаге, напр. "JFS 01256 rev. 12/2016". '
  'Устаревает при смене формы ODJFS — отслеживается отдельно от срока действия.';

update menumaker.center_licenses
   set form_revision = 'JFS 01256 rev. 12/2016'
 where license_type = 'child_care'
   and license_number = '000000300629';       -- Pearl, сверено с бумагой 18.07

-- ---------------------------------------------------------------------------
-- §2 Ridge и Highland — строки child_care. ⚠️ ЗАПОЛНИТЬ С БУМАГИ ПЕРЕД ЗАПУСКОМ.
--
--     Значения ниже — ОЖИДАЕМЫЕ (из menumaker.centers), а не прочитанные.
--     Если бумага скажет другое — истина БУМАГА: правится этот текст, а не
--     бумага и не молча база.
--
--     Ridge     capacity 215 · under 2½ 57  · № ??? · issued ??? · admin ???
--     Highland  capacity 106 · under 2½ 42  · № ??? · issued ??? · admin ???
--
--     Незаполненные ??? — это стоп. Строка трекера с выдуманным номером хуже
--     отсутствующей строки: отсутствующую видно, выдуманной верят.
-- ---------------------------------------------------------------------------

-- insert into menumaker.center_licenses
--   (center_id, org_id, license_type, license_number, issuing_authority,
--    issued_date, expires_date, capacity, capacity_under2, administrator,
--    form_revision, is_current)
-- select c.id, c.org_id, 'child_care',
--        '<НОМЕР С БУМАГИ>',
--        'Ohio Department of Children & Youth',
--        '<ДАТА ВЫДАЧИ>'::date,
--        null,                       -- Continuous выражается как NULL
--        <CAPACITY>, <UNDER_2_5>,
--        '<ADMINISTRATOR(S)>',
--        '<JFS 01256 rev. ...>',
--        true
--   from menumaker.centers c
--  where c.name ilike '%ridge%';     -- и отдельно для '%highland%'

-- Страховка: у каждого центра ровно одна ТЕКУЩАЯ детская лицензия.
do $$
declare n int;
begin
  select count(*) into n from (
    select center_id from menumaker.center_licenses
     where license_type = 'child_care' and is_current
     group by center_id having count(*) > 1) x;
  if n <> 0 then
    raise exception 'у % центров больше одной текущей child_care лицензии, откат', n;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- §3 ПОСЛЕ §2 — запустить 20260719c (перенос under-2 → under-2½ в centers).
--     Порядок именно такой: сначала канон пополняется с бумаги, потом
--     выравниваются дубли. Наоборот — значит выравнивать копии по копиям.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- §4 READ-BACK
--   select ct.name, l.license_number, l.capacity, l.capacity_under2,
--          l.administrator, l.form_revision, l.expires_date, l.is_current
--     from menumaker.center_licenses l
--     join menumaker.centers ct on ct.id = l.center_id
--    where l.license_type = 'child_care' order by ct.name;
--   ожидаем ТРИ строки (Pearl / Ridge / Highland), все is_current,
--   expires_date NULL (Continuous), form_revision заполнена.
--
--   И сверка канона с дублями — они обязаны совпасть:
--   select ct.name,
--          l.capacity        = ct.license_total_max     as total_agrees,
--          l.capacity_under2 = ct.license_under2_5_max  as under25_agrees
--     from menumaker.center_licenses l
--     join menumaker.centers ct on ct.id = l.center_id
--    where l.license_type='child_care' and l.is_current;
--   → все true. Любой false = разбирать руками, не «подгонять».
--
-- checkmark export ✅ — compute_monthly_claim читает center_licenses и берёт
-- ёмкость по is_current. §2 добавляет НЕДОСТАЮЩИЕ строки Ridge/Highland; до
-- сих пор для них подзапрос возвращал NULL, то есть в JSON клейма
-- license_capacity стояло пусто. Это улучшение, но проверить превью обоих
-- центров после применения — поле начнёт заполняться.
-- ============================================================================
