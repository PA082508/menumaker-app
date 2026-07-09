// ============================================================
// staffJdRegistry.ts — single source of truth for the staff sign-set:
// §2 role → exactly one Job-Description acknowledgment (1:1, per-role).
//
// SURFACE = IN-APP. The verbatim JD TEXT lives in policy_documents
// (key + version, status='active'); this registry maps each role to its
// policy key/version and holds the acknowledgment-line + field set that
// SignModal renders on top of the body (ack line/fields are NOT in the
// stored text). The sign-set (JD-for-role + §6 BYOD) is assigned at
// Approve→staff; the safepass_agreements ledger row is written there too
// (that flow is a follow-up — this registry stands alone meanwhile).
//
// Adding cook/driver/office = add a policy_documents record + a STAFF_JD entry
// here. No form-kit / SignModal change needed.
// ============================================================

import { supabase } from '@/lib/supabase'

const S = () => supabase.schema('menumaker')

// §2 role — job position × age group, matching the storefront §2 role list
// (not the auth get_user_role() set). Keep in sync with Staff_Enrollment_v1.
// The generic 'teacher'/'teacher assistant' from Increment 1 are RETIRED —
// every teaching role is now a precise per-age-group doc.
export type StaffRole =
  | 'director'
  | 'director helper'
  | 'infant-toddler lead'
  | 'infant-toddler assistant'
  | 'preschool lead'
  | 'preschool assistant'
  | 'school-age lead'
  | 'school-age assistant'
  | 'floater'
  | 'cook'
  | 'driver'
  | 'office'

export interface JdDoc {
  /** policy_documents.key — key + '_' + version = Nikolay's identifier (e.g. Staff_JD_Teacher_v1). */
  policyKey: string
  /** policy_documents.version. */
  version: string
  /** Human title (mirrors policy_documents.title). */
  title: string
  /**
   * Acknowledgment line SignModal renders as the confirm-checkbox label.
   * NOT stored in policy_documents.body (ack line/fields are pattern chrome).
   */
  ackLine: string
  /**
   * e-version tail fields SignModal collects. namePrint autofills from the
   * §1 staff form; signature = drawn pad; date = server/today.
   */
  fields: ('namePrint' | 'signature' | 'date')[]
}

const STD_FIELDS: JdDoc['fields'] = ['namePrint', 'signature', 'date']

// role → its ONE JD acknowledgment. ackLine = the document's native first phrase
// ("I, as a … understand the following responsibilities and duties."). Roles
// WITHOUT a JD (cook/driver/office) are intentionally absent — jdForRole() returns
// null, so the sign-set skips the JD and just carries §6 BYOD.
export const STAFF_JD_BY_ROLE: Partial<Record<StaffRole, JdDoc>> = {
  director: {
    policyKey: 'Staff_JD_Director', version: 'v1',
    title: 'Director — Job Description',
    ackLine: 'I, as a Director of Play Academy understand the following responsibilities and duties.',
    fields: STD_FIELDS,
  },
  'director helper': {
    policyKey: 'Staff_JD_DirectorHelper', version: 'v1',
    title: 'Director Helper — Job Description',
    ackLine: 'I, as a helper of the Director of Play Academy understand the following responsibilities and duties.',
    fields: STD_FIELDS,
  },
  'infant-toddler lead': {
    policyKey: 'Staff_JD_InfantToddlerLead', version: 'v1',
    title: 'Lead Teacher (Infant/Toddler) — Job Description',
    ackLine: 'I, as a Lead Teacher of the infant-toddler classroom understand the following responsibilities and duties.',
    fields: STD_FIELDS,
  },
  'infant-toddler assistant': {
    policyKey: 'Staff_JD_InfantToddlerAssistant', version: 'v1',
    title: 'Assistant Teacher (Infant/Toddler) — Job Description',
    ackLine: 'I, as an Assistant Teacher of the infant-toddler classroom understand the following responsibilities and duties.',
    fields: STD_FIELDS,
  },
  'preschool lead': {
    policyKey: 'Staff_JD_PreschoolLead', version: 'v1',
    title: 'Lead Teacher (Preschool/Pre-K) — Job Description',
    ackLine: 'I, as a Lead Teacher of the Preschool/Pre-K classroom understand the following responsibilities and duties.',
    fields: STD_FIELDS,
  },
  'preschool assistant': {
    policyKey: 'Staff_JD_PreschoolAssistant', version: 'v1',
    title: 'Assistant Teacher (Preschool/Pre-K) — Job Description',
    ackLine: 'I, as an Assistant Teacher of the Preschool/Pre-K classroom understand the following responsibilities and duties.',
    fields: STD_FIELDS,
  },
  'school-age lead': {
    policyKey: 'Staff_JD_SchoolAgeLead', version: 'v1',
    title: 'Lead Teacher (School-Age) — Job Description',
    ackLine: 'I, as a Lead Teacher of the School-age classroom understand the following responsibilities and duties.',
    fields: STD_FIELDS,
  },
  'school-age assistant': {
    policyKey: 'Staff_JD_SchoolAgeAssistant', version: 'v1',
    title: 'Assistant Teacher (School-Age) — Job Description',
    ackLine: 'I, as an Assistant Teacher of the School-age classroom understand the following responsibilities and duties.',
    fields: STD_FIELDS,
  },
  floater: {
    policyKey: 'Staff_Floater_Takeover', version: 'v1',
    title: 'Floater Teacher — Job Description When Taking Over the Classroom',
    ackLine: 'I understand the above statement and expectations.',
    fields: STD_FIELDS,
  },
  // cook / driver / office — pending JD text; add a policy_documents record + an
  // entry here when it arrives. Generic Staff_JD_Teacher / Staff_JD_TeacherAssistant
  // (Increment 1) are RETIRED in the DB — superseded by the per-age-group docs above.
}

/** All §2 roles that currently have a JD acknowledgment to sign. */
export const ROLES_WITH_JD = Object.keys(STAFF_JD_BY_ROLE) as StaffRole[]

/** The one JD acknowledgment for a role, or null if none is registered yet. */
export function jdForRole(role: StaffRole | string | null | undefined): JdDoc | null {
  if (!role) return null
  return STAFF_JD_BY_ROLE[role.trim().toLowerCase() as StaffRole] ?? null
}

/**
 * The role's full onboarding sign-set (order = render order in the packet):
 * its JD acknowledgment first, then §6 BYOD/Smartphone. Roles without a JD
 * still get BYOD. Returned as descriptors SignModal can drive.
 */
export const BYOD_ACK: JdDoc = {
  policyKey: 'byod',
  version: 'v1',
  title: 'BYOD Device Use Agreement (§6 Smartphone)',
  ackLine: 'I have read and voluntarily agree to the BYOD Agreement.',
  fields: STD_FIELDS,
}

export function signSetForRole(role: StaffRole | string | null | undefined): JdDoc[] {
  const jd = jdForRole(role)
  return jd ? [jd, BYOD_ACK] : [BYOD_ACK]
}

/**
 * Fetch the active JD body from policy_documents for a descriptor. Returns the
 * markdown body string, or null if the active version is missing (e.g. retired
 * / not yet activated). SignModal renders this read-only above the ack line.
 */
export async function fetchActiveJdBody(doc: Pick<JdDoc, 'policyKey' | 'version'>): Promise<string | null> {
  const { data, error } = await S()
    .from('policy_documents')
    .select('body')
    .eq('key', doc.policyKey)
    .eq('version', doc.version)
    .eq('status', 'active')
    .maybeSingle()
  if (error || !data) return null
  return (data as { body: string | null }).body
}
