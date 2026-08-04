-- =====================================================================================
-- 20260802c — ГОЛОС РИТУАЛА «ПРИСТЕГНИ РЕМНИ», ПО ЦЕНТРУ.
--             ✅ ПРИМЕНЕНО 2026-08-03 вместе с выпуском ветки
--             feat/buckle-up-meal-ritual-20260802, после миграции ключа.
--
-- ЧТО ДЕЛАЕТ. Одна колонка: какую из трёх мелодий играет экран счёта этого центра.
-- Не настройка звука вообще, а именно выбор голоса: сам ритуал включён всегда.
--
-- ПОЧЕМУ ПО ЦЕНТРУ, А НЕ ПО УСТРОЙСТВУ. Мелодию слышит группа, а не планшет:
-- в одном центре все комнаты должны звонить одинаково, иначе «это у нас или у
-- соседей?» становится ежедневным вопросом. Настройка живёт там же, где остальные
-- решения центра о счёте, — в meal_count_settings (ключ center_id).
--
-- ОТДЕЛЬНЫЙ ЗАПРОС В КЛИЕНТЕ ОСТАВЛЕН НАРОЧНО. Экран читает эту колонку не вместе с
-- active_slots, а отдельно: PostgREST отбивает ВЕСЬ select на одну неизвестную колонку,
-- и один общий запрос оставил бы экран счёта без настроек целиком (правило
-- docs/platform-standards.md: отказ, съеденный молча, рисует уверенный пустой экран).
-- После применения выбор живёт ТОЛЬКО в БД: запасной путь через localStorage и надпись
-- «хранится на этом устройстве» сняты — устройству больше нечего помнить.
--
-- УМОЛЧАНИЕ 'v2' — «Маленькая песенка», выбор владельца 03.08. Значение совпадает с
-- DEFAULT_VARIANT в src/lib/mealChime.ts: центр без явного выбора и экран, не сумевший
-- прочитать колонку, обязаны звонить ОДИНАКОВО, иначе разница слышна в группе.
-- Колонка добавляется с умолчанием, поэтому существующие строки центров получают 'v2'.
--
-- ОТКАТА НЕ ТРЕБУЕТ: колонка с умолчанием, старый клиент её не видит и не пишет.
-- =====================================================================================

begin;

alter table menumaker.meal_count_settings
  add column if not exists chime_variant text not null default 'v2';

alter table menumaker.meal_count_settings
  drop constraint if exists meal_count_settings_chime_variant_chk;
alter table menumaker.meal_count_settings
  add constraint meal_count_settings_chime_variant_chk
  check (chime_variant in ('v1','v2','v3'));

comment on column menumaker.meal_count_settings.chime_variant is
  'Голос ритуала «Пристегни ремни» для этого центра: v1 «It''s time to eat!», '
  'v2 «Wash your hands and eat» (ПО УМОЛЧАНИЮ, выбор владельца 03.08), '
  'v3 «Yummy-yummy time!». Закрытие окна (D4→A3) одинаково во всех вариантах. '
  'Ноты и слова — src/lib/mealChime.ts, там же DEFAULT_VARIANT = v2.';

commit;

-- ── VERIFY (ЧИТАЕТ, НЕ ПИШЕТ) ────────────────────────────────────────────────
-- select center_id, chime_variant from menumaker.meal_count_settings order by 1;
--   ждём: строка на каждый центр, значение из ('v1','v2','v3'), по умолчанию v2.
-- select conname from pg_constraint
--  where conrelid = 'menumaker.meal_count_settings'::regclass and conname like '%chime%';
--   ждём: meal_count_settings_chime_variant_chk
