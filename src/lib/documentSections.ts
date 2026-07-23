// documentSections.ts — the ONE source of the Library section taxonomy.
//
// Shared by the Documents → Library page (DocumentHubPage) and the director's
// "Add from library" section filter in PacketSetsPage, so the two can never drift.
// These are the registry-form groupings only (§3 "Claim results" is route links,
// not composable forms, so it isn't here). A registry key not in any list falls to
// 'other' — it's never dropped from the filter, just bucketed.

export const SEC1 = ['dcy_01234', 'dcy_01236', 'dcy_01217', 'dcy_01305', 'dcy_01218', 'dcy_01225', 'dcy_01226', 'center_parent_information'] // Ohio DCY
export const SUTQ_DOCS = ['sutq_family_needs_survey']                                                                                        // §1 sub-group
export const SEC2 = ['enroll', 'iea', 'usda_waiver', 'fluid_milk', 'special_diet', 'infant_meals']                                            // CACFP participation
export const SEC4_FORMS = ['parent_consent', 'staff']                                                                                         // Our documents (forms)
export const OUR_DOCS = ['child_release_authorization', 'parent_responsibilities', 'topical_product_consent', 'transition_into_program', 'building_for_the_future', 'what_to_bring_infant', 'parents_book', 'wic_information', 'start_form']

export type SectionId = 'ohio_dcy' | 'cacfp' | 'our_documents' | 'claim_print' | 'other'

// Builder ("Add from library") sections — REGISTRY forms only (a director composes registry
// forms). The internal claim/print docs below never enter a director's set today, so they are
// NOT offered here (they'd be an empty option).
export const SECTIONS: { id: SectionId; label: string }[] = [
  { id: 'ohio_dcy', label: 'Ohio DCY' },
  { id: 'cacfp', label: 'CACFP — participation' },
  { id: 'our_documents', label: 'Our documents' },
  { id: 'other', label: 'Other' },
]
// Library-page sections = the builder set + the internal claim/print group.
export const LIBRARY_SECTIONS: { id: SectionId; label: string }[] = [
  ...SECTIONS.filter(s => s.id !== 'other'),
  { id: 'claim_print', label: 'CACFP — claim & print' },
  { id: 'other', label: 'Other' },
]

// Non-registry library documents (internal CACFP print/claim artifacts NOT in enroll-registry).
// They carry a director-access toggle for FORWARD-COMPAT only ("pre-wiring"): a director's
// Add-from-library lists registry forms today, so closing/opening these is inert until sets can
// carry non-registry docs (the 4-surface delta). `url` null = generated in-app from a report page.
export interface NonRegDoc { key: string; title: string; url: string | null; internal: boolean }
export const NON_REGISTRY_DOCS: NonRegDoc[] = [
  { key: 'print_food_cost_worksheet',   title: 'Food Cost Worksheet',                 url: '/forms/FoodCostWorksheet.html',           internal: false },
  { key: 'print_food_cost_beginning',   title: 'Food Cost Worksheet — Beginning (Oct)', url: '/forms/FoodCostWorksheet_Beginning.html', internal: false },
  { key: 'print_food_cost_ending',      title: 'Food Cost Worksheet — Ending (Sep)',  url: '/forms/FoodCostWorksheet_Ending.html',    internal: false },
  { key: 'print_other_monthly_costs',   title: 'Other Monthly Costs',                 url: '/forms/OtherMonthlyCosts_Template.html',  internal: false },
  { key: 'print_sep_food_inventory',    title: 'September Food Inventory',            url: '/forms/Sep_Food_Inventory.html',          internal: false },
  { key: 'print_sep_nonfood_inventory', title: 'September Non-Food Inventory',        url: '/forms/Sep_NonFood_Inventory.html',       internal: false },
  { key: 'gen_meal_count',              title: 'Weekly Meal Count sheet',            url: null, internal: true },
  { key: 'gen_attendance_blank',        title: 'Weekly Attendance (blank)',          url: null, internal: true },
  { key: 'gen_skeleton_recon',          title: 'Skeleton Reconciliation worksheet',  url: null, internal: true },
  { key: 'gen_eligibility_recon',       title: 'Eligibility Reconciliation worksheet', url: null, internal: true },
  { key: 'gen_kitchen_planning',        title: 'Kitchen Planning report',            url: null, internal: true },
  { key: 'gen_site_claim',              title: 'CACFP Site Claim report',            url: null, internal: true },
  { key: 'gen_reimbursement_preview',   title: 'Reimbursement preview',              url: null, internal: true },
]
/** True for a non-registry document key (its access toggle is pre-wiring, inert today). */
export function isNonRegistryDoc(key: string): boolean {
  return NON_REGISTRY_DOCS.some(d => d.key === key)
}

