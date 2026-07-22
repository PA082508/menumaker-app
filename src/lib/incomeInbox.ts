// incomeInbox.ts — Income-determination lens for the Enrollment Inbox (Ф2, кусок 1).
//
// Income determination (the IEA and its mutually-exclusive USDA-waiver counterpart)
// is handled ONLY at the org level, by the General Director role (is_org_owner();
// client-side `useOrg().isOrgAdmin`). A center director never reads it — Ф1 RLS
// (income_org_only) already keeps these rows out of a director's query, so this
// module is purely additive for the GD and cannot change the director's render.
//
// This file is view-only: grouping + labels + the pending counter. No writes. The
// GD's own sponsor_sig + Approve (auth.uid()) land in кусок 2.

export const INCOME_TYPES = ['iea', 'usda_waiver'] as const

export const isIncomeType = (t: string | null | undefined): boolean =>
  t === 'iea' || t === 'usda_waiver'

// Minimal shape this module reads — a subset of the Inbox's Submission row.
export type IncomeRowLite = {
  id: string
  center_id: string
  child_id: string | null
  submission_type: string
  form_data: any
  status: string
  created_at: string
}

const s = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

// Family key — center→FAMILY→child. Income forms are household-level (child_id is
// null on every real row; the IEA lists a household, not one child), so the family
// is identified by the signing adult. Fallbacks keep every row groupable:
//   adult.print_name → child's last name → guardian print_name → '(unidentified household)'.
export function familyKey(form_data: any): string {
  const adult = s(form_data?.adult?.print_name)
  if (adult) return adult
  const child = s(form_data?.child_name)
  if (child) {
    const parts = child.split(/\s+/)
    return parts.length > 1 ? parts[0] : child // "Last First" → surname anchors the family
  }
  const guardian = s(form_data?.guardian?.print_name) || s(form_data?.parent_name)
  if (guardian) return guardian
  return '(unidentified household)'
}

// A human label for the family header.
export function familyLabel(key: string): string {
  return key === '(unidentified household)' ? 'Unidentified household' : key
}

// Child/application label inside a family. IEA is household-level, so most rows have
// no single child — say so honestly rather than inventing a name.
export function childLabel(form_data: any): string {
  const child = s(form_data?.child_name)
  if (child) return child
  const kids = Array.isArray(form_data?.children) ? form_data.children : []
  const first = s(kids[0]?.name) || s(kids[0]?.first_name)
  if (first) {
    return kids.length > 1 ? `${first} +${kids.length - 1} more` : first
  }
  return 'Income application (household)'
}

export type IncomeFamily<T> = { key: string; label: string; rows: T[] }
export type IncomeCenterGroup<T> = { centerId: string; centerName: string; families: IncomeFamily<T>[] }

// center → family → child. Order is preserved from the input (the query orders by
// center then created_at), so the newest application surfaces first within a family.
export function groupIncome<T extends IncomeRowLite>(
  rows: T[],
  centerName: (id: string) => string,
): IncomeCenterGroup<T>[] {
  const centers = new Map<string, Map<string, T[]>>()
  for (const r of rows) {
    if (!centers.has(r.center_id)) centers.set(r.center_id, new Map())
    const fams = centers.get(r.center_id)!
    const k = familyKey(r.form_data)
    if (!fams.has(k)) fams.set(k, [])
    fams.get(k)!.push(r)
  }
  return [...centers.entries()].map(([centerId, fams]) => ({
    centerId,
    centerName: centerName(centerId),
    families: [...fams.entries()].map(([key, rs]) => ({ key, label: familyLabel(key), rows: rs })),
  }))
}

// The badge is PENDING-only — "waiting for the General Director". Rejected/approved
// rows are on file, not a task, so they never inflate the number (honest 0 today:
// 7 IEA on file = 6 rejected + 1 approved, 0 pending).
export function pendingIncomeCount(rows: IncomeRowLite[]): number {
  return rows.filter(r => r.status === 'pending').length
}
