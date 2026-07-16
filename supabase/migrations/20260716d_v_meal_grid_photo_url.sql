-- 20260716d_v_meal_grid_photo_url.sql — вернуть фото в meal grid ПО-НАСТОЯЩЕМУ
--
-- ✅ APPLIED 2026-07-16 on Nikolay's go. Order honoured: VIEW first, code second.
--
-- STANDARD 0bebc3f APPLIED TO THIS MIGRATION ITSELF:
--   pg_depend found THREE views over `roster`, none of which had photo_url:
--     · menumaker.v_meal_grid        → UPDATED here (the two broken screens read it)
--     · menumaker.v_child_age_profile→ LEFT ALONE ON PURPOSE: it serves age/milk
--       read-only fields (childFieldRegistry table:'view'); a photo has no business there.
--     · menumaker.v_roster_export    → LEFT ALONE ON PURPOSE: it is a CSV export
--       (ChildrenExportPage). A Storage object PATH in an exported roster is noise at
--       best and an internal-path leak at worst.
--   Built by replace()-ing pg_get_viewdef() INSIDE the transaction and asserting
--   after = before || ',photo_url' — column drift aborts instead of shipping.
--
-- READ-BACK (actual, from an authenticated seat):
--   19 columns, first 18 in their original order, photo_url last:
--     roster_id,org_id,center_id,center,classroom_id,child_name,age_group_food,
--     age_group_milk,milk_kind,substitute_milk,substitute_reimbursable,is_active,
--     allergies,oz,milk_label,first_name,last_name,birthday,photo_url
--   alpha/Green Room: 10 children · ridge/Red: 9 children — grid still alive.
--
-- ⚠️ ONLY ONE CHILD IN THE WHOLE ORG HAS A PHOTO ON FILE:
--   Rodriguez-Texidor Izabella — Ridge / **Orange 2**. Staff photos: 0.
--   So "photos render" can ONLY be proven on Ridge/Orange 2. Green Room and Red have
--   no photos and show initials — a screenshot of those would look like a failed fix.
--
-- КОНТЕКСТ. 2026-07-16 кухня показывала ноль детей. Причина: экраны просили у
-- `v_meal_grid` колонку `photo_url`, которой у вьюхи НЕТ — `20260715b_avatars.sql`
-- добавил `roster.photo_url`, но вьюху не обновил. PostgREST отклонял ВЕСЬ select,
-- ошибка выбрасывалась на пол, экран рисовал пустой класс. Радиус: MealCountPage
-- (живая кухня) + SafePassTeacherPage (экран пилота понедельника).
--
-- Аварийный фикс (adb2454) — КОДОВЫЙ: `photo_url` убран из обоих select, Avatar
-- показывает инициалы. Кухня работает. Но фото в meal count по-прежнему нет — и
-- НИКОГДА не было: select падал с самого мержа f4e549e.
--
-- Эта миграция чинит причину, а не симптом: добавляет колонку во вьюху. После неё
-- `photo_url` можно вернуть в оба select — ОДНИМ коммитом с применением, не раньше.
--
-- ПОЧЕМУ ЭТО НЕ ПОЕХАЛО В АВАРИЙНОМ ФИКСЕ. Правка вьюхи — DB-изменение, а вьюха
-- лежит под живой кухней. Протокол ([[menumaker-live-db-write-protocol]]): prepare →
-- слово → apply → read-back. Кодовый фикс восстановил кухню немедленно и без
-- касания БД; фото — улучшение, а не авария, и может подождать слова.
--
-- БЕЗОПАСНОСТЬ. CREATE OR REPLACE VIEW разрешает ДОБАВИТЬ колонку в конец, не меняя
-- существующие. Порядок и типы прежних 18 колонок сохранены дословно (тело снято
-- через pg_get_viewdef 2026-07-16). RLS вьюхи не меняется: `WHERE core.is_org_member`
-- остаётся как было.

begin;

