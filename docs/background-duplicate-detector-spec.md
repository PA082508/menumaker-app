# Background Duplicate-Child Detector — Spec

Status: **DRAFT for review** (2026-07-07). Batch order: this spec → reconciliation
table (132 skeletons) → Stage 0 → Stage 1. **No `current`-eligibility flips** in
any of these steps — the detector only *surfaces*, it never mutates the roster.

## 1. Goal

Surface likely-duplicate child records that already exist in the roster as
**action items**, so a director can reconcile them (keep one, merge, repoint
eligibility) through the recon table. This is the *background* companion to the
already-shipped **gate detector** (`matchRoster` in `src/lib/enrollmentApprove.ts`,
commit `25bff4f`), which prevents *new* duplicates at approve time but does
nothing about the duplicates already sitting in the roster.

Live baseline (2026-07-07, exact normalized-name + same/again-null DOB, active
roster only): **17 duplicate pairs across 1 center**. The fuzzy and skeleton arms
(below) will add more. Compare with the separately-tracked **132 skeleton**
records that feed the reconciliation table.

## 2. Where it plugs in

`menumaker.refresh_action_items(p_org_id, p_as_of)` already runs 7 idempotent
"scan" blocks (licenses, claim deadlines, documents, IEA/FRP eligibility, milk
substitution, unsigned weeks, licenses-without-date). Each block:

1. `update action_items set status='resolved' … where source='<scan>' and status='open'`
2. loops a detection query and calls `raise_action_item(…, dedup_key)` per hit
3. increments a counter returned in the summary `jsonb`.

The duplicate detector is **block 8**, same shape, `source='duplicate_scan'`.

### Why `dedup_key` gives idempotency + respects the director

`raise_action_item` upserts on `(org_id, dedup_key)` and **preserves
`dismissed`/`snoozed`** status on re-raise. A **stable per-cluster key** means:

- re-running the scan updates the same row in place (no duplicate action items),
- a director who dismisses "these two are actually twins, not a dup" stays
  dismissed across nightly runs,
- when the underlying duplicate is merged away, step (1)'s resolve-sweep closes
  the item (it is no longer re-raised).

Key scheme: `dup:<center_id>:<roster_id_lo>:<roster_id_hi>` (the two roster ids
sorted, so the key is order-independent and unique per pair).

## 3. Detection algorithm (mirror the gate detector)

Mirror `matchRoster` so the background scan and the approve-time gate agree:

- **Normalize** the name: `norm_name(child_name)` = lower-case, accent-strip,
  collapse whitespace. (See §5 — needs a small SQL helper; the JS gate uses
  `normName`.)
- Candidate pair = two **active** roster rows in the **same center** with
  `a.id < b.id` (no self-pairs, each pair once) where **either**:
  - **exact** normalized name equal, **or**
  - **fuzzy** `levenshtein(nn_a, nn_b) <= (len<=6 ? 1 : 2)` — same tolerance as
    the gate.
- **DOB corroboration** (prevents false positives):
  - **exact-name** pair qualifies when DOBs are equal **or one is null**
    (the null-DOB case is the classic *skeleton vs full record*).
  - **fuzzy-name** pair qualifies **only** when both DOBs are present **and
    equal** (never on a null DOB — too risky for a spelling-variant match).

"Active" = `coalesce(is_active,true)` and `(date_out is null or date_out >= p_as_of)`.

## 4. Draft SQL (block 8 of refresh_action_items)

