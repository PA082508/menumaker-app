// ============================================================
// childSearch.ts — shared name-search matching for children, used by EVERY
// child-search surface (Children page roster, ADD CHILD 2.0 router, …).
//
// Two arms, in order of confidence (Erulan case, Nikolay 2026-07-08):
//   1. TOKEN — split the query into tokens; a candidate matches when EVERY token
//      is a substring of some name form, in ANY order. "Erulan Rakhmanov" finds
//      "Rakhmanov Erulan"; "rakh" finds "Rakhmanov"; partials work.
//   2. FUZZY — if no token hit, each query token within a small edit distance of
//      some candidate token counts as a 'similar' match, so typo records
//      (Rackmanov ↔ Rakhmanov) are never invisible. Callers tag these "similar".
// ============================================================

import { normName } from './enrollmentApprove'

export type MatchKind = 'exact' | 'similar' | null

// Bounded Levenshtein (small names — no need to cap early).
function lev(a: string, b: string): number {
  const m = a.length, n = b.length
  if (!m) return n
  if (!n) return m
  let prev = Array.from({ length: n + 1 }, (_, j) => j)
  for (let i = 1; i <= m; i++) {
    const cur = [i]
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = cur
  }
  return prev[n]
}

// All normalized name forms of a candidate (either name order + stored child_name).
export function nameForms(first?: string | null, last?: string | null, childName?: string | null): string[] {
  return [
    normName(`${last ?? ''} ${first ?? ''}`),
    normName(`${first ?? ''} ${last ?? ''}`),
    normName(childName ?? ''),
  ].filter(Boolean)
}

const tokensOf = (s: string): string[] => normName(s).split(' ').filter(Boolean)

// Every query token is a substring of some name form — order-independent.
export function tokenMatch(forms: string[], query: string): boolean {
  const q = normName(query)
  if (!q) return false
  const qt = q.split(' ').filter(Boolean)
  if (!qt.length) return false
  return qt.every(t => forms.some(f => f.includes(t)))
}

// Every query token is close (edit distance) to, or contains/contained-by, some
// candidate token. Tolerant of one/two-character typos per token.
export function fuzzyMatch(forms: string[], query: string): boolean {
  const qt = tokensOf(query)
  if (!qt.length) return false
  const cand = new Set<string>()
  for (const f of forms) for (const t of f.split(' ')) if (t) cand.add(t)
  if (!cand.size) return false
  return qt.every(q => {
    if (q.length < 3) return false            // too short to fuzzy safely
    const tol = q.length <= 5 ? 1 : 2
    for (const c of cand) {
      if (c.includes(q) || q.includes(c)) return true
      if (lev(c, q) <= tol) return true
    }
    return false
  })
}

// Classify a candidate against a query: exact (token) beats similar (fuzzy).
export function classifyMatch(forms: string[], query: string): MatchKind {
  if (tokenMatch(forms, query)) return 'exact'
  if (fuzzyMatch(forms, query)) return 'similar'
  return null
}

// Convenience for a {first_name,last_name,child_name}-shaped record.
export function classifyChild(
  c: { first_name?: string | null; last_name?: string | null; child_name?: string | null },
  query: string,
): MatchKind {
  return classifyMatch(nameForms(c.first_name, c.last_name, c.child_name), query)
}
