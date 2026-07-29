// ============================================================
// dcyPort.ts — DCY 01234 → the child's record. Stage Г.
//
// The form collects 81 keys and the platform consumed NONE of them: Approve
// filed the document and wrote nothing, because that was the CACFP/IEA path
// only. Meanwhile the card has the matching columns sitting empty and the
// Family tab shows violations while both parents' full contact blocks lie
// sealed inside the submission. This module is the join.
//
// THE ONE RULE THAT GOVERNS EVERY LINE HERE:
//
//     ABSENCE OF A FIELD IS NOT AN EMPTY VALUE.
//
// A key the form does not carry produces NO write. Not a null, not a blank —
// no entry at all. The port must never state, on the authority of a signed
// document, something that document did not say.
//
// DOCUMENT DATE. DCY 01234 is reviewed annually: pg_rev_1..3 / adm_rev_1..3
// take initials and their OWN date, later than the original signature. So the
// document date is the LATEST FILLED review row, falling back to
// signature_date. Today every review row is empty except one record that
// predates the review-row gate (merged one day after it was signed), so the
// expression returns signature_date and behaviour is unchanged — but the port
// will not have to be reopened in July 2027, when the first real reviews land.
// ============================================================

/** A single field the port would write, in the shape the protected path takes. */
export type PortWrite = {
  fieldKey: string
  table: 'roster' | 'child_medical' | 'child'
  column: string
  value: string | null
}

const blank = (v: unknown) => v === null || v === undefined || String(v).trim() === ''

/** `true` only when the form actually carries the key with content. */
const has = (fd: Record<string, any>, key: string) => key in (fd ?? {}) && !blank(fd[key])

/** US M/D/YYYY (what the kit stamps) or ISO → ISO. Returns null on anything else. */
export function toIsoDate(v: unknown): string | null {
  const s = String(v ?? '').trim()
  if (!s) return null
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (us) return `${us[3]}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}`
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return iso ? iso[0] : null
}

/**
 * The date this document speaks as of.
 *
 * The annual review is a later act than the original signing (OAC 5180:2-12-15),
 * so a form reviewed in 2027 must apply with a 2027 date — otherwise it would
 * lose to a note written in between, quietly and wrongly.
 */
export function documentDateOf(
  fd: Record<string, any>, signatureDate: string | null | undefined,
): string | null {
  const reviewDates = ['pg_rev_1', 'pg_rev_2', 'pg_rev_3', 'adm_rev_1', 'adm_rev_2', 'adm_rev_3']
    .map(k => toIsoDate(fd?.[k]))
    .filter((d): d is string => !!d)
  if (reviewDates.length) { const sorted = reviewDates.sort(); return sorted[sorted.length - 1] }
  return toIsoDate(signatureDate)
}

/** DCY's Yes/No pairs: two keys, one answer. Returns null when NEITHER is marked
 *  — an unanswered question is not a "no". */
function yesNo(fd: Record<string, any>, yesKey: string, noKey: string): string | null {
  if (has(fd, yesKey)) return 'true'
  if (has(fd, noKey)) return 'false'
  return null
}

/** The address as the card holds it: one line, only from the parts present. */
function addressLine(fd: Record<string, any>): string | null {
  const street = has(fd, 'address') ? String(fd.address).trim() : ''
  const city = has(fd, 'city') ? String(fd.city).trim() : ''
  const state = has(fd, 'state') ? String(fd.state).trim() : ''
  const zip = has(fd, 'zip') ? String(fd.zip).trim() : ''
  if (!street && !city && !state && !zip) return null
  const tail = [city, [state, zip].filter(Boolean).join(' ')].filter(Boolean).join(', ')
  return [street, tail].filter(Boolean).join(', ') || null
}

/** A note field with its own "N/A" checkbox: the box means the parent answered
 *  "nothing to report", which is an answer and clears the field. An untouched
 *  pair means the question was skipped and nothing is written. */
function noteWithNa(fd: Record<string, any>, textKey: string, naKey: string): string | null | undefined {
  if (has(fd, textKey)) return String(fd[textKey]).trim()
  if (has(fd, naKey)) return null            // explicit "not applicable" → clear
  return undefined                            // absent → no write
}

