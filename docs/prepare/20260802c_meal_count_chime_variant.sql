-- =====================================================================================
-- 20260802c — ГОЛОС РИТУАЛА «ПРИСТЕГНИ РЕМНИ», ПО ЦЕНТРУ.
--             ⚠️ НЕ ПРИМЕНЕНО. Применять словом, вместе с выпуском ветки
--             feat/buckle-up-meal-ritual-20260802 — не раньше миграции ключа.
--
-- ЧТО ДЕЛАЕТ. Одна колонка: какую из трёх мелодий играет экран счёта этого центра.
-- Не настройка звука вообще, а именно выбор голоса: сам ритуал включён всегда.
--
-- ПОЧЕМУ ПО ЦЕНТРУ, А НЕ ПО УСТРОЙСТВУ. Мелодию слышит группа, а не планшет:
-- в одном центре все комнаты должны звонить одинаково, иначе «это у нас или у
-- соседей?» становится ежедневным вопросом. Настройка живёт там же, где остальные
-- решения центра о счёте, — в meal_count_settings (ключ center_id).
--
-- ДО ПРИМЕНЕНИЯ КЛИЕНТ РАБОТАЕТ. Экран читает колонку ОТДЕЛЬНЫМ запросом и на
-- отказ отвечает голосом по умолчанию плюс выбор в localStorage устройства, а в
-- настройках честно пишет «хранится на этом устройстве». Так сделано нарочно:
-- PostgREST отбивает ВЕСЬ select на одну неизвестную колонку, и запрос вместе с
-- active_slots оставил бы экран счёта без настроек целиком (правило
-- docs/platform-standards.md: отказ, съеденный молча, рисует уверенный пустой экран).
--
-- ОТКАТА НЕ ТРЕБУЕТ: колонка с умолчанием, старый клиент её не видит и не пишет.
-- =====================================================================================

begin;

alter table menumaker.meal_count_settings
  add column if not exists chime_variant text not null default 'v1';

alter table menumaker.meal_count_settings
  drop constraint if exists meal_count_settings_chime_variant_chk;
alter table menumaker.meal_count_settings
  add constraint meal_count_settings_chime_variant_chk
  check (chime_variant in ('v1','v2','v3'));

comment on column menumaker.meal_count_settings.chime_variant is
  'Голос ритуала «Пристегни ремни» для этого центра: v1 «It''s time to eat!», '
  'v2 «Wash your hands and eat», v3 «Yummy-yummy time!». Закрытие окна (D4→A3) '
  'одинаково во всех вариантах. Ноты и слова — src/lib/mealChime.ts.';

commit;

-- ── VERIFY (ЧИТАЕТ, НЕ ПИШЕТ) ────────────────────────────────────────────────
-- select center_id, chime_variant from menumaker.meal_count_settings order by 1;
--   ждём: строка на каждый центр, значение из ('v1','v2','v3'), по умолчанию v1.
-- select conname from pg_constraint
--  where conrelid = 'menumaker.meal_count_settings'::regclass and conname like '%chime%';
--   ждём: meal_count_settings_chime_variant_chk