const KEY_SECTION: Record<string, SectionId> = {}
for (const k of [...SEC1, ...SUTQ_DOCS]) KEY_SECTION[k] = 'ohio_dcy'
for (const k of SEC2) KEY_SECTION[k] = 'cacfp'
for (const k of [...SEC4_FORMS, ...OUR_DOCS]) KEY_SECTION[k] = 'our_documents'
for (const d of NON_REGISTRY_DOCS) KEY_SECTION[d.key] = 'claim_print'

/** Which Library section a document key belongs to. Unlisted → 'other' (never dropped). */
export function sectionOfKey(key: string): SectionId {
  return KEY_SECTION[key] ?? 'other'
}

// ── Library "kind" grouping — Part 3 substrate, built UP TO the tabs-vs-relocation fork ──────
// A document's KIND (sign-online / keep-and-print / government / internal print / claim export)
// is orthogonal to its SECTION. This classifies + groups any keyed library items by kind in a
// stable order, so a kind-first Library view can be assembled without re-deriving the buckets.
//
// ⚠️ The PRESENTATION fork is deliberately NOT decided here: whether a kind-first view is shown as
//    TABS inside the Library, or a kind is RELOCATED to its own page, is Nikolay's call ("вкладки
//    vs переезд"). This file is only the shared classification both options would consume — no
//    component renders it yet.
export type DocKind = 'signature' | 'keep' | 'gov' | 'print' | 'export' | 'document' | 'other'
export const KIND_ORDER: DocKind[] = ['signature', 'keep', 'gov', 'print', 'export', 'document', 'other']
export const KIND_LABEL: Record<DocKind, string> = {
  signature: 'Sign online',
  keep:      'Keep & print',
  gov:       'Government forms',
  print:     'Print / claim worksheets',
  export:    'Claim exports',
  document:  'Documents',
  other:     'Other',
}
// The minimum an item must carry to be classified — a superset of both the registry FormCard
// shape (kind/isGovForm/url) and NonRegDoc, so callers pass either without adapting.
export interface Kindable { key: string; kind?: string | null; isGovForm?: boolean; url?: string | null }

/** Classify a library item into a coarse KIND bucket. Non-registry print/claim docs are
 *  recognised by key (printable → 'print', generated → 'export'); otherwise the registry `kind`
 *  wins, with a government signature form promoted to 'gov'. Unknown → 'document' (never dropped). */
export function kindOfDoc(it: Kindable): DocKind {
  if (isNonRegistryDoc(it.key)) {
    // A non-registry doc's printability is a property of the doc itself, not of the passed
    // item — look it up so classification works whether or not the caller carried `url`.
    const d = NON_REGISTRY_DOCS.find(x => x.key === it.key)
    return (d ? d.url : it.url) ? 'print' : 'export'
  }
  const k = (it.kind ?? '').toLowerCase()
  if (k === 'keep') return 'keep'
  if (k === 'signature') return it.isGovForm ? 'gov' : 'signature'
  if (k === 'document') return 'document'
  if (it.isGovForm) return 'gov'
  return k ? 'other' : 'document'
}

/** Group keyed items by KIND in KIND_ORDER; empty buckets are dropped, order within a bucket is
 *  preserved. Nothing is silently discarded — an unclassifiable item lands in 'document'/'other'. */
export function groupByKind<T extends Kindable>(items: T[]): { kind: DocKind; label: string; items: T[] }[] {
  const by = new Map<DocKind, T[]>()
  for (const it of items) {
    const k = kindOfDoc(it)
    const arr = by.get(k) ?? []
    if (!by.has(k)) by.set(k, arr)
    arr.push(it)
  }
  return KIND_ORDER.filter(k => by.has(k)).map(k => ({ kind: k, label: KIND_LABEL[k], items: by.get(k)! }))
}
