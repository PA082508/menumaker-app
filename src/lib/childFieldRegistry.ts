// ============================================================
// childFieldRegistry.ts — single source of truth for ChildSettingsPage fields.
//
// Every tab renders from this registry: [☐] Label [★ if required & empty]
// [value / inline editor]. Badges, footer counts, per-child export and the
// completeness % all aggregate from here — no per-tab hardcoding.
//
// Family / SafePass are guardian-derived (not flat columns) and Documents is
// file storage, so those are represented as `kind:'derived'|'files'` sections
// rather than scalar FieldDefs. Scalar tabs (Profile/Enrollment/Health/CACFP/
// Billing) are fully described here and map 1:1 to DB columns.
// ============================================================

export type TabKey =
  | 'profile' | 'family' | 'enrollment' | 'health' | 'cacfp' | 'safepass' | 'billing' | 'documents'

export type FieldTable = 'roster' | 'child_medical' | 'derived'
export type FieldType = 'text' | 'textarea' | 'date' | 'select' | 'boolean' | 'phone' | 'email'

export interface FieldOption { value: string; label: string }

/** A single editable/displayable field, bound to one DB column. */
export interface FieldDef {
  key: string                 // stable id, unique across registry
  tab: TabKey
  section: string             // section header within the tab
  label: string
  table: FieldTable
  column: string              // DB column on `table` (or synthetic for derived)
  type: FieldType
  required?: boolean          // counts toward completeness when active
  /** Field is only active (rendered + counted) when this condition holds. */
  conditionalOn?: { field: string; truthy?: boolean; equals?: unknown }
  readOnly?: boolean          // imported/computed — show, don't edit
  options?: FieldOption[]     // for select
  isDate?: boolean            // date fields also participate in "overdue" checks
  overdue?: boolean           // a past date in this field is an overdue flag (e.g. frp_expires)
}

/** Tab-level metadata (order, label, and non-scalar rendering kind). */
export interface TabDef {
  key: TabKey
  label: string
  icon: string
  /** 'fields' = render from FieldDefs; 'guardians' = Family list; 'files' = Documents. */
  kind: 'fields' | 'guardians' | 'files'
}

export const TABS: TabDef[] = [
  { key: 'profile',    label: 'Profile',    icon: '👤',        kind: 'fields' },
  { key: 'family',     label: 'Family',     icon: '👨‍👩‍👧',       kind: 'guardians' },
  { key: 'enrollment', label: 'Enrollment', icon: '📋',        kind: 'fields' },
  { key: 'health',     label: 'Health',     icon: '🏥',        kind: 'fields' },
  { key: 'cacfp',      label: 'CACFP',      icon: '🍽️',        kind: 'fields' },
  { key: 'safepass',   label: 'SafePass',   icon: '🔒',        kind: 'guardians' },
  { key: 'billing',    label: 'Billing',    icon: '💰',        kind: 'fields' },
  { key: 'documents',  label: 'Documents',  icon: '📁',        kind: 'files' },
]

const FRP_OPTIONS: FieldOption[] = [
  { value: 'F', label: 'Free' }, { value: 'R', label: 'Reduced' }, { value: 'P', label: 'Paid' },
]
const MILK_OPTIONS: FieldOption[] = [
  { value: 'whole', label: 'Whole' }, { value: '1%', label: '1%' },
  { value: 'skim', label: 'Skim' }, { value: 'soy', label: 'Soy (sub)' }, { value: 'none', label: 'None' },
]

