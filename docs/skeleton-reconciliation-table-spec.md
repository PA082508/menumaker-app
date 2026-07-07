# Skeleton Reconciliation Table — Spec

Status: **DRAFT for review** (2026-07-07). Batch order: detector spec →
**this** → Stage 0 → Stage 1. **No `current`-eligibility flips.**

## 1. What a "skeleton" is (live data 2026-07-07)

The fiscal masterlist import created stub roster rows: `source='masterlist_fiscal'`,
**null birthday**, carrying an `income_eligibility` FY2026 row (F/R/P from the
masterlist). They are not full enrollment records.

| Metric | Count |
|---|---|
| Total roster | 616 |
| Real records (`source=null`) | 337 (335 active) |
| **Skeletons** (`masterlist_fiscal`, null DOB) | **276** (2 active, 274 inactive) |
| Skeletons with an exact-name keeper in same center (**mergeable**) | 8 |
| Skeletons with no name-match (**orphan**) | 268 |
| `income_eligibility` rows attached to skeletons | 276 (1:1) |

("132" from earlier notes is a subset — confirm its exact definition; the live
exact-match split is 8 mergeable / 268 orphan. Fuzzy matching will move some
orphans into the mergeable bucket.)

## 2. Goal

A director-facing worksheet to resolve each skeleton into one of three outcomes,
**repointing its `income_eligibility` row** as needed and **never flipping the
child's current effective eligibility** (`roster.frp`) as a side effect:

- **Merge** → skeleton is the same child as an existing keeper. Repoint the
  skeleton's `income_eligibility` to the keeper's `roster_id`, carry any data the
  keeper lacks, then retire the skeleton (`is_active=false`, tagged). Same
  keep→merge→repoint flow as the Ridge gate#1 merge (commit `25bff4f`).
- **Promote** → skeleton is a real child missing from enrollment. Keep it, mark
  it reconciled; it becomes a normal roster record (fill DOB etc. later).
- **Retire** → stale/departed, not needed. `is_active=false`, tagged reconciled;
  its `income_eligibility` is left as prior-cycle history (not claimed — inactive
  children are excluded everywhere).

All three are **explicit director actions**. The table only proposes; it never
auto-merges.

## 3. Match proposal (reuse the detector algorithm)

For each skeleton, propose keeper candidates in the same center using the **same
matcher as the background duplicate detector** (see
`background-duplicate-detector-spec.md`): exact normalized name, then fuzzy
`levenshtein <= (len<=6?1:2)`. Skeletons have null DOB, so a fuzzy match cannot be
DOB-corroborated → **fuzzy candidates are shown as "review" suggestions, not
auto-selectable** (exact-name candidates can be pre-selected). This keeps the
false-merge risk low.

## 4. Surface

New reports/admin page (mirror `EligibilityReconciliationReport` structure):
route `/skeleton-reconciliation`, Reports nav (admin/office only). Center-scoped
via `useOrg`. Columns per skeleton:

`Skeleton name · center · IE eligibility on the stub · proposed keeper (exact /
fuzzy / none) · action [Merge ▸ / Promote / Retire] · status`

Filters: mergeable (has exact keeper) | orphan | all. Bulk-confirm the exact
matches (8 today) in one pass; work orphans individually. Printable like the
eligibility recon sheet.

## 5. Writes (all reversible, none flip `current`)

- **Merge**: `update income_eligibility set roster_id=<keeper>, child_id=<keeper.child_id>`
  for the skeleton's IE rows; append a `determination_log` note (source
  `skeleton_merge`) **without** changing the keeper's live `roster.frp` unless the
  director explicitly opts to adopt the skeleton's eligibility; `update roster set
  is_active=false, deactivation_reason='merged→<keeper>', source='reconciled'`
  on the skeleton. Provide an undo (repoint back + reactivate).
- **Promote**: `update roster set source='reconciled'` (+ optional DOB) on the
  skeleton; leave IE as-is.
- **Retire**: `update roster set is_active=false, deactivation_reason='skeleton retired'`;
  leave IE as prior-cycle history.

Guardrail: the merge repoints eligibility **records** but leaves the keeper's
effective `roster.frp` (`current`) untouched by default — matches the standing
"no current flips" rule. Adopting the skeleton's eligibility onto the keeper is a
second, explicit checkbox that routes through `recordDetermination` (audited).

## 6. Open questions (evening packet)

1. Confirm the **"132"** definition vs the live 8 mergeable / 268 orphan / 276
   total. Is 132 a center subset, a fuzzy-candidate count, or pre-merge history?
2. **Orphans (268)**: default disposition — Retire, or hold as "unmatched, needs
   human ID"? Most are inactive fiscal stubs; are any real children we must keep?
3. **Merge → adopt eligibility?** When a skeleton's masterlist F/R differs from
   the keeper's current `frp`, do we ever adopt it, or always keep the keeper's
   determination and treat the skeleton's IE as history?
4. Should this reuse the **duplicate-detector** action items as the entry point
   (click an action item → opens the recon row), or be a standalone report?
5. Extension dependency (`fuzzystrmatch`) shared with the detector — same
   decision.

## 7. Blocked downstream — needs definition

**Stage 0 / Stage 1** (next in the batch) are not defined in the repo or memory
to a build-ready level. Before I spec/build them I need, in the evening packet:
what Stage 0 and Stage 1 each deliver, their acceptance criteria, and how they
relate to the recon table above. (Standing constraint noted: no `current` flips.)
