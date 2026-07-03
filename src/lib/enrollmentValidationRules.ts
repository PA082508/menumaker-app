// ============================================================
// enrollmentValidationRules.ts — validation engine for the Director's Inbox.
//
// Sibling to childFieldRegistry.ts. Given a pending enrollment submission
// (submission_type + form_data as posted by the packet forms), returns a
// human-readable {errors, warnings, missing} result plus an overall status
// that drives the 🟢/🟡/🔴 badge:
//   🟢 ready    — nothing missing, no errors, no warnings
//   🟡 warnings — format warnings only (Approve allowed with confirmation)
//   🔴 errors   — required field missing or a hard error (Approve blocked)
//   ⚪ unknown   — no rule set for this submission_type yet (rules pending)
//
// The result mirrors the enrollment_submissions.validation jsonb column
// ({errors, warnings, missing}); Phase 1 computes it client-side on load and
// on edit. A DB trigger can populate the column later without changing shape.
//
// Signature policy (spec §1): the DRAWN signature is NOT a required online
// field — the packet is printed and wet-signed on paper, and the director
// ticks "Paper signed & filed" at Approve. The signature DATE, however, is a
// data field on the form and IS validated here.
// ============================================================

export type ValStatus = 'ready' | 'warnings' | 'errors' | 'unknown'

export interface ValidationResult {
  status: ValStatus
  errors: string[]    // hard errors → 🔴, block Approve
  warnings: string[]  // format warnings → 🟡, Approve allowed with confirm
  missing: string[]   // required-but-empty fields (human-readable) → count as 🔴
}

// ─── shared field checks ─────────────────────────────────────────────────────
const blank = (v: unknown): boolean =>
  v === null || v === undefined || (typeof v === 'string' && v.trim() === '')

const isISODate = (v: unknown): boolean =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) && !Number.isNaN(Date.parse(v.slice(0, 10)))

// US phone: 10 digits after stripping punctuation (optional leading 1).
const validPhone = (v: unknown): boolean => {
  if (typeof v !== 'string') return false
  const d = v.replace(/\D/g, '')
  return d.length === 10 || (d.length === 11 && d.startsWith('1'))
}

const validZip = (v: unknown): boolean =>
  typeof v === 'string' && /^\d{5}(-\d{4})?$/.test(v.trim())

// 7-digit CACFP/DSS case number (IEA Part 2).
const validCaseNumber = (v: unknown): boolean =>
  typeof v === 'string' && /^\d{7}$/.test(v.trim())

const statusFrom = (r: Omit<ValidationResult, 'status'>): ValStatus =>
  r.errors.length > 0 || r.missing.length > 0 ? 'errors'
    : r.warnings.length > 0 ? 'warnings'
    : 'ready'

// ─── CACFP Enrollment (submission_type = 'cacfp_enrollment') ─────────────────
// form_data shape (packet form): { child_name, birthdate, day_phone,
//   mailing:{street,city,zip}, schedule:{Mon..Fri:{in_care,arr1,dep1,arr2,dep2,
//   meals:{...}}}, schedule_varies, parent_birthdate, parent_email, expires_on }
function validateCacfp(fd: any, signatureDate?: string | null): ValidationResult {
  const errors: string[] = [], warnings: string[] = [], missing: string[] = []

  if (blank(fd?.child_name)) missing.push('Child name')

  if (blank(fd?.birthdate)) missing.push('Date of birth')
  else if (!isISODate(fd.birthdate)) warnings.push('Date of birth format looks invalid')

  // ≥1 day marked in-care, with at least a first arrival/departure block AND ≥1 meal.
  const schedule = fd?.schedule && typeof fd.schedule === 'object' ? fd.schedule : {}
  const dayHasHours = (d: any) => !blank(d?.arr1) && !blank(d?.dep1)
  const dayHasMeal = (d: any) => d?.meals && typeof d.meals === 'object'
    && Object.values(d.meals).some(Boolean)
  const anyValidDay = Object.values(schedule).some(
    (d: any) => d?.in_care && dayHasHours(d) && dayHasMeal(d),
  )
  if (!anyValidDay) missing.push('At least one day with care hours and a meal')

  if (blank(fd?.day_phone)) missing.push('Daytime phone')
  else if (!validPhone(fd.day_phone)) warnings.push('Daytime phone format looks invalid')

  const m = fd?.mailing ?? {}
  if (blank(m.street) || blank(m.city) || blank(m.zip)) {
    missing.push('Mailing address (street, city, ZIP)')
  } else if (!validZip(m.zip)) {
    warnings.push('ZIP code format looks invalid')
  }

  // Signature date (drawn signature intentionally not required — paper flow).
  const sigDate = !blank(signatureDate) ? signatureDate : fd?.signature_date
  if (blank(sigDate)) missing.push('Signature date')
  else if (!isISODate(sigDate)) warnings.push('Signature date format looks invalid')

  return { status: statusFrom({ errors, warnings, missing }), errors, warnings, missing }
}

