-- ============================================================================
-- 20260719c — перенос «до 2½» из старой колонки в новую
-- PREPARED 2026-07-18 · NOT APPLIED
-- ⚠️ НЕ ЗАПУСКАТЬ, пока не подтверждены ДВЕ оставшиеся бумажные лицензии.
--
-- ПОЧЕМУ ЭТОТ ЗАХОД ВООБЩЕ ПОЯВИЛСЯ. Вчера план был обратный: заполнить
-- license_under2_5_max руками с бумаги, потому что старая колонка называется
-- `license_capacity_under2` и, судя по имени и по комментарию миграции
-- 20260705, содержала «до 2 лет».
--
-- Бумага отменила план. Лицензия Pearl, дословно:
--   «total capacity of 158; of this, 36 may be under 2 1/2 years»
-- В базе у Pearl: license_capacity = 158, license_capacity_under2 = 36.
-- Совпадает точно. Значит колонка всё это время держала лицензионные
-- **under-2½**, а врало ИМЯ. Переименование 20260705b было верным.
--
-- Ручной ввод трёх чисел ОТМЕНЁН: числа уже в базе и уже правильные.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- §0 ПРЕДУСЛОВИЕ — две бумаги. Без них не запускать.
--
--   Pearl     158 / 36   ✅ сверено с бумагой владельцем 18.07
--   Ridge     215 / 57   ⬜ ЖДЁТ сверки
--   Highland  106 / 42   ⬜ ЖДЁТ сверки
--
-- Если какая-то бумага разойдётся с базой — **истина БУМАГА**. Тогда этот
-- заход НЕ запускается целиком: сначала точечная правка расходящегося центра
-- по слову Николая, потом перенос. Молча «подогнать» нельзя: расхождение в
-- лицензионном поле — это либо ошибка ввода, либо изменившаяся лицензия, и
-- различить их может только человек с бумагой в руках.
-- ---------------------------------------------------------------------------

begin;

-- Страховка ДО правки: переносим только туда, где новая колонка пуста.
-- Если она где-то уже заполнена и не совпадает — останавливаемся, а не
-- перетираем: заполнить её мог человек, и его ввод главнее переноса.
do $$
declare n int;
begin
  select count(*) into n from menumaker.centers
   where license_under2_5_max is not null
     and license_capacity_under2 is not null
     and license_under2_5_max <> license_capacity_under2;
  if n <> 0 then
    raise exception 'у % центров новая колонка уже заполнена ДРУГИМ значением — разбирать руками, откат', n;
  end if;
end $$;

update menumaker.centers
   set license_under2_5_max = license_capacity_under2
 where license_under2_5_max is null
   and license_capacity_under2 is not null;

-- Страховка ПОСЛЕ: обе колонки обязаны сойтись везде, где старая заполнена.
do $$
declare n int;
begin
  select count(*) into n from menumaker.centers
   where license_capacity_under2 is not null
     and license_under2_5_max is distinct from license_capacity_under2;
  if n <> 0 then raise exception 'под-2½ не сошлось у % центров, откат', n; end if;
end $$;

commit;

comment on column menumaker.centers.license_under2_5_max is
  'DCY: «Total Under 2½ Years» с бумажной лицензии. Значения перенесены '
  '20260719c из license_capacity_under2: old column name lied (it said '
  '"under2"), values verified against paper licenses by owner 2026-07-18.';

-- ---------------------------------------------------------------------------
-- §1 READ-BACK
--   select name, license_total_max, license_under2_5_max,
--          license_capacity, license_capacity_under2
--     from menumaker.centers where license_capacity is not null order by name;
--   ожидаем: Ridge 215/57 · Pearl 158/36 · Highland 106/42 — в ОБЕИХ парах.
--
-- §1b ⚠️ КАНОН ВООБЩЕ НЕ ЗДЕСЬ. Найдено 18.07 при сверке:
--   menumaker.center_licenses — настоящий License-трекер, и он держит ВСЁ:
--   номер, issued_date, capacity/capacity_under2, administrator («Cynthia
--   Patsko, Tatiana Kogan»), issuing_authority, а «Continuous» выражено как
--   expires_date IS NULL. compute_monthly_claim читает ИМЕННО ЕГО (20260707:136,
--   `select capacity from menumaker.center_licenses ... is_current`), а НЕ
--   centers.license_capacity.
--   → обе пары в centers — ДУБЛИ трекера. Этот заход сводит два дубля в один;
--     свести всё к трекеру — отдельный план, см. BACKLOG.
--   → и трекер НЕПОЛОН: строка child_care есть только у Pearl. У Ridge и
--     Highland её нет, поэтому сначала завести их с бумаги.
--
-- §2 ПОСЛЕ ЭТОГО — снос старой пары отдельным заходом (20260719d):
--   alter table menumaker.centers
--     drop column license_capacity,
--     drop column license_capacity_under2;
--   ⚠️ до сноса проверить читателей через pg_depend И грепом по src/.
--   Проверено 18.07: compute_monthly_claim берёт ёмкость из center_licenses,
--   НЕ из centers — то есть снос пары клейм не роняет. Но `centers.
--   license_capacity` читает CenterInfoSettings.tsx (вторая форма настроек),
--   и вот её снос сломает. checkmark export ✅ — расчёт клейма не задет.
-- ============================================================================