/**
 * The card fields DCY 01234 can speak to. Only keys the form actually carries
 * produce entries.
 */
export function buildDcyCardWrites(fd: Record<string, any>): PortWrite[] {
  const out: PortWrite[] = []
  const push = (fieldKey: string, table: PortWrite['table'], column: string, value: string | null | undefined) => {
    if (value === undefined) return              // absent ≠ empty
    out.push({ fieldKey, table, column, value })
  }

  // Identity / placement
  if (has(fd, 'dob')) push('birthday', 'roster', 'birthday', toIsoDate(fd.dob))
  if (has(fd, 'first_day')) push('date_in', 'roster', 'date_in', toIsoDate(fd.first_day))
  push('child_address', 'roster', 'child_address', addressLine(fd) ?? undefined)

  // Health gate — the answer, not the default
  const health = yesNo(fd, 'health_y', 'health_n')
  if (health !== null) push('has_health_condition', 'roster', 'has_health_condition', health)

  // Emergency transport authorisation — a parental answer, never a default
  const trans = yesNo(fd, 'trans_yes', 'trans_no')
  if (trans !== null) push('emergency_transport_auth', 'roster', 'emergency_transport_auth', trans)

  // Notes, each with its own N/A box
  push('development_notes', 'roster', 'development_notes', noteWithNa(fd, 'development', 'na_dev'))
  push('accommodations', 'roster', 'accommodations', noteWithNa(fd, 'accommod', 'na_acc'))

  // Specialised services: the text lives in svc_provider, the Yes/No in svc_y/svc_n
  if (has(fd, 'svc_provider')) push('specialized_services', 'roster', 'specialized_services', String(fd.svc_provider).trim())
  else if (has(fd, 'na_svc') || has(fd, 'svc_n')) push('specialized_services', 'roster', 'specialized_services', null)

  return out
}

/** One person as the form states them. Absent blocks produce nothing. */
export type PortPerson = {
  slot: 'parent_1' | 'parent_2' | 'emergency_1' | 'emergency_2'
  firstName: string | null
  lastName: string | null
  fullName: string
  phone: string | null
  email: string | null
  address: string | null
  relationship: string | null
  isEmergencyContact: boolean
}

const splitName = (full: string): { first: string | null; last: string | null } => {
  const parts = full.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { first: null, last: null }
  if (parts.length === 1) return { first: parts[0], last: null }
  return { first: parts.slice(0, -1).join(' '), last: parts[parts.length - 1] }
}

/**
 * The four people DCY 01234 names: two parents/guardians and two emergency
 * contacts. The Family tab shows a violation for 313 of 318 children while
 * these blocks sit inside submitted forms — this is what closes that.
 *
 * A block whose name is absent yields nothing: a phone number with no person
 * attached is not a contact.
 */