create or replace view menumaker.v_meal_grid as
 SELECT r.id AS roster_id,
    r.org_id,
    r.center_id,
    ct.name AS center,
    r.classroom_id,
    r.child_name,
    COALESCE(
        CASE
            WHEN r.birthday IS NOT NULL THEN
            CASE
                WHEN (date_part('year'::text, age(CURRENT_DATE::timestamp with time zone, r.birthday::timestamp with time zone)) * 12::double precision + date_part('month'::text, age(CURRENT_DATE::timestamp with time zone, r.birthday::timestamp with time zone))) < 6::double precision THEN 'birth_5m'::text
                WHEN (date_part('year'::text, age(CURRENT_DATE::timestamp with time zone, r.birthday::timestamp with time zone)) * 12::double precision + date_part('month'::text, age(CURRENT_DATE::timestamp with time zone, r.birthday::timestamp with time zone))) < 12::double precision THEN '6_11m'::text
                WHEN (date_part('year'::text, age(CURRENT_DATE::timestamp with time zone, r.birthday::timestamp with time zone)) * 12::double precision + date_part('month'::text, age(CURRENT_DATE::timestamp with time zone, r.birthday::timestamp with time zone))) < 24::double precision THEN '1y'::text
                WHEN (date_part('year'::text, age(CURRENT_DATE::timestamp with time zone, r.birthday::timestamp with time zone)) * 12::double precision + date_part('month'::text, age(CURRENT_DATE::timestamp with time zone, r.birthday::timestamp with time zone))) < 36::double precision THEN '2y'::text
                WHEN (date_part('year'::text, age(CURRENT_DATE::timestamp with time zone, r.birthday::timestamp with time zone)) * 12::double precision + date_part('month'::text, age(CURRENT_DATE::timestamp with time zone, r.birthday::timestamp with time zone))) < 72::double precision THEN '3_5y'::text
                ELSE '6_12y'::text
            END
            ELSE NULL::text
        END, r.age_group_food) AS age_group_food,
    COALESCE(
        CASE
            WHEN r.birthday IS NOT NULL THEN
            CASE
                WHEN (date_part('year'::text, age(CURRENT_DATE::timestamp with time zone, r.birthday::timestamp with time zone)) * 12::double precision + date_part('month'::text, age(CURRENT_DATE::timestamp with time zone, r.birthday::timestamp with time zone))) < 12::double precision THEN 'infant'::text
                WHEN (date_part('year'::text, age(CURRENT_DATE::timestamp with time zone, r.birthday::timestamp with time zone)) * 12::double precision + date_part('month'::text, age(CURRENT_DATE::timestamp with time zone, r.birthday::timestamp with time zone))) < 24::double precision THEN '1y'::text
                WHEN (date_part('year'::text, age(CURRENT_DATE::timestamp with time zone, r.birthday::timestamp with time zone)) * 12::double precision + date_part('month'::text, age(CURRENT_DATE::timestamp with time zone, r.birthday::timestamp with time zone))) < 36::double precision THEN '2y'::text
                WHEN (date_part('year'::text, age(CURRENT_DATE::timestamp with time zone, r.birthday::timestamp with time zone)) * 12::double precision + date_part('month'::text, age(CURRENT_DATE::timestamp with time zone, r.birthday::timestamp with time zone))) < 72::double precision THEN '3_5y'::text
                ELSE '6_12y'::text
            END
            ELSE NULL::text
        END, r.age_group_milk) AS age_group_milk,
    r.milk_kind,
    r.substitute_milk,
    r.substitute_reimbursable,
    r.is_active,
    cm.allergies,
    COALESCE(
        CASE
            WHEN r.birthday IS NOT NULL THEN
            CASE
                WHEN (date_part('year'::text, age(CURRENT_DATE::timestamp with time zone, r.birthday::timestamp with time zone)) * 12::double precision + date_part('month'::text, age(CURRENT_DATE::timestamp with time zone, r.birthday::timestamp with time zone))) < 12::double precision THEN 0
                WHEN (date_part('year'::text, age(CURRENT_DATE::timestamp with time zone, r.birthday::timestamp with time zone)) * 12::double precision + date_part('month'::text, age(CURRENT_DATE::timestamp with time zone, r.birthday::timestamp with time zone))) < 36::double precision THEN 4
                WHEN (date_part('year'::text, age(CURRENT_DATE::timestamp with time zone, r.birthday::timestamp with time zone)) * 12::double precision + date_part('month'::text, age(CURRENT_DATE::timestamp with time zone, r.birthday::timestamp with time zone))) < 72::double precision THEN 6
                ELSE 8
            END
            ELSE NULL::integer
        END::numeric, r.rate_oz) AS oz,
        CASE
            WHEN r.substitute_milk IS NOT NULL AND r.substitute_milk <> ''::text THEN r.substitute_milk
            WHEN r.birthday IS NOT NULL THEN
            CASE
                WHEN (date_part('year'::text, age(CURRENT_DATE::timestamp with time zone, r.birthday::timestamp with time zone)) * 12::double precision + date_part('month'::text, age(CURRENT_DATE::timestamp with time zone, r.birthday::timestamp with time zone))) < 12::double precision THEN 'Formula'::text
                WHEN (date_part('year'::text, age(CURRENT_DATE::timestamp with time zone, r.birthday::timestamp with time zone)) * 12::double precision + date_part('month'::text, age(CURRENT_DATE::timestamp with time zone, r.birthday::timestamp with time zone))) < 24::double precision THEN 'Whole'::text
                ELSE '1%'::text
            END
            ELSE
            CASE lower(COALESCE(r.milk_kind, ''::text))
                WHEN '1pct'::text THEN '1%'::text
                WHEN '2pct'::text THEN '2%'::text
                WHEN 'skim'::text THEN 'Skim'::text
                WHEN 'fatfree'::text THEN 'Fat-Free'::text
                WHEN 'whole'::text THEN 'Whole'::text
                WHEN 'red'::text THEN 'Whole'::text
                ELSE r.milk_kind
            END
        END AS milk_label,
    r.first_name,
    r.last_name,
    r.birthday,
    -- ── ADDED 20260716d ─────────────────────────────────────────────────────
    -- The Storage object PATH (not a URL) — Avatar resolves it to a signed URL.
    -- Appended LAST so the existing 18 columns keep their position and type.
    r.photo_url
   FROM menumaker.roster r
     LEFT JOIN menumaker.centers ct ON ct.id = r.center_id
     LEFT JOIN menumaker.child_medical cm ON cm.child_id = r.child_id
  WHERE core.is_org_member(r.org_id);

