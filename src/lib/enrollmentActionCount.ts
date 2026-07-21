// enrollmentActionCount.ts — the ONE source for the Enrollment red badge.
//
// Both People-block badges (Children roster, Staff page) read their number from
// here, so there is a single definition of "actionable" instead of two ad-hoc
// COUNT queries that drift apart. The predicate lives in the DB function
// menumaker.enrollment_action_counts(org, center) — a read-only twin of the
// refresh_renewal_action_items predicate (renewal-contour spec §1.1 / §5.3):
//
//   children = pending, non-staff, AND (needs a director countersign OR not yet
//              matched to a roster child)   — matched-awaiting-autofile is NOT
//              counted; `received` (auto-filed) is NOT counted
//   staff    = pending staff submissions    — the contour does not narrow staff
//
// "Today the number is unchanged": nothing sets child_id on a pending row yet
// (submit_enrollment_form doesn't; autofile is dry-run), so every live pending
// row is child_id-null and the children predicate == "all pending non-staff".
// The narrowing only bites once autofile starts writing child_id.
import { supabase } from '@/lib/supabase'

export type EnrollmentActionCounts = { children: number; staff: number }

/** Actionable pending counts for one centre. Returns zeros on any error — a badge
 *  is a signal, not a gate; a failed count must not throw in a page effect. */
export async function fetchEnrollmentActionCounts(
  orgId: string, centerId: string,
): Promise<EnrollmentActionCounts> {
  const { data, error } = await supabase.schema('menumaker')
    .rpc('enrollment_action_counts', { p_org: orgId, p_center: centerId })
  if (error || !data) return { children: 0, staff: 0 }
  const d = data as { children?: number; staff?: number }
  return { children: d.children ?? 0, staff: d.staff ?? 0 }
}
