// ============================================================
// rosterKey.ts — a stored key is never rebuilt.
//
// `roster.child_name` is not a display string. It is the IDENTITY KEY into
// meal_week_records: cellKey = classroom_id|child_name|monday_date|col
// (see mealMarkQueue.ts). Rewrite it on an existing child and that child's
// already-written meal marks stop matching — the claim-bridge invariant,
// protected until Oct 1.
//
// The defect this closes (Nikolay, 2026-07-28): platform-standards §1 states a
// DISPLAY rule ("Last First"), and two save paths had implemented it as a WRITE
// rule — rebuilding the stored key from first/last on every save, in the
// opposite order to what the approve path writes. Measured before the fix:
// 519 rows "Last First", 96 "First Last", both writers live.
//
// The ruling is not about which order is canonical. It is:
//
//     THE STORED KEY IS NEVER REBUILT. Display order is applied at RENDER.
//
// So this module exists to be *called*, not merely obeyed — a guard, not a
// deleted line. Re-adding `child_name` to one of these patches cannot bring the
// bug back: the wrapper strips it.
//
// INSERT is different and stays as it is: a brand-new child has no meal rows
// yet, so writing the key at birth is safe (and necessary).
// ============================================================

/** Columns that belong to a roster row's identity and are written ONCE, at
 *  insert. Never included in an update of an existing child. */
export const STORED_KEY_COLUMNS = ['child_name'] as const

/** Strip the stored identity key from a patch that updates an EXISTING roster
 *  row. Every other field passes through untouched. */
export function stripStoredKey<T extends Record<string, any>>(patch: T): Record<string, any> {
  const out: Record<string, any> = {}
  for (const [k, v] of Object.entries(patch)) {
    if ((STORED_KEY_COLUMNS as readonly string[]).includes(k)) continue
    out[k] = v
  }
  return out
}