// ─── IEA — Income Eligibility (submission_type = 'iea') ──────────────────────
// form_data shape (IEA form v3, type='iea_fy2026_27'):
//   children:[{name,age,dob,foster,case_no}] (≤4), benefit:{snap,owf},
//   household:[{name,zero,income:{earn|welf|pens|other:{amt,freq_mult}}}],
//   adult:{print_name,date,ssn_last4,no_ssn,day_phone,work_phone,street,
//          city_state_zip,county}, ethnicity, race, helper, sponsor.
// Branching (spec §1): a child with a valid 7-digit case_no AND (benefit.snap
// or benefit.owf) ⇒ categorical eligibility, household/income NOT required.
// Otherwise income path: household required, and adult SSN last-4 required
// unless "no SSN". Drawn signature not required (paper flow).
function validateIea(fd: any): ValidationResult {
  const errors: string[] = [], warnings: string[] = [], missing: string[] = []

  const children = Array.isArray(fd?.children) ? fd.children : []
  const namedChildren = children.filter((c: any) => !blank(c?.name))
  if (namedChildren.length === 0) missing.push('At least one child (Part 1)')

  // Malformed case numbers are a warning regardless of path.
  children.forEach((c: any, i: number) => {
    if (!blank(c?.case_no) && !validCaseNumber(c.case_no)) {
      warnings.push(`Case number for child ${i + 1} must be 7 digits`)
    }
  })

  const benefit = fd?.benefit ?? {}
  const hasBenefitFlag = benefit.snap === true || benefit.owf === true
  const anyValidCase = children.some((c: any) => validCaseNumber(c?.case_no))
  const categorical = anyValidCase && hasBenefitFlag

  if (!categorical) {
    // Income path (Part 3): at least one named household member with income.
    const household = Array.isArray(fd?.household) ? fd.household : []
    const filled = household.filter((h: any) => !blank(h?.name))
    if (filled.length === 0) {
      missing.push('Household members & income (Part 3) — no categorical eligibility')
    } else {
      // Adult SSN last-4 required unless "no SSN" is checked.
      const adult = fd?.adult ?? {}
      if (adult.no_ssn !== true) {
        if (blank(adult.ssn_last4)) missing.push('Adult signer SSN last 4 (or check "no SSN")')
        else if (!/^\d{4}$/.test(String(adult.ssn_last4).trim())) warnings.push('SSN last 4 must be 4 digits')
      }
      // Income amounts/frequencies must be well-formed for non-zero members.
      household.forEach((h: any, i: number) => {
        if (h?.zero === true || blank(h?.name)) return
        const inc = h?.income ?? {}
        Object.entries(inc).forEach(([kind, val]: [string, any]) => {
          if (val && !blank(val.amt)) {
            if (!/^\d+(\.\d+)?$/.test(String(val.amt))) warnings.push(`Income amount (${kind}) for member ${i + 1} looks invalid`)
            if (blank(val.freq_mult)) warnings.push(`Income frequency (${kind}) for member ${i + 1} is missing`)
          }
        })
      })
    }
  }

  // Light contact format check.
  const phone = fd?.adult?.day_phone
  if (!blank(phone) && !validPhone(phone)) warnings.push('Adult daytime phone format looks invalid')

  return { status: statusFrom({ errors, warnings, missing }), errors, warnings, missing }
}

// ─── Registry of validators by submission_type ──────────────────────────────
type Validator = (fd: any, signatureDate?: string | null) => ValidationResult

const VALIDATORS: Record<string, Validator> = {
  cacfp_enrollment: validateCacfp,
  iea: (fd) => validateIea(fd),
  iea_fy2026_27: (fd) => validateIea(fd),  // form_data.type; submission_type is 'iea'
  // dcy_01234: pending its field registry — see childFieldRegistry 'enrollment' tab.
}

/** Human label for a submission_type (falls back to the raw code). */
export const submissionTypeLabel = (t: string): string =>
  ({ cacfp_enrollment: 'CACFP Enrollment', iea: 'Income Eligibility (IEA)', dcy_01234: 'DCY 01234' }[t] ?? t)

/**
 * Validate a pending submission. Returns 'unknown' status for submission types
 * without a rule set yet (still listed in the Inbox, just not gradeable).
 */
export function validateSubmission(
  submissionType: string,
  formData: any,
  opts?: { signatureDate?: string | null },
): ValidationResult {
  const v = VALIDATORS[submissionType]
  if (!v) {
    return {
      status: 'unknown', errors: [], warnings: [],
      missing: [`No validation rules for "${submissionTypeLabel(submissionType)}" yet`],
    }
  }
  return v(formData, opts?.signatureDate)
}
