# Evening packet — 2026-07-07

Questions batched per your instruction ("вопросы — в вечерний пакет, не жди меня").
Everything below is non-blocking for what already shipped today.

## Shipped today (all on `main`, pushed → Vercel)
- `bd267fa` — staff pseudo-classes out of the meal grid + `compute_monthly_claim` RPC (name-filter → `is_roster`).
- `0f43f44` — Layer 1: IEA F/R/P editor + `income_eligibility` write (was admin-gated).
- `8c11133` — Layer 3: Eligibility Reconciliation report + 🟡 claim-preview badge.
- `a0efa05` — Layer 2: profile late-corrections write determinations (shared `recordDetermination`).
- `6b92879` — gates lifted (you said "Layer 1 verified").

## Specs written today (drafts, not yet built)
- `docs/background-duplicate-detector-spec.md`
- `docs/skeleton-reconciliation-table-spec.md`

## Decisions I made autonomously (flag if wrong)
1. **"снимай оба гейта"**: Layer 2 was never separately gated, so instead of
   adding a gate just to remove it, I removed the Layer 1 gate and left Layer 2
   open. Net = both `recordDetermination` paths open. If you actually wanted
   Layer 2 gated **going forward**, say so and I'll add the admin-gate.
2. Reset rejected IEA `7fa139f3` (Teighan Graves, Ridge) → `pending` so you had a
   verification target. It's still `pending`; re-reject or approve as you like.

## Duplicate detector — questions
1. Category: reuse `data_quality`, or add a dedicated `duplicate` category (UI label)?
2. Fuzzy arm now (approve `create extension fuzzystrmatch` + maybe `unaccent`) or
   ship exact-name+DOB only first (17 live hits)?
3. Severity `high` vs `normal`?
4. Twins (same name+DOB) — per-pair dismiss enough, or a "known twins" allowlist?
5. Clusters >2 rows: one item per pair (current) or collapse per cluster?

## Skeleton reconciliation — questions
1. Confirm **"132"** vs live numbers: 276 skeletons total, **8** exact-keeper
   mergeable, **268** orphan, each with 1 `income_eligibility` row. Is 132 a
   center subset / fuzzy-candidate count / pre-merge history?
2. Orphans (268, mostly inactive fiscal stubs): default **Retire**, or hold as
   "unmatched, needs human ID"? Any real children in there we must keep?
3. On merge, if the skeleton's masterlist F/R differs from the keeper's current
   `frp`: ever adopt it, or always keep the keeper and treat the stub IE as history?
4. Entry point: click a duplicate **action item** → opens the recon row, or a
   standalone report?

## BLOCKER — need definitions to continue the batch
**Stage 0** and **Stage 1** are not defined in the repo or memory to a build-ready
level. To spec/build them I need: what each delivers, acceptance criteria, and how
they relate to the skeleton recon table. (Standing rule noted: **no `current`
flips**.) Until then the batch stops after the two specs above.