export function buildDcyPeople(fd: Record<string, any>): PortPerson[] {
  const out: PortPerson[] = []

  const parent = (n: 1 | 2) => {
    const nameKey = `p${n}_name`
    if (!has(fd, nameKey)) return
    if (n === 2 && has(fd, 'p2_na')) return          // "no second parent" is an answer
    const full = String(fd[nameKey]).trim()
    const { first, last } = splitName(full)
    const street = has(fd, `p${n}_address`) ? String(fd[`p${n}_address`]).trim() : ''
    const city = has(fd, `p${n}_city`) ? String(fd[`p${n}_city`]).trim() : ''
    const state = has(fd, `p${n}_state`) ? String(fd[`p${n}_state`]).trim() : ''
    const zip = has(fd, `p${n}_zip`) ? String(fd[`p${n}_zip`]).trim() : ''
    const addr = [street, [city, [state, zip].filter(Boolean).join(' ')].filter(Boolean).join(', ')]
      .filter(Boolean).join(', ')
    out.push({
      slot: n === 1 ? 'parent_1' : 'parent_2',
      firstName: first, lastName: last, fullName: full,
      phone: has(fd, `p${n}_cell`) ? String(fd[`p${n}_cell`]).trim()
           : has(fd, `p${n}_phone`) ? String(fd[`p${n}_phone`]).trim() : null,
      email: has(fd, `p${n}_email`) ? String(fd[`p${n}_email`]).trim() : null,
      address: addr || null,
      relationship: null,
      isEmergencyContact: false,
    })
  }

  const emergency = (n: 1 | 2) => {
    const nameKey = `ec${n}_name`
    if (!has(fd, nameKey)) return
    if (n === 2 && has(fd, 'ec2_na')) return
    const full = String(fd[nameKey]).trim()
    const { first, last } = splitName(full)
    // The form offers a relationship pick plus an "other" free text.
    const rel = has(fd, `ec${n}_rel_y`) ? String(fd[`ec${n}_rel_y`]).trim()
              : has(fd, `ec${n}_other`) ? String(fd[`ec${n}_other`]).trim() : null
    out.push({
      slot: n === 1 ? 'emergency_1' : 'emergency_2',
      firstName: first, lastName: last, fullName: full,
      phone: has(fd, `ec${n}_phone`) ? String(fd[`ec${n}_phone`]).trim() : null,
      email: null, address: null,
      relationship: rel,
      isEmergencyContact: true,
    })
  }

  parent(1); parent(2); emergency(1); emergency(2)
  return out
}

/** IEA reports race and ethnicity for USDA civil-rights reporting; the platform
 *  collected them and dropped them. They live on menumaker.child, reached via
 *  roster.child_id — the same key the medical record uses. */
export function buildIeaDemographics(fd: Record<string, any>): PortWrite[] {
  const out: PortWrite[] = []
  if (has(fd, 'race')) out.push({ fieldKey: 'race', table: 'child', column: 'race', value: String(fd.race).trim() })
  if (has(fd, 'ethnicity')) out.push({ fieldKey: 'ethnicity', table: 'child', column: 'ethnicity', value: String(fd.ethnicity).trim() })
  return out
}

// ─── Applying the port ────────────────────────────────────────────────────────
// Every write goes through the protected path (record_child_field_change), so the
// port inherits the journal, the document-date rule and the lock. It cannot write
// a locked field verbally, and it cannot overwrite a newer document — a form
// approved late does not undo a note entered since.
import { writeChildField, type Provenance, type WriteResult } from './childFieldWrite'

/** Port an approved DCY 01234 into the child's record. Returns one result per
 *  field actually written; an empty array means the form carried nothing new. */
export async function applyDcyPort(
  rosterId: string,
  submission: { id: string; form_data: any; signature_date: string | null },
  enteredByName: string,
): Promise<WriteResult[]> {
  const fd = (submission?.form_data ?? {}) as Record<string, any>
  const documentDate = documentDateOf(fd, submission?.signature_date)
  // No date on the document → nothing to apply BY. The form is filed either way;
  // the card simply is not told, which is honest: we cannot order what we cannot date.
  if (!documentDate) return []

  const prov: Provenance = {
    source: 'library_form',
    documentDate,
    formKey: 'dcy_01234',
    submissionId: submission.id,
    note: 'ported from the approved form',
  }

  const out: WriteResult[] = []
  for (const w of buildDcyCardWrites(fd)) {
    if (w.table === 'child') continue          // demographics come from IEA, not this form
    out.push(await writeChildField(rosterId, { fieldKey: w.fieldKey, table: w.table, column: w.column, value: w.value }, prov, enteredByName))
  }
  return out
}

/** Port race/ethnicity from an approved IEA onto the child record. */
export async function applyIeaDemographics(
  rosterId: string,
  submission: { id: string; form_data: any; signature_date: string | null },
  enteredByName: string,
): Promise<WriteResult[]> {
  const fd = (submission?.form_data ?? {}) as Record<string, any>
  const documentDate = toIsoDate(submission?.signature_date)
  if (!documentDate) return []
  const prov: Provenance = {
    source: 'library_form', documentDate, formKey: 'iea',
    submissionId: submission.id, note: 'ported from the approved application',
  }
  const out: WriteResult[] = []
  for (const w of buildIeaDemographics(fd)) {
    out.push(await writeChildField(rosterId, { fieldKey: w.fieldKey, table: w.table as any, column: w.column, value: w.value }, prov, enteredByName))
  }
  return out
}

