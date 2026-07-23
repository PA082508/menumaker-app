-- 20260723b_packet_sets_origin_owner_only.sql — RLS hardening: all-centers copies = owner-only edit
--
-- ✅ APPLIED 2026-07-23 на прод (Nikolay «флип #5 + прокат RLS», тем же заходом, что и флип
--    витрины #5 parent-forms.html). Read-back зелёный: R1 origin_owner_only · RESTRICTIVE ·
--    UPDATE, using `(origin_id IS NULL OR is_org_owner(org_id))`; 5 политик всего; R3 = 0 строк
--    с origin_id (размножений ещё нет) → нулевое влияние на текущие данные.
--
-- ЗАЧЕМ. Кусок B «All centers» размножает набор в custom-копии по центрам (общий origin_id),
-- состав правится в ОДНОМ месте и зеркалится. UI уже прячет правку origin-копий от директора
-- (canEdit = isOrgAdmin для origin-строк), НО живой RLS `upd` пока РАЗРЕШАЕТ директору править
-- СВОЮ центровую копию (custom + center_id ∈ my_center_ids), т.е. диверджить её от origin.
-- Дублируем UI-гейт политикой: origin-строки (origin_id IS NOT NULL) правит ТОЛЬКО хозяин/GD.
--
-- КАК. RESTRICTIVE-политика ∧-ится со всеми permissive. Обычные custom-наборы (origin_id NULL)
-- не затронуты; base (origin_id NULL) не затронут. Кусается только у размноженных копий.

begin;

drop policy if exists origin_owner_only on menumaker.packet_sets;
create policy origin_owner_only on menumaker.packet_sets
  as restrictive for update to authenticated
  using      (origin_id is null or menumaker.is_org_owner(org_id))
  with check (origin_id is null or menumaker.is_org_owner(org_id));

commit;

-- ═════════════════════════════════════════════════════════════════════════════
-- READ-BACK — вердикт колонками (вписать после apply)
-- ═════════════════════════════════════════════════════════════════════════════
-- R1. Политика есть, RESTRICTIVE, cmd=UPDATE:
--   select policyname, permissive, cmd from pg_policies
--    where schemaname='menumaker' and tablename='packet_sets' and policyname='origin_owner_only';
--   -- ждём: origin_owner_only · RESTRICTIVE · UPDATE
-- R2. Функциональный (в txn, ROLLBACK — не на живой без слова):
--   -- директор Pearl правит СВОЮ origin-копию (origin_id not null, center=pearl) → UPDATE 0 (заблокировано);
--   -- хозяин правит любую origin-копию → OK;
--   -- директор правит обычный свой custom (origin_id null) → OK (не затронуто);
--   -- base (origin_id null) правит хозяин → OK.
-- R3. Существующие наборы: 0 строк с origin_id not null сегодня (размножений ещё нет) →
--     нулевое влияние на текущие данные; политика вступит в силу, когда появятся All-centers наборы.
