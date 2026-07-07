-- ============================================================================
-- Skeleton reconciliation — 8 exact-name mergeable pairs
-- *** EXECUTED 2026-07-07 (director GO). DO NOT RE-RUN. ***
-- Result: 7 IE repoints (Wynn skipped) + 8 skeleton retires. Verified:
--   retired_skeletons=8, wynn_ie_on_stub=1, keepers_active=8, repointed_to_keepers=7.
-- Kept as the executed record + undo reference (repoint back + reactivate to revert).
-- Generated 2026-07-07 for evening one-batch execution after review.
-- All 8 are at Play Academy Ridge (center 4aed7d5a-00d0-4a4c-ac99-311046ad2027).
-- Same keep→merge→repoint flow as Ridge gate#1 (commit 25bff4f).
--
-- INVARIANTS verified at prep time:
--   * every skeleton: source='masterlist_fiscal', birthday NULL, is_active=false,
--     carries exactly one FY2026 income_eligibility row.
--   * every keeper: source=NULL, is_active=true, has NO income_eligibility row
--     -> repoint is clean (no duplicate / no unique-constraint clash).
--   * 268 orphan skeletons are NOT touched by this batch.
-- RULE: never flip the keeper's live roster.frp as a side effect. Two pairs have
--   a stub-vs-keeper eligibility CONFLICT (see ⚠ below) — left for director call.
-- Each block is reversible (repoint back + reactivate).
-- ============================================================================

BEGIN;  -- run as one transaction; ROLLBACK if any count looks wrong

-- 1. Allen Zaiden      stub R  = keeper R  (match)
UPDATE menumaker.income_eligibility SET roster_id='e5dc7f6e-dd8c-43fa-9374-a2a4caefe7ab', child_id=NULL
  WHERE id='3c5b97a6-d679-4238-867a-4f6714d74aec';
UPDATE menumaker.roster SET is_active=false, deactivation_reason='merged→Allen Zaiden (e5dc7f6e)', source='reconciled'
  WHERE id='728b3c57-5625-4735-aebb-80b3f50dbc82';

-- 2. Balas Derrick     stub F  = keeper F  (match)
UPDATE menumaker.income_eligibility SET roster_id='3555bb51-cce1-4bf2-a4b1-86d388106905', child_id=NULL
  WHERE id='9ad0d52d-6b8f-4e2d-b295-661198ec58c8';
UPDATE menumaker.roster SET is_active=false, deactivation_reason='merged→Balas Derrick (3555bb51)', source='reconciled'
  WHERE id='2c2d3853-ebae-4fa3-a50e-b1f9d56a9d4f';

-- 3. Dentz Liam        stub R  = keeper R  (match)
UPDATE menumaker.income_eligibility SET roster_id='5d033197-5d10-4106-837d-7a9b67b9d89b', child_id=NULL
  WHERE id='e44a29a0-a71c-424d-916d-51daf1d4673d';
UPDATE menumaker.roster SET is_active=false, deactivation_reason='merged→Dentz Liam (5d033197)', source='reconciled'
  WHERE id='8b55a9b9-db37-4cda-8bf1-9dbb728ad02e';

-- 4. Green Dominic     ⚠ stub P  vs keeper frp F  — CONFLICT.
--    Default: repoint the IE row but DO NOT adopt P (keeper stays F). The stub's
--    P becomes attached prior-cycle history. To adopt P onto the keeper, route
--    through recordDetermination (audited) — director opt-in only.
UPDATE menumaker.income_eligibility SET roster_id='2b9d7834-5617-40b9-a83b-dbb341a6cfc1', child_id=NULL
  WHERE id='164f97a7-72f5-4cc7-becd-7bf0342a1c4f';
UPDATE menumaker.roster SET is_active=false, deactivation_reason='merged→Green Dominic (2b9d7834); stub elig P not adopted, keeper F', source='reconciled'
  WHERE id='56dd95f0-d055-4031-a39f-4266544292ff';

-- 5. Hodges Khali      stub F  = keeper F  (match)
UPDATE menumaker.income_eligibility SET roster_id='5af52d2c-55eb-4da2-837c-b176353bf77b', child_id=NULL
  WHERE id='bec60efb-6ae0-4f1d-89b2-c51bd0633a08';
UPDATE menumaker.roster SET is_active=false, deactivation_reason='merged→Hodges Khali (5af52d2c)', source='reconciled'
  WHERE id='e8c4dcec-d7f0-434e-9ffe-4c04bc2ee261';

-- 6. Monroe Jersey     stub F  = keeper F  (match)
UPDATE menumaker.income_eligibility SET roster_id='7115d9b6-5838-4f29-9681-ae83a478e0ed', child_id=NULL
  WHERE id='ce4549fc-732d-4cd3-aae7-afa1eef82385';
UPDATE menumaker.roster SET is_active=false, deactivation_reason='merged→Monroe Jersey (7115d9b6)', source='reconciled'
  WHERE id='ca32f8a3-9822-4cf8-9421-ac3f19cb3956';

-- 7. Singleton Daryl   stub F  = keeper F  (match).  Keeper HAS child_id -> carry it.
UPDATE menumaker.income_eligibility SET roster_id='ea188c12-972f-48e0-bdf9-300abd068acc', child_id='82fb4ad4-4b47-48a7-bcad-0a61a3704fd6'
  WHERE id='c04bd4fa-dd07-4c70-a663-bf3e137adbd3';
UPDATE menumaker.roster SET is_active=false, deactivation_reason='merged→Singleton Daryl (ea188c12)', source='reconciled'
  WHERE id='a4f9750b-c687-41a6-8492-317d31d3d72e';

-- 8. Wynn Devyn        ⚠ stub IE eligibility is NULL (empty stub row); keeper frp P.
--    Nothing to carry. RECOMMENDED: do NOT repoint an empty IE row onto the keeper
--    (would add a blank FY2026 row). Retire the stub and leave its null IE as history.
--    => the repoint line below is commented out on purpose; confirm at review.
-- UPDATE menumaker.income_eligibility SET roster_id='d5a7c78b-b2e5-4cb6-8722-0d1808afd635', child_id=NULL
--   WHERE id='bfaa3d22-abf2-410e-871c-46812c30e780';
UPDATE menumaker.roster SET is_active=false, deactivation_reason='merged→Wynn Devyn (d5a7c78b); empty stub IE left as history', source='reconciled'
  WHERE id='8390a17c-1ba6-4a94-aecb-dc58c01621f8';

-- Expected: 7 IE repoints (Wynn skipped) + 8 roster retires.
-- Verify BEFORE COMMIT:
--   SELECT count(*) FROM menumaker.income_eligibility WHERE roster_id IN (
--     'e5dc7f6e-dd8c-43fa-9374-a2a4caefe7ab','3555bb51-cce1-4bf2-a4b1-86d388106905',
--     '5d033197-5d10-4106-837d-7a9b67b9d89b','2b9d7834-5617-40b9-a83b-dbb341a6cfc1',
--     '5af52d2c-55eb-4da2-837c-b176353bf77b','7115d9b6-5838-4f29-9681-ae83a478e0ed',
--     'ea188c12-972f-48e0-bdf9-300abd068acc');  -- expect 7
--   SELECT count(*) FROM menumaker.roster WHERE source='reconciled'
--     AND deactivation_reason LIKE 'merged→%';  -- expect 8 (this batch)

ROLLBACK;  -- flip to COMMIT only after the counts check out at review
