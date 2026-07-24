// originalFormReplicas.ts — which submission types have a LOCAL read-only "original form"
// replica in public/forms/ that the Approve modal can render (Step 1).
//
// The replica is a 1:1 copy of the storefront form kit (same official-scan overlay, same
// FIELDS[] coordinates) rendered read-only — the reviewer must see the recognizable
// government form, not a redesign. A type appears here ONLY once its replica HTML exists.
// Types NOT listed have no "View original form" button — the modal keeps the scan preview
// (paper) or just the field-diff (online, no replica).
//
// `version` = the edition the replica reproduces (matches the submission's form edition,
// e.g. dcy v6). When a second edition ships, key the map by version and pick the one that
// matches the submission's form_version / form_data.<type>_version.

export type OriginalReplica = { url: string; title: string; version: string }

const REPLICAS: Record<string, OriginalReplica> = {
  dcy_01234: { url: '/forms/DCY_01234_v6_original.html', title: 'DCY 01234 — Child Enrollment & Health', version: 'v6' },
}

/** True when a local read-only replica exists for this submission type. */
export function hasOriginalReplica(submissionType: string | null | undefined): boolean {
  return !!submissionType && submissionType in REPLICAS
}

/** The replica descriptor for this submission type, or null. */
export function originalReplica(submissionType: string | null | undefined): OriginalReplica | null {
  if (!submissionType) return null
  return REPLICAS[submissionType] ?? null
}
