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

// A submission is "filed" (a fact to look up, not a task) once it is auto-filed —
// status 'received'. Mirrors EnrollmentInboxPage's `filed = row.status === 'received'`.
const isFiled = (status: string): boolean => status === 'received'

export type ChildGroup = {
  key: string              // token-sorted normalized name; '' for the no-name bucket
  childName: string        // display name, as first typed
  submissions: GroupableSubmission[]
  signatureCount: number   // forms still AWAITING a director signature (excludes filed)
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
    // Count only forms still awaiting a signature — a filed (received) form is a
    // fact, not a task, so it must not inflate the "awaiting your signature" badge.
    if (signatureRequired(s.submission_type) && !isFiled(s.status)) g.signatureCount++
  }
  const desc = (a: string, b: string) => (a < b ? 1 : a > b ? -1 : 0)
  const groups = [...byKey.values()]
  for (const g of groups) g.submissions.sort((a, b) => desc(a.created_at, b.created_at))
  groups.sort((a, b) => desc(a.submissions[0]?.created_at ?? '', b.submissions[0]?.created_at ?? ''))
  return groups
}