// ─── The registry ──────────────────────────────────────────────────────────────
// Family (guardians) and SafePass (pickup rights) are guardian-derived; their
// "completeness" is computed separately (≥1 guardian / ≥1 pickup-authorized).
export const FIELDS: FieldDef[] = [
  // ── Profile (roster) ──
  { key: 'first_name',   tab: 'profile', section: 'Identity', label: 'First name', table: 'roster', column: 'first_name', type: 'text', required: true },
  { key: 'last_name',    tab: 'profile', section: 'Identity', label: 'Last name',  table: 'roster', column: 'last_name',  type: 'text', required: true },
  { key: 'birthday',     tab: 'profile', section: 'Identity', label: 'Birthday',   table: 'roster', column: 'birthday',  type: 'date', required: true, isDate: true },
  { key: 'classroom_id', tab: 'profile', section: 'Placement', label: 'Classroom', table: 'roster', column: 'classroom_id', type: 'select', required: true },
  { key: 'date_in',      tab: 'profile', section: 'Placement', label: 'Start date', table: 'roster', column: 'date_in',  type: 'date', required: true, isDate: true },
  { key: 'date_out',     tab: 'profile', section: 'Placement', label: 'End date',   table: 'roster', column: 'date_out', type: 'date', isDate: true },
  { key: 'child_address',tab: 'profile', section: 'Contact',   label: 'Home address', table: 'roster', column: 'child_address', type: 'text' },

  // ── Enrollment (roster) — DCY 01234 ──
  { key: 'frp',                  tab: 'enrollment', section: 'DCY 01234 — Eligibility', label: 'FRP status', table: 'roster', column: 'frp', type: 'select', required: true, options: FRP_OPTIONS },
  { key: 'frp_expires',          tab: 'enrollment', section: 'DCY 01234 — Eligibility', label: 'FRP expires', table: 'roster', column: 'frp_expires', type: 'date', isDate: true, overdue: true },
  { key: 'enrollment_reviewed_at', tab: 'enrollment', section: 'DCY 01234 — Review', label: 'Last annual review', table: 'roster', column: 'enrollment_reviewed_at', type: 'date', required: true, isDate: true, overdue: true },
  { key: 'emergency_transport_auth', tab: 'enrollment', section: 'DCY 01234 — Authorizations', label: 'Emergency transport authorized', table: 'roster', column: 'emergency_transport_auth', type: 'boolean' },

  // ── Health (child_medical) — DCY 01236, gated on has_health_condition ──
  { key: 'doctor_name',  tab: 'health', section: 'Provider', label: 'Doctor name',  table: 'child_medical', column: 'doctor_name',  type: 'text', required: true },
  { key: 'doctor_phone', tab: 'health', section: 'Provider', label: 'Doctor phone', table: 'child_medical', column: 'doctor_phone', type: 'phone', required: true },
  { key: 'allergies',    tab: 'health', section: 'Medical',  label: 'Allergies',    table: 'child_medical', column: 'allergies',    type: 'textarea' },
  { key: 'medications',  tab: 'health', section: 'Medical',  label: 'Medications',  table: 'child_medical', column: 'medications',  type: 'textarea' },
  // DCY 01236 — only required when the child has a documented health condition
  { key: 'health_condition_name', tab: 'health', section: 'DCY 01236 — Health Condition', label: 'Condition name', table: 'child_medical', column: 'health_condition_name', type: 'text', required: true, conditionalOn: { field: 'has_health_condition', truthy: true } },
  { key: 'condition_symptoms',    tab: 'health', section: 'DCY 01236 — Health Condition', label: 'Symptoms', table: 'child_medical', column: 'condition_symptoms', type: 'textarea', required: true, conditionalOn: { field: 'has_health_condition', truthy: true } },
  { key: 'care_instructions',     tab: 'health', section: 'DCY 01236 — Health Condition', label: 'Care instructions', table: 'child_medical', column: 'care_instructions', type: 'textarea', required: true, conditionalOn: { field: 'has_health_condition', truthy: true } },
  { key: 'emergency_action',      tab: 'health', section: 'DCY 01236 — Health Condition', label: 'Emergency action plan', table: 'child_medical', column: 'emergency_action', type: 'textarea', required: true, conditionalOn: { field: 'has_health_condition', truthy: true } },
  { key: 'foods_to_avoid',        tab: 'health', section: 'DCY 01236 — Restrictions', label: 'Foods to avoid', table: 'child_medical', column: 'foods_to_avoid', type: 'textarea', conditionalOn: { field: 'has_health_condition', truthy: true } },
  { key: 'activities_to_avoid',   tab: 'health', section: 'DCY 01236 — Restrictions', label: 'Activities to avoid', table: 'child_medical', column: 'activities_to_avoid', type: 'textarea', conditionalOn: { field: 'has_health_condition', truthy: true } },

  // ── CACFP (roster) ──
  { key: 'frp_cacfp',  tab: 'cacfp', section: 'Meal Eligibility', label: 'FRP status', table: 'roster', column: 'frp', type: 'select', required: true, options: FRP_OPTIONS, readOnly: true },
  { key: 'age_group_food', tab: 'cacfp', section: 'Meal Pattern', label: 'Age group (food)', table: 'roster', column: 'age_group_food', type: 'text', required: true },
  { key: 'milk_kind',  tab: 'cacfp', section: 'Meal Pattern', label: 'Milk type', table: 'roster', column: 'milk_kind', type: 'select', required: true, options: MILK_OPTIONS },
]

