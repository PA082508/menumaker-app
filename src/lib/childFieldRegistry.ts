// ============================================================
// childFieldRegistry.ts — single source of truth for ChildSettingsPage fields.
//
// Every tab renders from this registry: [☐] Label [★ if required & empty]
// [value / inline editor]. Badges, footer counts, per-child export and the
// completeness % all aggregate from here — no per-tab hardcoding.
//
// Family / SafePass are child-level rules over the guardian set (not flat
// columns); Documents is file storage. Those three use derived completeness
// (see familyViolations / safepassViolations) rather than scalar FieldDefs.
// ============================================================

export type TabKey =
  | 'profile' | 'family' | 'enrollment' | 'health' | 'cacfp' | 'safepass' | 'billing' | 'documents'

// 'view' = read-only from v_child_age_profile (age/milk), never edited.
export type FieldTable = 'roster' | 'child_medical' | 'view'
export type FieldType = 'text' | 'textarea' | 'date' | 'select' | 'boolean' | 'phone' | 'email'

export interface FieldOption { value: string; label: string }

export interface FieldDef {
  key: string                 // stable id, unique across registry
  tab: TabKey
  section: string
  label: string
  table: FieldTable
  column: string
  type: FieldType
  required?: boolean          // counts toward completeness when active
  conditionalOn?: { field: string; truthy?: boolean; equals?: unknown }  // reads from roster
  readOnly?: boolean          // imported/computed — show + export, never edit, no ★
  options?: FieldOption[]
  overdue?: boolean           // a past date here is an overdue (black-badge) flag
}

export interface TabDef {
  key: TabKey
  label: string
  icon: string
  kind: 'fields' | 'guardians' | 'files'   // guardians = Family/SafePass rules; files = Documents
}

export const TABS: TabDef[] = [
  { key: 'profile',    label: 'Profile',    icon: '👤',   kind: 'fields' },
  { key: 'family',     label: 'Family',     icon: '👨‍👩‍👧',  kind: 'guardians' },
  { key: 'enrollment', label: 'Enrollment', icon: '📋',   kind: 'fields' },
  { key: 'health',     label: 'Health',     icon: '🏥',   kind: 'fields' },
  { key: 'cacfp',      label: 'CACFP',      icon: '🍽️',   kind: 'fields' },
  { key: 'safepass',   label: 'SafePass',   icon: '🔒',   kind: 'guardians' },
  { key: 'billing',    label: 'Billing',    icon: '💰',   kind: 'fields' },   // placeholder — no fields yet
  { key: 'documents',  label: 'Documents',  icon: '📁',   kind: 'files' },
]

const FRP_OPTIONS: FieldOption[] = [
  { value: 'F', label: 'Free' }, { value: 'R', label: 'Reduced' }, { value: 'P', label: 'Paid' },
]
const MILK_OPTIONS: FieldOption[] = [
  { value: 'whole', label: 'Whole' }, { value: '1%', label: '1%' },
  { value: 'skim', label: 'Skim' }, { value: 'soy', label: 'Soy (sub)' }, { value: 'none', label: 'None' },
]
const HHC_OPTIONS: FieldOption[] = [
  { value: 'true', label: 'Yes' }, { value: 'false', label: 'No' },
]

