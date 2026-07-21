// identity.ts — the pure identity checks the auto-file token path depends on.
//
// ONE source, no Deno/esm.sh imports, so it is both deployed inside the edge
// function (index.ts imports it relatively) AND unit-tested by vitest
// (identity.test.ts, same folder). This is deliberately NOT the copy-paste
// pattern normName/lev still use — a second copy is exactly the kind of drift
// that files a document into the wrong child's record.
//
// §2e-2 (renewal-contour-spec): a prefill token is not one-time and lives ~30
// days, so a valid ?t= link can be forwarded hand to hand. The token alone is
// therefore NOT proof of identity. The DOB the form sends must corroborate the
// roster birthday of the token's child, or the row waits for a person.

/** A calendar date as YYYY-MM-DD, or '' if the value is not a usable date.
 *  Mirrors matchRoster's `String(x).slice(0,10)` so a timestamp and a bare date
 *  compare equal, and anything non-date normalises to '' (never a false match). */
export function normDob(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = String(v).trim()
  // Must START with an ISO date; a timestamp ("2020-03-04T00:00:00Z") slices fine.
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(s)
  if (!m) return ''
  // Reject impossible dates that still match the shape (e.g. 2020-13-40).
  return Number.isNaN(Date.parse(m[1])) ? '' : m[1]
}

/** The prefill token echoed back with a submission, under any of the field names
 *  the form/loader may have used. Null when there is no token (a walk-in). */
export function extractToken(formData: any): string | null {
  const t = formData?.t ?? formData?.issue_token ?? formData?.prefill_token ?? null
  const s = t == null ? '' : String(t).trim()
  return s === '' ? null : s
}

/** The child DOB the parent entered on the form. Same field names the walk-in
 *  path already reads (birthdate / child_dob), plus child_birthday for safety.
 *  Returns '' when absent — which, under the strict rule, means "cannot file". */
export function extractSubmittedDob(formData: any): string {
  return normDob(formData?.birthdate ?? formData?.child_dob ?? formData?.child_birthday)
}

export type DobVerdict = 'match' | 'mismatch' | 'absent'

/** Corroborate the submitted DOB against the token child's roster birthday.
 *
 *  STRICT (Nikolay, confirmed): a missing submitted DOB is 'absent', never a
 *  pass — so a token-bearing row with no DOB is NOT auto-filed even if commit is
 *  on. This is what makes the safeguard an invariant of the code rather than a
 *  promise not to press a button.
 *
 *  A missing roster birthday also cannot corroborate → 'absent' (there is
 *  nothing to check against; a person decides).
 *  Both present and equal → 'match'; both present and different → 'mismatch'. */
export function dobVerdict(submitted: unknown, rosterBirthday: unknown): DobVerdict {
  const s = normDob(submitted)
  const r = normDob(rosterBirthday)
  if (!s || !r) return 'absent'
  return s === r ? 'match' : 'mismatch'
}
