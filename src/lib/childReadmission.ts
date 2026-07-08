// ============================================================
// childReadmission.ts — ADD CHILD 2.0 (П.0). The "found → return window" side
// of the search-first Add Child router: build the document checklist for a
// returning child, and admit them (reactivate + audit-log snapshot).
//
// HONEST EMPTY-STATE (Nikolay, 2026-07-08): no per-child documents ledger
// exists yet (that's Stage 4). So ✓/⚠/✗ are only asserted where real data
// lives — the income_eligibility slot (IEA / USDA waiver) and any APPROVED
// enrollment_submissions linked to the child. Every other registry form is
// 'untracked' (○), never a false ✗. The director's paper-folder attestation
// (captured in the admission snapshot) is the legal source of truth until the
// Stage-4 child_documents ledger auto-fills these marks.
// ============================================================

import { supabase } from './supabase'

const S = () => supabase.schema('menumaker')
const nowIso = () => new Date().toISOString()
const today = () => new Date().toISOString().slice(0, 10)

// ─── registry ────────────────────────────────────────────────────────────────
// public/enroll-registry.json (schema 2). We read only the catalog fields; the
// embed loader owns the rest. Fetched once and memoised.
export interface RegistryForm {
  slug: string
  title: string
  requiringOrg: string
  signer: string                 // 'parent' | 'physician'
  intakeMode: string             // 'paper_scan' | 'online'
  submissionType?: string        // 'cacfp_enrollment' | 'iea' | 'medical'
  fallbackUrl?: string
  badge?: string
  expiryDays?: number
  expiryMonths?: number
  satisfies?: string[]           // e.g. usda_waiver satisfies ['iea']
}

let _registry: Record<string, RegistryForm> | null = null
export async function loadFormsRegistry(): Promise<Record<string, RegistryForm>> {
  if (_registry) return _registry
  const res = await fetch('/enroll-registry.json', { cache: 'no-cache' })
  if (!res.ok) throw new Error(`registry ${res.status}`)
  const json = await res.json()
  _registry = (json?.forms ?? {}) as Record<string, RegistryForm>
  return _registry
}

// ─── checklist ───────────────────────────────────────────────────────────────
export type DocStatus =
  | 'ok'         // ✓ on file & valid
  | 'warn'       // ⚠ on file but expired / expiring
  | 'missing'    // ✗ genuinely required & absent (only the income-eligibility slot today)
  | 'untracked'  // ○ no ledger yet — honest empty-state

