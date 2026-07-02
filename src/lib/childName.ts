// ============================================================
// childName.ts — platform standard for CHILD name display & sorting.
//
// NAME FORMAT (CACFP canonical): "Last First" (e.g. "Rodriguez Juan").
//   The DB is correct — first_name / last_name always live in their own
//   columns. The only divergence is DISPLAY ORDER: Brightwheel shows
//   "First Last", CACFP requires "Last First". We fix this at the display
//   layer only; we never rewrite stored data.
//   child_name is a denormalized convenience column and may be a legacy
//   "First Last" join — DO NOT use it for display when structured columns
//   exist. It is used only as a fallback for fiscal rows imported from the
//   Master List, where the single-string name is already "Last First".
//
// SORTING (two contexts — see docs/platform-standards.md):
//   • Enrollment contexts (roster/class lists, ChildSettings pickers, Smart
//     List): alphabetical by last_name, then first_name.
//   • CACFP contexts (meal count pages & portals, milk panel, CACFP reports
//     and printed forms): by age, oldest first (birthday ASC); children with
//     no birthday sort to the end.
// ============================================================

export type ChildNameParts = {
  first_name?: string | null
  last_name?: string | null
  child_name?: string | null
}

/** Canonical child display name: "Last First". Falls back to child_name
 *  (already "Last First" for Master-List fiscal rows) when structured
 *  columns are empty. */
export function displayChildName(c: ChildNameParts): string {
  const last = c.last_name?.trim()
  const first = c.first_name?.trim()
  if (last && first) return `${last} ${first}`
  if (last) return last
  if (first) return first
  return c.child_name?.trim() || '—'
}

/** Enrollment-context comparator: alphabetical by last_name, then first_name. */
export function byEnrollmentName(a: ChildNameParts, b: ChildNameParts): number {
  const la = (a.last_name ?? '').toLowerCase()
  const lb = (b.last_name ?? '').toLowerCase()
  if (la !== lb) return la < lb ? -1 : 1
  const fa = (a.first_name ?? '').toLowerCase()
  const fb = (b.first_name ?? '').toLowerCase()
  return fa < fb ? -1 : fa > fb ? 1 : 0
}

/** CACFP-context comparator: oldest first (birthday ASC); missing birthday last. */
export function byAgeOldestFirst(
  a: { birthday?: string | null },
  b: { birthday?: string | null },
): number {
  if (!a.birthday && !b.birthday) return 0
  if (!a.birthday) return 1
  if (!b.birthday) return -1
  return a.birthday < b.birthday ? -1 : a.birthday > b.birthday ? 1 : 0
}