// ─── People ───────────────────────────────────────────────────────────────────
// The identity fork lives here, and it refuses to guess:
//   · exact key (e:<email>) matches → the path merges by itself;
//   · a phone or a name match → NOT a merge. The person is recorded as a
//     QUESTION for the director, with the candidates that were found;
//   · nothing found → a new person.
// A name is NEVER a merge, and there is no value in the vocabulary to record one.
import { supabase as sb } from './supabase'

export type PersonPortResult = {
  slot: PortPerson['slot']
  name: string
  outcome: 'linked' | 'needs_director' | 'error'
  matchMethod?: string
  candidates?: any[]
  error?: string
}

const ROLE_OF: Record<PortPerson['slot'], { role: string; ordinal: number }> = {
  parent_1:    { role: 'parent',            ordinal: 1 },
  parent_2:    { role: 'parent',            ordinal: 2 },
  emergency_1: { role: 'emergency_contact', ordinal: 1 },
  emergency_2: { role: 'emergency_contact', ordinal: 2 },
}

/** Port the people DCY 01234 names. Unambiguous ones are linked; anything that
 *  would require a judgement about identity is handed to the director instead. */
export async function applyDcyPeople(
  rosterId: string, orgId: string,
  submission: { id: string; form_data: any; signature_date: string | null },
  enteredByName: string,
): Promise<PersonPortResult[]> {
  const fd = (submission?.form_data ?? {}) as Record<string, any>
  const documentDate = documentDateOf(fd, submission?.signature_date)
  if (!documentDate) return []

  const out: PersonPortResult[] = []
  for (const p of buildDcyPeople(fd)) {
    const { role, ordinal } = ROLE_OF[p.slot]
    try {
      const { data: cands } = await (sb.schema('menumaker').rpc as any)('find_person_candidates', {
        p_org: orgId, p_email: p.email, p_phone: p.phone,
        p_first_name: p.firstName, p_last_name: p.lastName,
      })
      const list = (cands ?? []) as any[]
      const exact = list.find(c => c.why === 'exact_key')

      // A phone or name candidate WITHOUT an exact key is a question, not an answer.
      // And a question must be STORED, or it lives only in this message and dies
      // with it — a queue without storage is worse than a queue with one exit.
      if (!exact && list.length > 0) {
        await (sb.schema('menumaker').rpc as any)('defer_child_person', {
          p_roster_id: rosterId, p_relation_role: role, p_ordinal: ordinal,
          p_first_name: p.firstName, p_last_name: p.lastName,
          p_email: p.email, p_phone: p.phone, p_relationship: p.relationship,
          p_match_candidates: list,
          p_source: 'library_form', p_document_date: documentDate,
          p_source_form_key: 'dcy_01234', p_source_submission_id: submission.id,
          p_entered_by_name: enteredByName,
        })
        out.push({ slot: p.slot, name: p.fullName, outcome: 'needs_director', candidates: list })
        continue
      }

      const { data, error } = await (sb.schema('menumaker').rpc as any)('record_child_person', {
        p_roster_id: rosterId, p_relation_role: role, p_ordinal: ordinal, p_action: 'linked',
        p_first_name: p.firstName, p_last_name: p.lastName, p_email: p.email,
        p_phone: p.phone, p_address: p.address, p_relationship: p.relationship,
        p_source: 'library_form', p_document_date: documentDate,
        p_source_form_key: 'dcy_01234', p_source_submission_id: submission.id,
        p_entered_by_name: enteredByName,
      })
      if (error) { out.push({ slot: p.slot, name: p.fullName, outcome: 'error', error: error.message }); continue }
      out.push({ slot: p.slot, name: p.fullName, outcome: 'linked', matchMethod: (data as any)?.match_method })
    } catch (e: any) {
      out.push({ slot: p.slot, name: p.fullName, outcome: 'error', error: e?.message ?? String(e) })
    }
  }
  return out
}