```sql
-- ===== 8) DUPLICATE ROSTER CHILDREN =====
update menumaker.action_items set status='resolved', resolved_at=now(), updated_at=now()
 where org_id=p_org_id and source='duplicate_scan' and status='open';
for rec in
  with active as (
    select r.id, r.center_id, r.child_name, r.birthday,
           menumaker.norm_name(r.child_name) as nn
    from menumaker.roster r
    where r.org_id=p_org_id and coalesce(r.is_active,true)
      and (r.date_out is null or r.date_out >= p_as_of)
  ),
  pairs as (
    select a.center_id,
           a.id id_lo, b.id id_hi, a.child_name name_a, b.child_name name_b,
           a.birthday dob_a, b.birthday dob_b,
           (a.nn = b.nn) as exact_name
    from active a
    join active b on a.center_id = b.center_id and a.id < b.id
    where (
            a.nn = b.nn
            or menumaker.levenshtein(a.nn, b.nn) <= case when length(a.nn) <= 6 then 1 else 2 end
          )
      and case
            when a.nn = b.nn                                          -- exact name
              then (a.birthday is null or b.birthday is null or a.birthday = b.birthday)
            else (a.birthday is not null and b.birthday is not null   -- fuzzy name: DOB required
                  and a.birthday = b.birthday)
          end
  )
  select p.*, ct.name center_name
  from pairs p left join menumaker.centers ct on ct.id = p.center_id
loop
  perform menumaker.raise_action_item(
    p_org_id, 'data_quality', 'high',
    'Possible duplicate child: '||rec.name_a||' / '||rec.name_b||' ('||coalesce(rec.center_name,'?')||')',
    'Two active roster records look like the same child'||
      case when rec.dob_a is null or rec.dob_b is null
             then ' (one has no birthday — likely a skeleton record).'
           else ' (matching birthday '||to_char(coalesce(rec.dob_a,rec.dob_b),'MM/DD/YYYY')||').' end||
      ' Reconcile: keep one record, merge, and repoint eligibility. Do not delete without review.',
    'duplicate_scan', 'roster', rec.id_hi,
    'dup:'||rec.center_id||':'||rec.id_lo||':'||rec.id_hi, null);
  v_dup := v_dup + 1;
end loop;
```

Add `v_dup int := 0;` to the `declare` block and `'duplicates', v_dup` to the
returned `jsonb_build_object`.

## 5. Dependencies

1. **`menumaker.norm_name(text)`** — a SQL mirror of the JS `normName`
   (lower + strip accents + collapse spaces). Minimal ASCII-safe version:
   `lower(regexp_replace(trim($1), '\s+', ' ', 'g'))`. Accent-strip needs the
   `unaccent` extension (not currently installed — decide in §7).
2. **`levenshtein`** — from the **`fuzzystrmatch`** extension, **not installed**
   (`has_fuzzystrmatch=false`). Options:
   - **(recommended)** `create extension fuzzystrmatch` — enables the fuzzy arm,
     matching the gate detector exactly.
   - **or** ship **exact-name+DOB only** now (already 17 live hits), add the
     fuzzy arm when the extension is approved. The SQL degrades cleanly: drop the
     `or levenshtein(...)` term and the `else` branch.

## 6. Non-destructive guarantee

- The detector **only** reads `roster` and writes `action_items`. It never
  updates/merges/deletes roster rows and never touches `frp` / `income_eligibility`.
- Merging is a **separate, human-driven** step in the reconciliation table (next
  batch item) — the same keep→merge→repoint flow used for the Ridge gate#1 merge.
- Consistent with the standing rule: **no `current` flips** here.

## 7. Test & rollout plan

1. Ship `norm_name` + (optionally) `fuzzystrmatch` as one migration.
2. Ship block 8 as a `create or replace` migration of `refresh_action_items`.
3. Dry-run: `select menumaker.refresh_action_items('<org>')` → expect
   `duplicates` ≈ 17 (exact-only) on the current data; eyeball a sample of the
   raised items.
4. Idempotency check: run twice → same open count, no growth; dismiss one → it
   stays dismissed on the third run.
5. Merge-closes check: merge one duplicate in the recon table → next run resolves
   its action item (not re-raised).
6. Cron: `refresh_action_items` is already invoked by the existing action-items
   refresh job — no new schedule needed; confirm it runs per-org.

## 8. Open questions (evening packet)

1. **Category**: reuse `data_quality` (renders today) or add a dedicated
   `duplicate` category (needs an Action-Items UI label/filter)?
2. **Fuzzy arm now or later**: approve `create extension fuzzystrmatch` (+ maybe
   `unaccent`), or ship exact-name+DOB first?
3. **Severity**: `high` (proposed) vs `normal` — duplicates are audit/claim risk
   (double-count / wrong eligibility) but not time-critical.
4. **Twins**: same name + same DOB can be legit twins. Dismiss handles it
   per-pair; do we also want a per-center "known twins" allowlist so they never
   re-raise?
5. **Clusters >2**: three+ matching rows currently raise one item per *pair*
   (3 rows → 3 items). Acceptable, or collapse to one item per cluster?
6. **Inactive/skeleton scope**: this scans active rows only. The 132-skeleton
   reconciliation table handles inactive/skeleton records separately — confirm
   we don't want the detector to also surface active↔inactive skeleton pairs.
