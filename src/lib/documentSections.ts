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

export type SectionId = 'ohio_dcy' | 'cacfp' | 'our_documents' | 'other'
export const SECTIONS: { id: SectionId; label: string }[] = [
  { id: 'ohio_dcy', label: 'Ohio DCY' },
  { id: 'cacfp', label: 'CACFP — participation' },
  { id: 'our_documents', label: 'Our documents' },
  { id: 'other', label: 'Other' },
]

const KEY_SECTION: Record<string, SectionId> = {}
for (const k of [...SEC1, ...SUTQ_DOCS]) KEY_SECTION[k] = 'ohio_dcy'
for (const k of SEC2) KEY_SECTION[k] = 'cacfp'
for (const k of [...SEC4_FORMS, ...OUR_DOCS]) KEY_SECTION[k] = 'our_documents'

/** Which Library section a registry form key belongs to. Unlisted → 'other' (never dropped). */
export function sectionOfKey(key: string): SectionId {
  return KEY_SECTION[key] ?? 'other'
}
