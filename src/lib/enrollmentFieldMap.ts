// ============================================================
// enrollmentFieldMap.ts — maps a submission's form_data to a reviewable
// diff against the current child record, for the Inbox diff-view (Phase 1
// slice B). Each row pairs a submitted value with the current roster/medical
// value (resolved via childFieldRegistry) and flags a difference.
//
// `editPath` marks a scalar the director can fix in place (parent typos); the
// value is read/written by dot-path into form_data. `registryKey` names the
// childFieldRegistry field the value maps to — it drives the "current record"
// column here and the Approve upsert target in slice C.
// ============================================================

import { FIELDS, displayValue, type FieldDef, type RecordCtx } from './childFieldRegistry'
import { displayChildName } from './childName'

const byKey = (k: string): FieldDef | undefined => FIELDS.find(f => f.key === k)

export interface DiffRow {
  key: string
  section: string
  label: string
  formValue: string
  currentValue: string
  changed: boolean
  required?: boolean     // required by this form type
  missing?: boolean      // required AND empty → highlight + editable
  editPath?: string      // dot-path into form_data, if editable
  registryKey?: string   // childFieldRegistry target (current col + Approve)
  rateLocked?: boolean   // reimbursement-critical → read-only, see RATE_CRITICAL
}

// ─── what only a signed document may say (Nikolay, 2026-07-16) ───────────────
// «доверять только подписанному документу связанным с возмещением; допускается
//  изменения директором только не влияющие на определение рейтов».
//
// A director may fix what does not decide money — phone, e-mail, address. What
// DOES decide money is the parent's signed statement, and the only honest way to
// change it is a corrected form the parent signs again.
//
//   birthdate      → age → meal pattern AND the reimbursement age band.
//   signature_date → the document's own fact. It also decides which schedule
//                    wins (scheduleIsStale): editable, it would let a click
//                    re-date a signed form and flip that outcome.
//
// Days/hours/meals are already read-only here — they render as one summary row
// with no editPath, and reach the roster only through buildSchedulePort.
//
// NOT locked: child_name. It says WHO is claimed, not at what rate, and a typo
// fix is what lets matchRoster find a returning child instead of duplicating
// them. Flagged for Nikolay rather than decided here.
export const RATE_CRITICAL: ReadonlySet<string> = new Set(['birthdate', 'signature_date'])

// ─── dot-path get/set on a plain object (mailing.street etc.) ────────────────
export function getPath(obj: any, path: string): any {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj)
}
export function setPath(obj: any, path: string, value: any): any {
  const keys = path.split('.')
  const next = Array.isArray(obj) ? [...obj] : { ...(obj ?? {}) }
  let cur = next
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i]
    cur[k] = cur[k] == null ? {} : (Array.isArray(cur[k]) ? [...cur[k]] : { ...cur[k] })
    cur = cur[k]
  }
  cur[keys[keys.length - 1]] = value
  return next
}

const str = (v: any): string => (v === null || v === undefined ? '' : String(v))
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

const currentOf = (registryKey: string | undefined, ctx: RecordCtx | null): string => {
  if (!registryKey || !ctx) return ''
  const f = byKey(registryKey)
  return f ? displayValue(f, ctx) : ''
}

const row = (
  r: Omit<DiffRow, 'changed' | 'currentValue' | 'missing'> & { currentValue?: string; ctx: RecordCtx | null },
): DiffRow => {
  const currentValue = r.currentValue ?? currentOf(r.registryKey, r.ctx)
  // The lock lives here, not at each call site: a row added later cannot forget
  // it. Dropping editPath is what actually forbids the write — `rateLocked` only
  // lets the panel say why.
  const rateLocked = !!r.editPath && RATE_CRITICAL.has(r.editPath)
  return {
    key: r.key, section: r.section, label: r.label,
    formValue: r.formValue, currentValue,
    changed: !!currentValue && norm(currentValue) !== norm(r.formValue),
    required: r.required,
    missing: !!r.required && norm(r.formValue) === '',
    editPath: rateLocked ? undefined : r.editPath,
    registryKey: r.registryKey,
    rateLocked: rateLocked || undefined,
  }
}

// ─── CACFP schedule summary ("Mon 8:00–17:00 · B,L,S") ───────────────────────
export function summarizeSchedule(schedule: any): string {
  if (!schedule || typeof schedule !== 'object') return ''
  const out: string[] = []
  for (const [day, d] of Object.entries<any>(schedule)) {
    if (!d?.in_care) continue
    const hours = [d.arr1, d.dep1].filter(Boolean).join('–')
    const meals = d.meals && typeof d.meals === 'object'
      ? Object.entries<any>(d.meals).filter(([, on]) => on).map(([m]) => m[0].toUpperCase()).join(',')
      : ''
    out.push(`${day} ${hours}${meals ? ' · ' + meals : ''}`.trim())
  }
  return out.join('   ')
}

