// src/lib/childActive.ts
// Single source of truth for "is a child enrolled on day D".
//
// A roster row counts on a given service/report day when it is is_active AND the
// day falls within [date_in, date_out]. date_out is inclusive (the child's last
// day). This mirrors the predicate CenterRosterPage/ChildrenPage already apply
// against "today", generalised to an arbitrary day so meal count and reports can
// honor date_out as defense-in-depth (a child whose date_out is in the past but
// whose is_active was never flipped must not be claimable).

/** ISO `YYYY-MM-DD` for a Date (local-safe: use date-fns format for tz-sensitive spots). */
export const isoDay = (d: Date): string => d.toISOString().slice(0, 10)

/**
 * PostgREST `.or(...)` fragment: "not departed before day D".
 * Use as `query.eq('is_active', true).or(notDepartedBefore(D))`.
 * Keeps rows with no date_out, or date_out on/after D — so a mid-week leaver
 * still shows for their valid days when D is the period's FIRST day (e.g. the
 * week's Monday), while a fully-departed child (date_out < D) is excluded.
 */
export const notDepartedBefore = (isoDate: string): string =>
  `date_out.is.null,date_out.gte.${isoDate}`

/** Client-side mirror of the same predicate. */
export function isActiveOn(
  child: { is_active?: boolean | null; date_in?: string | null; date_out?: string | null },
  isoDate: string,
): boolean {
  if (child.is_active === false) return false
  if (child.date_in && child.date_in.slice(0, 10) > isoDate) return false
  if (child.date_out && child.date_out.slice(0, 10) < isoDate) return false
  return true
}