// ─── The registry ──────────────────────────────────────────────────────────────
export const FIELDS: FieldDef[] = [
  // ── Profile (roster) ──
  { key: 'first_name',   tab: 'profile', section: 'Identity',  label: 'First name',   table: 'roster', column: 'first_name',    type: 'text',   required: true },
  { key: 'last_name',    tab: 'profile', section: 'Identity',  label: 'Last name',    table: 'roster', column: 'last_name',     type: 'text',   required: true },
  { key: 'birthday',     tab: 'profile', section: 'Identity',  label: 'Birthday',     table: 'roster', column: 'birthday',      type: 'date',   required: true },
  { key: 'classroom_id', tab: 'profile', section: 'Placement', label: 'Classroom',    table: 'roster', column: 'classroom_id',  type: 'select', required: true },
  { key: 'child_address',tab: 'profile', section: 'Contact',   label: 'Home address', table: 'roster', column: 'child_address', type: 'text',   required: true },
  { key: 'date_in',      tab: 'profile', section: 'Placement', label: 'Start date',   table: 'roster', column: 'date_in',       type: 'date',   required: true },
  { key: 'date_out',     tab: 'profile', section: 'Placement', label: 'End date',     table: 'roster', column: 'date_out',      type: 'date' },

  // ── Enrollment (roster) — DCY 01234 ──
  { key: 'enrollment_reviewed_at',   tab: 'enrollment', section: 'DCY 01234 — Annual Review', label: 'Last annual review', table: 'roster', column: 'enrollment_reviewed_at', type: 'date', required: true, overdue: true },
  { key: 'emergency_transport_auth', tab: 'enrollment', section: 'DCY 01234 — Authorizations', label: 'Emergency transport authorized', table: 'roster', column: 'emergency_transport_auth', type: 'boolean', required: true },
  { key: 'development_notes',   tab: 'enrollment', section: 'Notes', label: 'Development notes',   table: 'roster', column: 'development_notes',   type: 'textarea' },
  { key: 'accommodations',      tab: 'enrollment', section: 'Notes', label: 'Accommodations',     table: 'roster', column: 'accommodations',      type: 'textarea' },
  { key: 'specialized_services',tab: 'enrollment', section: 'Notes', label: 'Specialized services', table: 'roster', column: 'specialized_services', type: 'textarea' },

  // ── Health (roster gate + child_medical) — DCY 01236 ──
  { key: 'has_health_condition', tab: 'health', section: 'Screening', label: 'Has a health condition', table: 'roster', column: 'has_health_condition', type: 'boolean', required: true, options: HHC_OPTIONS },
  { key: 'doctor_name',  tab: 'health', section: 'Provider', label: 'Doctor name',  table: 'child_medical', column: 'doctor_name',  type: 'text' },   // optional in v1 (collected once DCY forms are online)
  { key: 'doctor_phone', tab: 'health', section: 'Provider', label: 'Doctor phone', table: 'child_medical', column: 'doctor_phone', type: 'phone' },  // optional in v1
  { key: 'allergies',    tab: 'health', section: 'Medical',  label: 'Allergies',    table: 'child_medical', column: 'allergies',    type: 'textarea' }, // never required: empty = "none"
  { key: 'medications',  tab: 'health', section: 'Medical',  label: 'Medications',  table: 'child_medical', column: 'medications',  type: 'textarea' }, // never required: empty = "none"
  { key: 'parent_signed_at', tab: 'health', section: 'Attestation', label: 'Parent signature date', table: 'child_medical', column: 'parent_signed_at', type: 'date', required: true },
  // DCY 01236 detail — active only when has_health_condition; NOT required
  { key: 'health_condition_name', tab: 'health', section: 'DCY 01236 — Condition', label: 'Condition name',    table: 'child_medical', column: 'health_condition_name', type: 'text',     conditionalOn: { field: 'has_health_condition', truthy: true } },
  { key: 'condition_symptoms',    tab: 'health', section: 'DCY 01236 — Condition', label: 'Symptoms',          table: 'child_medical', column: 'condition_symptoms',    type: 'textarea', conditionalOn: { field: 'has_health_condition', truthy: true } },
  { key: 'care_instructions',     tab: 'health', section: 'DCY 01236 — Condition', label: 'Care instructions', table: 'child_medical', column: 'care_instructions',     type: 'textarea', conditionalOn: { field: 'has_health_condition', truthy: true } },
  { key: 'emergency_action',      tab: 'health', section: 'DCY 01236 — Condition', label: 'Emergency action',  table: 'child_medical', column: 'emergency_action',      type: 'textarea', conditionalOn: { field: 'has_health_condition', truthy: true } },
  { key: 'foods_to_avoid',        tab: 'health', section: 'DCY 01236 — Restrictions', label: 'Foods to avoid',      table: 'child_medical', column: 'foods_to_avoid',      type: 'textarea', conditionalOn: { field: 'has_health_condition', truthy: true } },
  { key: 'activities_to_avoid',   tab: 'health', section: 'DCY 01236 — Restrictions', label: 'Activities to avoid', table: 'child_medical', column: 'activities_to_avoid', type: 'textarea', conditionalOn: { field: 'has_health_condition', truthy: true } },
  { key: 'evacuation_notes',        tab: 'health', section: 'DCY 01236 — Restrictions', label: 'Evacuation needs / additional info', table: 'child_medical', column: 'evacuation_notes', type: 'textarea', conditionalOn: { field: 'has_health_condition', truthy: true } },
  { key: 'physician_signature_date', tab: 'health', section: 'DCY 01236 — Attestation', label: 'Physician signature date', table: 'child_medical', column: 'physician_signature_date', type: 'date', conditionalOn: { field: 'has_health_condition', truthy: true } },

  // ── CACFP (roster editable + v_child_age_profile read-only) ──
  { key: 'frp',       tab: 'cacfp', section: 'Eligibility', label: 'FRP status',  table: 'roster', column: 'frp',        type: 'select', required: true, options: FRP_OPTIONS },
  { key: 'frp_expires', tab: 'cacfp', section: 'Eligibility', label: 'FRP expires', table: 'roster', column: 'frp_expires', type: 'date', overdue: true }, // 12-mo IEA validity; overdue = claim risk
  { key: 'milk_kind', tab: 'cacfp', section: 'Meal Pattern', label: 'Milk type',   table: 'roster', column: 'milk_kind',  type: 'select', required: true, options: MILK_OPTIONS },
  { key: 'age_group', tab: 'cacfp', section: 'Meal Pattern', label: 'Age group',   table: 'view', column: 'age_group_label', type: 'text', readOnly: true }, // from v_child_age_profile
  { key: 'milk_oz',   tab: 'cacfp', section: 'Meal Pattern', label: 'Milk (oz)',   table: 'view', column: 'milk_oz',      type: 'text', readOnly: true }, // from v_child_age_profile
]

