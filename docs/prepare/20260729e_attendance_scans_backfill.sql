-- ============================================================================
-- ПОДГОТОВЛЕНО, НЕ ПРИМЕНЕНО. 20260729e — подшить 68 сканов посещаемости.
--
-- ЧТО ЭТО ЗА ФАЙЛЫ. Класс артефакта определён ВЛАДЕЛЬЦЕМ, не нами: это СКАНЫ
-- БУМАЖНЫХ ЛИСТОВ ПОСЕЩАЕМОСТИ, которые директора еженедельно сверяют с
-- галочками и подшивают, — ПЕРВИЧНОЕ ДОКАЗАТЕЛЬСТВО под клеймовую неделю.
-- Замер подтвердил класс по путям и привязке (ниже).
--
-- ЧТО СЛУЧИЛОСЬ. Экран грузил файл в хранилище, потом писал строку в
-- meal_week_attachments — и строка отбивалась ЦЕЛИКОМ: полезная нагрузка слала
-- `created_at`, которого в таблице нет (42703), и не слала обязательные
-- center_id и classroom. Голый await глотал отказ, экран показывал успех.
-- Так было КАЖДЫЙ РАЗ: 68 файлов легли, 0 строк появилось.
--
-- ⚠️ КАЛИБРОВКА, И ОНА В ПОЛЬЗУ ДИРЕКТОРОВ: бумага существует, сверка с
-- галочками СОСТОЯЛАСЬ, не состоялась только ПОДШИВКА электронной копии. Это
-- отказ ПРИВЯЗКИ, а не потеря данных и не промах директоров: они сделали всё
-- правильно 68 раз подряд, система молчала.
--
-- ПОЧЕМУ ПЕРЕЗАГРУЖАТЬ НИЧЕГО НЕ НАДО. Путь объекта собран экраном из класса и
-- недели: `<classroom_id>/<monday_date>/<файл>`. Замер: 68 из 68 разрешаются в
-- существующий класс, недели читаются как даты. Остальное выводится из classrooms.
--
--   e95f2cb2-…-023b/2026-06-29/image.jpg
--   c9ea7e34-…-4067/2026-06-29/image.jpg
--   5063f1c0-…-e096/2026-06-29/image.jpg
--
-- ОХВАТ: 5 недель подряд (29.06 · 06.07 · 13.07 · 20.07 · 27.07), три центра —
-- Pearl 20 · Ridge 22 · Highland Heights 26. Загрузки 07.07–28.07.
-- ============================================================================

insert into menumaker.meal_week_attachments
  (center_id, org_id, classroom, classroom_id, monday_date, file_path, file_name, uploaded_by, uploaded_at)
select
  c.center_id,
  c.org_id,
  c.name,
  c.id,
  split_part(o.name, '/', 2)::date,
  o.name,
  split_part(o.name, '/', 3),
  'backfill-20260729e',          -- честно: подшито миграцией, а не директором
  o.created_at                    -- время ЗАГРУЗКИ, а не сегодняшнее
from storage.objects o
join menumaker.classrooms c on c.id = split_part(o.name, '/', 1)::uuid
where o.bucket_id = 'attendance-scans'
  and not exists (
    select 1 from menumaker.meal_week_attachments a where a.file_path = o.name
  );

-- READ-BACK (выполнять отдельно, после):
--   select count(*) from menumaker.meal_week_attachments;                    -- ожидается 68
--   select monday_date, count(*) from menumaker.meal_week_attachments
--    group by 1 order by 1;                                                  -- пять недель
--   select count(*) from storage.objects o where o.bucket_id='attendance-scans'
--     and not exists (select 1 from menumaker.meal_week_attachments a
--                      where a.file_path = o.name);                          -- ожидается 0
