// originalFormReplicas.ts — which submission types have a LOCAL read-only "original form"
// replica in public/forms/ that the Approve modal can render (Step 1).
//
// The map is intentionally tiny and explicit: a type appears here ONLY once its replica
// HTML exists and has been checked. Types NOT listed have no "View original form" button —
// the modal keeps showing the scan preview (paper) or just the field-diff (online, no replica).
// Growing coverage = add one entry + one public/forms/*.html file.

export type OriginalReplica = { url: string; title: string }

const REPLICAS: Record<string, OriginalReplica> = {
  dcy_01234: { url: '/forms/DCY_01234_original.html', title: 'DCY 01234 — Child Enrollment & Health' },
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
