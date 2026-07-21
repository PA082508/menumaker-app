-- 20260721d_packet_sets_origin.sql — CAMPAIGN/SET BUILDER: задел родства копий (origin_id)
--
-- ⛔ PREPARE — НЕ ПРИМЕНЕНО. Применяет Николай (или CC по его go) по live-DB протоколу:
--    prepare → go → apply → read-back вердиктом колонками.
--
-- ЗАЧЕМ (решение Николая 21.07: «поле сейчас, механизм потом»). Когда хозяин создаёт
-- набор с охватом «все центры» (кусок B, #3c), система РАЗМНОЖАЕТ его в N независимых
-- custom-копий (по одной на центр). origin_id связывает копии-сиблинги: все копии одного
-- размножения несут общий origin_id (= id набора-шаблона или общий uuid партии).
--
-- ⚠️ МЕХАНИЗМ НЕ СТРОИМ. Отложенный вопрос: «раскатка орг-обновления во все копии с
--    уважением к директорским правкам» (стратегия слияния — что перезаписывать, что
--    беречь) — позже. Сейчас только КОЛОНКА-задел: nullable, без писателя, RLS не трогаем.
--    Существующие 4 базовых набора остаются origin_id = NULL (сиблингов нет).

begin;

alter table menumaker.packet_sets
  add column if not exists origin_id uuid;

comment on column menumaker.packet_sets.origin_id is
  'Родство размноженных копий: custom-копии одного орг-размножения («все центры») несут '
  'общий origin_id. NULL = самостоятельный набор (base, или custom без размножения). '
  'ЗАДЕЛ — механизм раскатки орг-обновления по копиям пока НЕ построен (стратегия слияния '
  'с уважением к директорским правкам — отложено).';

-- Индекс для будущего «найти сиблингов по origin_id» — дёшев, только по не-NULL.
create index if not exists packet_sets_origin_idx
  on menumaker.packet_sets (origin_id) where origin_id is not null;

commit;

-- ═════════════════════════════════════════════════════════════════════════════
-- READ-BACK — вердикт колонками
-- ═════════════════════════════════════════════════════════════════════════════
-- R1. Колонка есть, nullable, тип uuid:
--   select column_name, data_type, is_nullable from information_schema.columns
--    where table_schema='menumaker' and table_name='packet_sets' and column_name='origin_id';
--   -- ждём: origin_id · uuid · YES
-- R2. Индекс есть:
--   select indexname from pg_indexes where schemaname='menumaker' and tablename='packet_sets'
--     and indexname='packet_sets_origin_idx';   -- 1 строка
-- R3. Существующие наборы не тронуты (все origin_id NULL, 4 base на месте):
--   select count(*) as total, count(origin_id) as with_origin from menumaker.packet_sets;  -- 4 · 0