// ─── Derived-tab completeness contributions ────────────────────────────────────
// Family: ≥1 guardian on file. SafePass: ≥1 pickup-authorized (role-based in v1).
export const DERIVED_REQUIRED: Record<'family' | 'safepass', { label: string }> = {
  family:   { label: 'At least one guardian on file' },
  safepass: { label: 'At least one pickup-authorized contact' },
}

// ─── Helpers ───────────────────────────────────────────────────────────────────
export const fieldsForTab = (tab: TabKey) => FIELDS.filter(f => f.tab === tab)

/** Read the value backing a field from the two record sources. */
export type RecordCtx = {
  roster: Record<string, any> | null
  medical: Record<string, any> | null
}
export function fieldValue(f: FieldDef, ctx: RecordCtx): any {
  const src = f.table === 'child_medical' ? ctx.medical : ctx.roster
  return src ? src[f.column] : undefined
}

/** Is a conditional field currently active? (conditions read from roster). */
export function isFieldActive(f: FieldDef, ctx: RecordCtx): boolean {
  const c = f.conditionalOn
  if (!c) return true
  const v = (ctx.roster ?? {})[c.field]
  if (c.truthy) return !!v
  if ('equals' in c) return v === c.equals
  return true
}

const isEmpty = (v: any) => v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0)

/** Empty required + overdue counts for a tab (used by badges + footer). */
export function tabCounts(tab: TabKey, ctx: RecordCtx, guardians: { role?: string }[]): { empty: number; overdue: number } {
  const today = new Date().toISOString().slice(0, 10)
  let empty = 0, overdue = 0
  for (const f of fieldsForTab(tab)) {
    if (!isFieldActive(f, ctx)) continue
    const v = fieldValue(f, ctx)
    if (f.required && isEmpty(v)) empty++
    if (f.overdue && v && String(v).slice(0, 10) < today) overdue++
  }
  // derived-tab requirements
  if (tab === 'family' && guardians.length === 0) empty++
  if (tab === 'safepass' && !guardians.some(g => g.role === 'pickup' || g.role === 'parent')) empty++
  return { empty, overdue }
}

/** Overall completeness: filled active-required / all active-required. */
export function completeness(ctx: RecordCtx, guardians: { role?: string }[]): { pct: number; filled: number; total: number } {
  let total = 0, filled = 0
  for (const f of FIELDS) {
    if (!f.required || !isFieldActive(f, ctx)) continue
    total++
    if (!isEmpty(fieldValue(f, ctx))) filled++
  }
  // derived requirements
  total++; if (guardians.length > 0) filled++                                   // family
  total++; if (guardians.some(g => g.role === 'pickup' || g.role === 'parent')) filled++ // safepass
  const pct = total === 0 ? 100 : Math.round((filled / total) * 100)
  return { pct, filled, total }
}
