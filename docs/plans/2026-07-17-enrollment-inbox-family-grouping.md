# Enrollment Inbox — group by child + mark signature forms — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fold the flat 70–80-row Enrollment Inbox into one collapsible block per child, with the three director-countersign forms visibly marked — so a director works blocks, not rows.

**Architecture:** A new pure module `src/lib/enrollmentGrouping.ts` folds `Submission[]` into `ChildGroup[]` by a normalized, token-order-insensitive child-name key, and flags which forms need the director's signature (via existing `countersignSlot`). `EnrollmentInboxPage` renders those groups instead of a flat list; the existing per-row Review/Approve is unchanged. No new database writes.

**Tech Stack:** React 18 + TypeScript, Vite, Vitest (`vitest run`), Supabase JS (unused here — Phase 1 is read/display only).

## Global Constraints

- **Phase 1 adds NO database writes.** Grouping is display only; the existing per-row Review → Approve path is the only writer. Claim-bridge untouched.
- **The three countersign forms = list A** (owner's decision 2026-07-17): `dcy_01234`, `iea`, `start_form` — read from `COUNTERSIGN_SLOT` via `countersignSlot()`, never a second hardcoded list.
- **Namesake grouping is a DISPLAY aid, never an identity claim.** A wrong group is visible and the director re-links at Review; grouping writes nothing.
- **Nothing is dropped.** A submission with a blank `form_data.child_name` falls into a single `(no name)` bucket, still rendered.
- Test command: `pnpm test` (`vitest run`). Single file: `pnpm test -- src/lib/enrollmentGrouping.test.ts`.
- Follow existing style: inline-style React (no CSS modules), `normName` for name normalization, files under `src/lib` for pure logic + `.test.ts` sibling.

---

## File Structure

- **Create:** `src/lib/enrollmentGrouping.ts` — pure grouping + signature-flag logic. One responsibility: turn a submission list into per-child groups. No React, no Supabase.
- **Create:** `src/lib/enrollmentGrouping.test.ts` — Vitest unit tests for the module.
- **Modify:** `src/pages/enrollment/EnrollmentInboxPage.tsx` — render `visible` as groups; add a group header (collapsible) and a per-row signature mark. Extract the existing per-row card into a small local component so it can be nested under a group without duplicating JSX.

Phase 2 (deferred — see end): `planChildPacketApprove()` / `runChildPacketApprove()` batch orchestrator + "Sign & file all" button. Not built here.

---

## Task 1: Grouping module (`enrollmentGrouping.ts`)

**Files:**
- Create: `src/lib/enrollmentGrouping.ts`
- Test: `src/lib/enrollmentGrouping.test.ts`

**Interfaces:**
- Consumes: `normName` from `src/lib/enrollmentApprove.ts` (`export const normName = (s: any): string`); `countersignSlot` from `src/lib/signatureSamples.ts` (`(submissionType: string) => string | null`).
- Produces (relied on by Task 2):
  - `type GroupableSubmission = { id: string; submission_type: string; form_data: any; child_id: string | null; status: string; created_at: string }`
  - `function signatureRequired(submissionType: string): boolean`
  - `type ChildGroup = { key: string; childName: string; submissions: GroupableSubmission[]; signatureCount: number }`
  - `function groupSubmissionsByChild(subs: GroupableSubmission[]): ChildGroup[]`

- [ ] **Step 1: Write the failing test**

Create `src/lib/enrollmentGrouping.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  signatureRequired, groupSubmissionsByChild,
  type GroupableSubmission,
} from './enrollmentGrouping'

const sub = (o: Partial<GroupableSubmission> & { type: string; name?: any; at?: string }): GroupableSubmission => ({
  id: o.id ?? Math.random().toString(36).slice(2),
  submission_type: o.type,
  form_data: { child_name: o.name },
  child_id: o.child_id ?? null,
  status: o.status ?? 'pending',
  created_at: o.at ?? '2026-07-17T10:00:00Z',
})

describe('signatureRequired — list A only (dcy_01234, iea, start_form)', () => {
  it('is true for the three countersign forms', () => {
    expect(signatureRequired('dcy_01234')).toBe(true)
    expect(signatureRequired('iea')).toBe(true)
    expect(signatureRequired('start_form')).toBe(true)
  })
  it('is false for consent, cacfp and unknown forms', () => {
    expect(signatureRequired('parent_consent')).toBe(false)
    expect(signatureRequired('cacfp_enrollment')).toBe(false)
    expect(signatureRequired('parents_book_ack')).toBe(false)
    expect(signatureRequired('anything')).toBe(false)
  })
})

describe('groupSubmissionsByChild', () => {
  it('folds all forms of one child into a single group', () => {
    const groups = groupSubmissionsByChild([
      sub({ type: 'cacfp_enrollment', name: 'Hazel Broadwater' }),
      sub({ type: 'parent_consent', name: 'Hazel Broadwater' }),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].submissions).toHaveLength(2)
    expect(groups[0].childName).toBe('Hazel Broadwater')
  })

  it('groups regardless of token order and case (typed-name robustness)', () => {
    const groups = groupSubmissionsByChild([
      sub({ type: 'cacfp_enrollment', name: 'Hazel Broadwater' }),
      sub({ type: 'parent_consent', name: 'broadwater  hazel' }),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].submissions).toHaveLength(2)
  })

  it('keeps different children in different groups', () => {
    const groups = groupSubmissionsByChild([
      sub({ type: 'cacfp_enrollment', name: 'Hazel Broadwater' }),
      sub({ type: 'cacfp_enrollment', name: 'Aaron Broadwater' }),
    ])
    expect(groups).toHaveLength(2)
  })

  it('counts the signature forms in the group', () => {
    const groups = groupSubmissionsByChild([
      sub({ type: 'dcy_01234', name: 'Hazel Broadwater' }),
      sub({ type: 'iea', name: 'Hazel Broadwater' }),
      sub({ type: 'parent_consent', name: 'Hazel Broadwater' }),
    ])
    expect(groups[0].signatureCount).toBe(2)
  })

  it('buckets a blank name into a single (no name) group rather than dropping it', () => {
    const groups = groupSubmissionsByChild([
      sub({ type: 'parent_consent', name: '' }),
      sub({ type: 'parent_consent', name: undefined }),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].childName).toBe('(no name)')
    expect(groups[0].submissions).toHaveLength(2)
  })

  it('orders groups by newest submission first', () => {
    const groups = groupSubmissionsByChild([
      sub({ type: 'parent_consent', name: 'Old Child', at: '2026-07-10T09:00:00Z' }),
      sub({ type: 'parent_consent', name: 'New Child', at: '2026-07-17T09:00:00Z' }),
    ])
    expect(groups.map(g => g.childName)).toEqual(['New Child', 'Old Child'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/lib/enrollmentGrouping.test.ts`
Expected: FAIL — `Failed to resolve import "./enrollmentGrouping"` / functions not defined.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/enrollmentGrouping.ts`:

```ts
// ============================================================
// enrollmentGrouping.ts — fold the Inbox's flat submission list into one block
// per child, and flag which forms need the director's signature.
//
// Grouping is a DISPLAY aid. There is no packet/family id on enrollment_submissions
// (each form is its own row), so siblings are grouped by a normalized, token-order-
// insensitive child-name key. A namesake collision is visible and the director
// re-links at Review — grouping writes nothing. (spec 2026-07-17, §2)
// ============================================================

import { normName } from './enrollmentApprove'
import { countersignSlot } from './signatureSamples'

// Subset of the Inbox's Submission that grouping needs.
export type GroupableSubmission = {
  id: string
  submission_type: string
  form_data: any
  child_id: string | null
  status: string
  created_at: string
}

/** A form needs the director's signature before filing iff it declares a
 *  countersignature slot — list A: dcy_01234, iea, start_form (COUNTERSIGN_SLOT).
 *  One source of truth; never a second hardcoded list. */
export function signatureRequired(submissionType: string): boolean {
  return countersignSlot(submissionType) !== null
}

export type ChildGroup = {
  key: string              // token-sorted normalized name; '' for the no-name bucket
  childName: string        // display name, as first typed
  submissions: GroupableSubmission[]
  signatureCount: number   // forms in this group that need a director signature
}

// Token-order-insensitive key: "Hazel Broadwater" and "Broadwater Hazel" collapse.
// Rare false collisions (Anna Maria ↔ Maria Anna) are acceptable for a display
// aid the director confirms; the alternative (order-sensitive) splits one child's
// packet whenever a form types the name in the other order.
function groupKey(raw: any): string {
  return normName(raw).split(' ').filter(Boolean).sort().join(' ')
}

/** Fold submissions into one group per child. Groups are ordered by their newest
 *  submission first; within a group, newest first. Blank names share one
 *  '(no name)' bucket so nothing is dropped. Pure — sorts defensively so the
 *  result does not depend on input order. */
export function groupSubmissionsByChild(subs: GroupableSubmission[]): ChildGroup[] {
  const byKey = new Map<string, ChildGroup>()
  for (const s of subs) {
    const key = groupKey(s.form_data?.child_name)
    const bucket = key || '__noname__'
    let g = byKey.get(bucket)
    if (!g) {
      const raw = s.form_data?.child_name
      const display = typeof raw === 'string' && raw.trim() ? raw.trim() : '(no name)'
      g = { key, childName: display, submissions: [], signatureCount: 0 }
      byKey.set(bucket, g)
    }
    g.submissions.push(s)
    if (signatureRequired(s.submission_type)) g.signatureCount++
  }
  const desc = (a: string, b: string) => (a < b ? 1 : a > b ? -1 : 0)
  const groups = [...byKey.values()]
  for (const g of groups) g.submissions.sort((a, b) => desc(a.created_at, b.created_at))
  groups.sort((a, b) => desc(a.submissions[0]?.created_at ?? '', b.submissions[0]?.created_at ?? ''))
  return groups
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/lib/enrollmentGrouping.test.ts`
Expected: PASS — all cases green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/enrollmentGrouping.ts src/lib/enrollmentGrouping.test.ts
git commit -m "feat(enrollment): group submissions by child + flag signature forms"
```

---

## Task 2: Render groups in the Inbox

**Files:**
- Modify: `src/pages/enrollment/EnrollmentInboxPage.tsx`

**Interfaces:**
- Consumes: `groupSubmissionsByChild`, `signatureRequired`, `type ChildGroup` from Task 1.
- Produces: no new exports — a visual change to the page.

This task has no unit test (the page has no React-testing harness; sibling tests in `src/lib` are pure-function). It is verified by running the app. Keep the change mechanical: group the already-computed `visible` list, render a header per group, nest the existing card.

- [ ] **Step 1: Import the grouping module**

In `src/pages/enrollment/EnrollmentInboxPage.tsx`, after the existing import block (the line `import { scoreMatch, nameForms } from '@/lib/childSearch'`, currently line 20), add:

```tsx
import { groupSubmissionsByChild, signatureRequired, type ChildGroup } from '@/lib/enrollmentGrouping'
```

- [ ] **Step 2: Compute grouped view from `visible`**

`visible` is currently `{ row, v }[]` (computed at ~line 224). After that `useMemo`, add a second `useMemo` that groups the rows and keeps each row's validation result reachable by id:

```tsx
// Fold the flat list into one block per child (spec 2026-07-17). Grouping is a
// display aid over form_data.child_name; Review still links each form by hand.
const grouped = useMemo(() => {
  const vById = new Map(visible.map(({ row, v }) => [row.id, v]))
  const groups = groupSubmissionsByChild(visible.map(x => x.row))
  return { groups, vById }
}, [visible])
```

- [ ] **Step 3: Add group-open state**

Alongside the existing `const [expanded, setExpanded] = useState<string | null>(null)` (line 85), add group collapse state (groups start open — the director wants to see the forms):

```tsx
const [closedGroups, setClosedGroups] = useState<Set<string>>(new Set())
const toggleGroup = (key: string) =>
  setClosedGroups(prev => {
    const next = new Set(prev)
    next.has(key) ? next.delete(key) : next.add(key)
    return next
  })
```

- [ ] **Step 4: Extract the existing card into a local component**

The per-row card JSX currently lives inside `visible.map(({ row, v }) => { … })` (lines ~349–462). Cut that card's JSX (the returned `<div key={row.id} …>…</div>`) into a local function component declared just above the `return (` of `EnrollmentInboxPage`, so it can be reused under a group. Signature:

```tsx
function SubmissionCard({ row, v }: { row: Submission; v: ValidationResult }) {
  const filed = row.status === 'received'
  const isNew = !row.child_id && !filed
  const childName = row.form_data?.child_name || '(no name)'
  const needsSig = signatureRequired(row.submission_type)
  const details = [...v.missing.map(m => ({ kind: 'missing', text: m })),
                   ...v.errors.map(m => ({ kind: 'error', text: m })),
                   ...v.warnings.map(m => ({ kind: 'warning', text: m }))]
  const open = expanded === row.id
  return (
    /* …the existing card JSX, unchanged, EXCEPT the one addition in Step 5… */
  )
}
```

Everything the card already referenced (`expanded`, `setExpanded`, `setReviewing`, `handleReRun`, `rerunning`, `currentCenter`, `centerName`) stays in scope because `SubmissionCard` is declared inside `EnrollmentInboxPage`. Paste the existing card body verbatim into the `return`.

- [ ] **Step 5: Mark the signature forms inside the card**

Inside `SubmissionCard`, in the metadata row that renders `submissionTypeLabel(row.submission_type)` (currently line 388, `<span>{submissionTypeLabel(row.submission_type)}</span>`), append a signature chip right after that span:

```tsx
<span>{submissionTypeLabel(row.submission_type)}</span>
{needsSig && !filed && (
  <span title="Needs your signature before it can be filed" style={{
    fontSize: 11, fontWeight: 700, color: '#92400e', background: '#fffbeb',
    padding: '1px 7px', borderRadius: 6,
  }}>✍️ needs your signature</span>
)}
```

- [ ] **Step 6: Replace the flat map with grouped rendering**

Replace the container that currently maps `visible` (the `<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{visible.map(…)}</div>`, lines ~348–464) with a grouped render:

```tsx
<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
  {grouped.groups.map((g: ChildGroup) => {
    const closed = closedGroups.has(g.key || '__noname__')
    return (
      <div key={g.key || '__noname__'} style={{
        border: '1px solid #e5e7eb', borderRadius: 14, background: '#fbfbfa', overflow: 'hidden',
      }}>
        <div
          onClick={() => toggleGroup(g.key || '__noname__')}
          style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px',
            cursor: 'pointer', background: '#fff', borderBottom: closed ? 'none' : '1px solid #f0f0ef',
          }}
        >
          <span style={{ color: '#9ca3af', fontSize: 12, width: 12 }}>{closed ? '▸' : '▾'}</span>
          <span style={{ fontWeight: 800, fontSize: 15, color: '#0f4c35' }}>{g.childName}</span>
          <span style={{ fontSize: 12, color: '#6b7280' }}>
            {g.submissions.length} form{g.submissions.length > 1 ? 's' : ''}
          </span>
          {g.signatureCount > 0 && (
            <span style={{
              marginLeft: 'auto', fontSize: 11.5, fontWeight: 700, color: '#92400e',
              background: '#fffbeb', padding: '2px 9px', borderRadius: 999,
            }}>✍️ {g.signatureCount} awaiting your signature</span>
          )}
        </div>
        {!closed && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px' }}>
            {g.submissions.map(s => {
              const v = grouped.vById.get(s.id)
              return v ? <SubmissionCard key={s.id} row={s as Submission} v={v} /> : null
            })}
          </div>
        )}
      </div>
    )
  })}
</div>
```

- [ ] **Step 7: Type-check and run the app**

Run: `pnpm type-check`
Expected: no errors (a clean `SubmissionCard` extraction leaves no dangling references).

Run: `pnpm dev`, open the Enrollment Inbox with several pending submissions for 2+ children (or seed via the storefront). Verify:
- one collapsible block per child; header shows name + form count;
- a block with an `iea` / `dcy_01234` / `start_form` shows "✍️ N awaiting your signature", and that form's card shows the "✍️ needs your signature" chip;
- clicking a header collapses/expands the block; per-row **Review** still opens the modal and Approve/Reject still works;
- a submission with no name appears under a single "(no name)" block, not dropped.

- [ ] **Step 8: Commit**

```bash
git add src/pages/enrollment/EnrollmentInboxPage.tsx
git commit -m "feat(enrollment): Inbox renders one block per child, marks signature forms"
```

---

## Self-Review (done at plan time)

- **Spec coverage (Monday slice, spec §7 child layer + §4 marking):** Task 1 = grouping + list-A marking; Task 2 = tree render + per-form signature mark + collapse. The family node (§1 two-layer), registry `scope` (§1), symmetric waiver anchor (§3), and batch Approve (§5) are **Phase 2**, intentionally out of the Monday slice (see below). Covered for what Monday ships.
- **Placeholder scan:** none — every step carries real code or an exact command.
- **Type consistency:** `GroupableSubmission` is a structural subset of the page's `Submission`; `SubmissionCard` takes the page's `Submission`/`ValidationResult`; `groupSubmissionsByChild` is fed `x.row` (a `Submission`), which satisfies `GroupableSubmission`. `signatureRequired` name is identical in module and page.

---

## Phase 2 (deferred — NOT the Monday slice)

Own plan, own tests, **not on SafePass-pilot day.** Reason: this adds the first batch live-write path over claim-adjacent tables, and the decision logic (CACFP insert-vs-update, IEA FRP + fiscal year + matched ids, document child-link + director countersign) currently lives entangled in `EnrollmentReviewModal.runApprove` ([EnrollmentReviewModal.tsx:292](../../src/pages/enrollment/EnrollmentReviewModal.tsx#L292)). It must be extracted into a pure, tested decision function before any orchestrator runs it live.

Outline (to be detailed after Phase 1 review):
1. **Registry `scope: family|child`** metadata + a reader; family scaffold node in the tree.
2. **`planChildPacketApprove(group, ctx)`** — pure: given a child's submissions + roster/match context, return an ordered action list (enrollment first → IEA/waiver → documents), or a blocked reason. Unit-tested, no I/O.
3. **`runChildPacketApprove(plan)`** — executes the plan via existing `approveCacfpInsert/Update`, `approveIea`, `approveDocument`; aggregates undo. Unit-tested with a mocked Supabase.
4. **"Sign & file all" button** on the group header, gated exactly like the modal (`approveBlocked` parity), applying the director's signature to the list-A forms before filing.
5. **Waiver v3 (family, `children[]`)** + IEA-as-family-anchor grouping — storefront form change in `pa082508.github.io` + registry bump; the multi-family work.