// ─── Helpers ───────────────────────────────────────────────────────────────────
export const fieldsForTab = (tab: TabKey) => FIELDS.filter(f => f.tab === tab)

export type RecordCtx = {
  roster: Record<string, any> | null
  medical: Record<string, any> | null
  view: Record<string, any> | null   // v_child_age_profile row (read-only)
}

/** Guardian shape needed for Family/SafePass child-level rules. */
export type GuardianLite = {
  first_name?: string | null; last_name?: string | null; mobile_phone?: string | null
  relationship?: string | null; is_emergency_contact?: boolean | null; can_pickup?: boolean | null
  role?: string | null
}

export function fieldValue(f: FieldDef, ctx: RecordCtx): any {
  const src = f.table === 'child_medical' ? ctx.medical : f.table === 'view' ? ctx.view : ctx.roster
  return src ? src[f.column] : undefined
}

/** Human-readable value for a field — shared by the inline display, CSV export
 *  and print. Empty → ''. Selects/booleans resolve to their label. */
export function displayValue(
  f: FieldDef, ctx: RecordCtx, opts?: { classroomLabel?: (id: string) => string },
): string {
  const v = fieldValue(f, ctx)
  if (v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0)) return ''
  if (f.type === 'boolean') return v === true ? 'Yes' : v === false ? 'No' : ''
  if (f.type === 'select') {
    if (f.column === 'classroom_id' && opts?.classroomLabel) return opts.classroomLabel(String(v)) || String(v)
    return f.options?.find(o => o.value === String(v))?.label ?? String(v)
  }
  if (f.type === 'date') return String(v).slice(0, 10)
  return String(v)
}

export function isFieldActive(f: FieldDef, ctx: RecordCtx): boolean {
  const c = f.conditionalOn
  if (!c) return true
  const v = (ctx.roster ?? {})[c.field]
  if (c.truthy) return !!v
  if ('equals' in c) return v === c.equals
  return true
}

const isEmpty = (v: any) => v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0)

// ── Family / SafePass child-level rules ──
// Family "filled" = (≥1 guardian with first+last+mobile+relationship) AND (≥1 emergency).
//   Returns 0–2 rule violations (that's what the tab badge shows; per-card ★ are separate).
export function familyViolations(guardians: GuardianLite[]): number {
  const complete = guardians.some(g => g.first_name && g.last_name && g.mobile_phone && g.relationship)
  const emergency = guardians.some(g => !!g.is_emergency_contact)
  return (complete ? 0 : 1) + (emergency ? 0 : 1)
}
// SafePass "filled" = ≥1 pickup-authorized (can_pickup=true). Trusted-persons + per-person
// method aren't roster-joinable yet (safepass_trusted_persons.child_id is TEXT) → deferred.
export function safepassViolations(guardians: GuardianLite[]): number {
  return guardians.some(g => !!g.can_pickup) ? 0 : 1
}

/** Empty-required + overdue counts for a tab's badge/footer. */
export function tabCounts(tab: TabKey, ctx: RecordCtx, guardians: GuardianLite[]): { empty: number; overdue: number } {
  const today = new Date().toISOString().slice(0, 10)
  let empty = 0, overdue = 0
  for (const f of fieldsForTab(tab)) {
    if (f.readOnly || !isFieldActive(f, ctx)) continue
    const v = fieldValue(f, ctx)
    if (f.required && isEmpty(v)) empty++
    if (f.overdue && v && String(v).slice(0, 10) < today) overdue++
  }
  if (tab === 'family') empty += familyViolations(guardians)
  if (tab === 'safepass') empty += safepassViolations(guardians)
  return { empty, overdue }
}

/** Overall completeness: filled active-required / all active-required (incl. derived rules). */
export function completeness(ctx: RecordCtx, guardians: GuardianLite[]): { pct: number; filled: number; total: number } {
  let total = 0, filled = 0
  for (const f of FIELDS) {
    if (!f.required || f.readOnly || !isFieldActive(f, ctx)) continue
    total++
    if (!isEmpty(fieldValue(f, ctx))) filled++
  }
  // Family = 2 units (complete-guardian + emergency); SafePass = 1 unit (pickup)
  total += 2; filled += (2 - familyViolations(guardians))
  total += 1; filled += (1 - safepassViolations(guardians))
  const pct = total === 0 ? 100 : Math.round((filled / total) * 100)
  return { pct, filled, total }
}