commit;

-- ── READ-BACK ПОСЛЕ ПРИМЕНЕНИЯ ──────────────────────────────────────────────
-- 1. Колонка появилась И прежние 18 на своих местах (сдвиг = сломанный кит):
--      select ordinal_position, column_name from information_schema.columns
--       where table_schema='menumaker' and table_name='v_meal_grid' order by 1;
--    Ожидаем 19 колонок, photo_url — девятнадцатая, первые 18 в прежнем порядке.
-- 2. Кухня по-прежнему видит своих детей (из сиденья повара, не из postgres):
--      alpha/Green Room → 10 · ridge/Red → 9
-- 3. Только ПОСЛЕ успешного read-back вернуть `photo_url` в оба select ОДНИМ коммитом:
--      src/pages/meal-count/MealCountPage.tsx     (~:309)
--      src/pages/safepass/SafePassTeacherPage.tsx (~:260)
--    Порядок обязателен: код, вернувшийся раньше вьюхи, снова обнулит кухню.
--
-- ── ROLLBACK ────────────────────────────────────────────────────────────────
--   Пересоздать вьюху телом без строки `r.photo_url` (снимок pg_get_viewdef от
--   2026-07-16 — в этом файле выше). Кодовые select фото не просят, так что откат
--   вьюхи сам по себе ничего не ломает.