export interface ChecklistRow {
  slug: string
  title: string
  requiringOrg: string
  signer: string
  intakeMode: string
  fallbackUrl: string | null
  status: DocStatus
  onFileDate: string | null      // signature / determination date
  validUntil: string | null      // computed validity horizon
  note: string | null
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
function addMonths(iso: string, months: number): string {
  const d = new Date(`${iso}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + months)
  return d.toISOString().slice(0, 10)
}
function validityHorizon(f: RegistryForm, onFileDate: string): string | null {
  if (f.expiryDays)   return addDays(onFileDate, f.expiryDays)
  if (f.expiryMonths) return addMonths(onFileDate, f.expiryMonths)
  return null
}

// submission_type / form_data.dcy_form → registry slug. The three DCY medical
// forms share submission_type 'medical', discriminated by form_data.dcy_form.
function submissionSlug(subType: string, dcyForm?: string | null): string | null {
  if (subType === 'cacfp_enrollment') return 'enroll'
  if (subType === 'iea')              return 'iea'
  if (subType === 'usda_waiver')      return 'usda_waiver'
  if (subType === 'medical') {
    const map: Record<string, string> = {
      '01305': 'dcy_01305', '01236': 'dcy_01236', '01217': 'dcy_01217',
      '01234': 'dcy_01234',
    }
    return dcyForm ? (map[String(dcyForm)] ?? null) : null
  }
  return null
}

export interface ChecklistResult {
  rows: ChecklistRow[]
  incomeEligibilityMet: boolean
}

/** Build the return-window document checklist for one roster child. Reads the
 *  registry catalog and joins the only per-child state that persists today:
 *  the income_eligibility FY record and APPROVED enrollment_submissions. */
export async function buildReturnChecklist(rosterId: string): Promise<ChecklistResult> {
  const registry = await loadFormsRegistry()
  const t = today()

  // Real per-child state, in parallel.
  const [{ data: ieRows }, { data: subs }] = await Promise.all([
    S().from('income_eligibility')
      .select('determined_at,frp_expires,updated_at')
      .eq('roster_id', rosterId)
      .order('updated_at', { ascending: false }).limit(1),
    S().from('enrollment_submissions')
      .select('submission_type,signature_date,form_data,status,created_at')
      .eq('child_id', rosterId).eq('status', 'approved')
      .order('created_at', { ascending: false }),
  ])

  const ie = (ieRows ?? [])[0] as { determined_at: string | null; frp_expires: string | null } | undefined
  const incomeEligibilityMet = !!ie

  // Latest approved submission per slug.
  const subBySlug = new Map<string, { onFileDate: string | null }>()
  for (const s of (subs ?? []) as any[]) {
    const slug = submissionSlug(s.submission_type, s?.form_data?.dcy_form)
    if (!slug || subBySlug.has(slug)) continue     // ordered newest-first → first wins
    subBySlug.set(slug, { onFileDate: (s.signature_date ?? s.created_at)?.slice(0, 10) ?? null })
  }

  const rows: ChecklistRow[] = Object.values(registry).map((f) => {
    const row: ChecklistRow = {
      slug: f.slug, title: f.title, requiringOrg: f.requiringOrg,
      signer: f.signer, intakeMode: f.intakeMode,
      fallbackUrl: f.fallbackUrl ?? null,
      status: 'untracked', onFileDate: null, validUntil: null, note: null,
    }

    // Income-eligibility slot (iea + usda_waiver share it) — the ONE slot we can
    // assert as required-and-missing. Met by an income_eligibility record OR a
    // matched submission of either form.
    const isIeSlot = f.slug === 'iea' || (f.satisfies ?? []).includes('iea') || f.slug === 'usda_waiver'
    if (isIeSlot) {
      const sub = subBySlug.get(f.slug)
      if (ie && f.slug === 'iea') {
        row.onFileDate = ie.determined_at?.slice(0, 10) ?? null
        row.validUntil = ie.frp_expires ?? null
      } else if (sub) {
        row.onFileDate = sub.onFileDate
        row.validUntil = sub.onFileDate ? validityHorizon(f, sub.onFileDate) : null
      }
      if (row.onFileDate) {
        row.status = row.validUntil && row.validUntil < t ? 'warn' : 'ok'
      } else if (f.slug === 'iea' && !incomeEligibilityMet && !subBySlug.get('usda_waiver')) {
        // Neither IEA nor waiver on file → the slot is genuinely unmet. Surface
        // the ✗ once, on the IEA row (the primary of the mutually-exclusive pair).
        row.status = 'missing'
        row.note = 'Income eligibility unmet — IEA or USDA waiver required'
      } else {
        row.status = 'untracked'   // waiver row when IEA covers the slot, etc.
      }
      return row
    }

    // Everything else: only reflect a matched approved submission; no ledger yet.
    const sub = subBySlug.get(f.slug)
    if (sub?.onFileDate) {
      row.onFileDate = sub.onFileDate
      row.validUntil = validityHorizon(f, sub.onFileDate)
      row.status = row.validUntil && row.validUntil < t ? 'warn' : 'ok'
    }
    return row
  })

  return { rows, incomeEligibilityMet }
}

// ─── admission ───────────────────────────────────────────────────────────────
export interface AdmitInput {
  rosterId: string
  dateIn: string                 // director-chosen admission date (ISO)
  by: string                     // reviewer auth uid
  byName: string                 // director signature name
  attested: boolean              // paper-folder attestation (must be true)
  checklist: ChecklistRow[]      // snapshot — mandatory, basis-of-admission evidence
}

// Compact the checklist to the audit-relevant fields.
function snapshot(rows: ChecklistRow[]) {
  return rows.map(r => ({
    slug: r.slug, title: r.title, status: r.status,
    onFileDate: r.onFileDate, validUntil: r.validUntil,
  }))
}

/** Reactivate a returning child on a new admission date and append a who/when +
 *  checklist-snapshot entry to roster.admission_log. Mirrors recordDetermination's
 *  select-then-append-then-update pattern; runs under the caller's RLS. */
export async function admitChild(p: AdmitInput): Promise<void> {
  if (!p.attested) throw new Error('Paper-folder attestation is required to admit')
  if (!p.dateIn) throw new Error('Pick an admission date')

  const { data: prev, error: readErr } = await S().from('roster')
    .select('is_active,date_out,admission_log').eq('id', p.rosterId).single()
  if (readErr) throw readErr

  const log = Array.isArray((prev as any)?.admission_log) ? (prev as any).admission_log : []
  const entry = {
    at: nowIso(), by: p.by, by_name: p.byName, attested: true,
    from_state: { is_active: (prev as any)?.is_active ?? null, date_out: (prev as any)?.date_out ?? null },
    checklist_snapshot: snapshot(p.checklist),
  }

  const { error } = await S().from('roster').update({
    is_active: true, date_out: null, date_in: p.dateIn,
    deactivated_at: null, deactivation_reason: null,
    admission_log: [...log, entry],
  }).eq('id', p.rosterId)
  if (error) throw error
}