// ─── CACFP Enrollment diff ───────────────────────────────────────────────────
function cacfpDiff(fd: any, ctx: RecordCtx | null): DiffRow[] {
  const currentName = ctx?.roster ? displayChildName(ctx.roster as any) : ''
  const m = fd?.mailing ?? {}
  return [
    row({ key: 'child_name', section: 'Identity', label: 'Child name', required: true,
      formValue: str(fd?.child_name), currentValue: currentName, ctx, editPath: 'child_name' }),
    row({ key: 'birthdate', section: 'Identity', label: 'Date of birth', required: true,
      formValue: str(fd?.birthdate).slice(0, 10), ctx, registryKey: 'birthday', editPath: 'birthdate' }),
    row({ key: 'street', section: 'Address', label: 'Street', required: true,
      formValue: str(m.street), ctx, registryKey: 'child_address', editPath: 'mailing.street' }),
    row({ key: 'city', section: 'Address', label: 'City', required: true,
      formValue: str(m.city), ctx, editPath: 'mailing.city' }),
    row({ key: 'zip', section: 'Address', label: 'ZIP', required: true,
      formValue: str(m.zip), ctx, editPath: 'mailing.zip' }),
    row({ key: 'day_phone', section: 'Contact', label: 'Daytime phone', required: true,
      formValue: str(fd?.day_phone), ctx, editPath: 'day_phone' }),
    row({ key: 'parent_email', section: 'Contact', label: 'Parent email',
      formValue: str(fd?.parent_email), ctx, editPath: 'parent_email' }),
    row({ key: 'schedule', section: 'Schedule', label: 'Care & meals', required: true,
      formValue: summarizeSchedule(fd?.schedule), ctx }),
    row({ key: 'sig_date', section: 'Signature', label: 'Signature date', required: true,
      formValue: str(fd?.signature_date).slice(0, 10), ctx, editPath: 'signature_date' }),
  ]
}

// ─── IEA diff ────────────────────────────────────────────────────────────────
const IEA_VERDICT_FRP: Record<string, string> = { free: 'Free', reduced: 'Reduced', paid: 'Paid' }

function ieaDiff(fd: any, ctx: RecordCtx | null): DiffRow[] {
  const rows: DiffRow[] = []
  const children = Array.isArray(fd?.children) ? fd.children : []
  children.forEach((c: any, i: number) => {
    rows.push(row({ key: `child_${i}`, section: 'Children', label: `Child ${i + 1}`,
      formValue: [str(c?.name), c?.dob ? `DOB ${str(c.dob).slice(0, 10)}` : '', c?.case_no ? `case ${c.case_no}` : '', c?.foster ? 'foster' : '']
        .filter(Boolean).join(' · '), ctx }))
  })
  const b = fd?.benefit ?? {}
  rows.push(row({ key: 'benefit', section: 'Eligibility', label: 'Assistance program',
    formValue: [b.snap ? 'SNAP' : '', b.owf ? 'OWF' : ''].filter(Boolean).join(', ') || '—', ctx }))

  // FRP from the Sponsor Section checkboxes (authoritative); helper.verdict fallback.
  const sponsorFrp = fd?.sponsor?.free ? 'Free' : fd?.sponsor?.reduced ? 'Reduced' : fd?.sponsor?.paid ? 'Paid' : ''
  const verdict = str(fd?.helper?.verdict).toLowerCase()
  rows.push(row({ key: 'frp', section: 'Eligibility', label: 'FRP determination', required: true,
    formValue: sponsorFrp || (IEA_VERDICT_FRP[verdict] ?? ''), ctx, registryKey: 'frp' }))
  rows.push(row({ key: 'frp_expires', section: 'Eligibility', label: 'FRP expires',
    formValue: str(fd?.sponsor?.expiration).slice(0, 10), ctx, registryKey: 'frp_expires' }))

  const a = fd?.adult ?? {}
  rows.push(row({ key: 'signer', section: 'Adult signer', label: 'Name',
    formValue: str(a.print_name), ctx, editPath: 'adult.print_name' }))
  rows.push(row({ key: 'signer_phone', section: 'Adult signer', label: 'Daytime phone',
    formValue: str(a.day_phone), ctx, editPath: 'adult.day_phone' }))
  rows.push(row({ key: 'signer_addr', section: 'Adult signer', label: 'Address',
    formValue: [str(a.street), str(a.city_state_zip)].filter(Boolean).join(', '), ctx }))
  rows.push(row({ key: 'signer_ssn', section: 'Adult signer', label: 'SSN last 4',
    formValue: a.no_ssn ? '(no SSN)' : str(a.ssn_last4), ctx }))
  return rows
}

export function buildDiff(submissionType: string, formData: any, ctx: RecordCtx | null): DiffRow[] {
  if (submissionType === 'cacfp_enrollment') return cacfpDiff(formData, ctx)
  if (submissionType === 'iea') return ieaDiff(formData, ctx)
  // Unknown type — flat dump of top-level scalar keys, read-only.
  const fd = formData ?? {}
  return Object.keys(fd)
    .filter(k => typeof fd[k] !== 'object')
    .map(k => row({ key: k, section: 'Submitted', label: k, formValue: str(fd[k]), ctx }))
}
