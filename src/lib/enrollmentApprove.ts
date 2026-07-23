// ============================================================
// enrollmentApprove.ts — Approve/Reject writes for the Director's Inbox
// (Phase 1 slice C). Approve v1 is ROSTER-ONLY (confirmed): guardians /
// child_guardian / income_eligibility are Phase 2/4.
//
// CACFP → roster: child_name split (last word = last_name, rest = first_name),
//   roster.child_name written canonical "Last First"; birthday, child_address
//   ("street, city ZIP"), optional director-entered date_in.
// IEA → roster: FRP from the Sponsor Section checkboxes (center certification,
//   authoritative); helper.verdict only as a flagged fallback. frp_expires from
//   sponsor.expiration. Applied to every children[] entry matched in the roster.
//
// Every write returns an `undo` closure that fully reverts it (deletes the
// inserted row / restores prior column values) and returns the submission to
// pending — powering the "Approved · Undo" 10s toast.
// ============================================================

import { supabase } from './supabase'

const S = () => supabase.schema('menumaker')
const blank = (v: any) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '')
const nowIso = () => new Date().toISOString()

export const normName = (s: any): string =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

// ─── name split (confirmed: "First Last" → last word = last_name) ────────────
export function splitChildName(full: any): { first: string; last: string; rosterChildName: string } {
  const parts = String(full ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { first: '', last: '', rosterChildName: '' }
  if (parts.length === 1) return { first: parts[0], last: '', rosterChildName: parts[0] }
  const last = parts[parts.length - 1]
  const first = parts.slice(0, -1).join(' ')
  return { first, last, rosterChildName: `${last} ${first}` }  // canonical roster order
}

export type RosterPatch = Record<string, any>

// ─── schedule: CACFP form → roster ───────────────────────────────────────────
// The CACFP form is the ONLY place a parent states days and hours of care, and
// roster.sched_* is what the Weekly Attendance Report prints. Porting it on
// Approve is what keeps a director from retyping it.
//
// This port REFUSES far more than it accepts, on purpose. The roster model
// (Nikolay's order) is one arrival + one departure + a Mon–Fri bitmask; the form
// is richer, and the OLD form took times as FREE TEXT. Measured across the live
// submissions carrying a schedule: `10`/`5`, `6:30`/`6:00`, `6:45`/`15:30`,
// `8:00`/`4:00pm`, and one in-care day with both times empty. A departure of
// "6:00" means 18:00 — a parser that reads it as 06:00 sends the child home
// before they arrived and prints that on an attendance sheet.
//
// So: accept only what is unambiguous, refuse the rest to a human (the rule is
// «при любой неоднозначности — человек»), and never guess a meridiem. The
// current form (registry `enroll` v9) emits `8:00 am` / `5:30 pm` for 100% of
// values, so the honest path is fix-forward: new submissions port cleanly, the
// free-text history stays where it is. Back-filling it would also overwrite the
// authoritative CSV import (20260716c) with guesses.
const DAY_BIT: Record<string, number> = { mon: 1, tue: 2, wed: 4, thu: 8, fri: 16 }

/** Parse a form time. Requires an EXPLICIT meridiem — `8:00 am`, `4:30 PM`.
 *  Anything else (bare `9`, `17:30`, `6:00`) is refused rather than guessed. */
export function parseFormTime(v: any): string | null {
  const m = String(v ?? '').trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/)
  if (!m) return null
  let h = Number(m[1])
  const min = m[2] ?? '00'
  if (h < 1 || h > 12) return null
  if (m[3] === 'pm' && h !== 12) h += 12
  if (m[3] === 'am' && h === 12) h = 0
  return `${String(h).padStart(2, '0')}:${min}`
}

export type SchedulePort =
  | { ok: true; sched_days: number; sched_in: string; sched_out: string }
  | { ok: false; reason: string }

/** The date the form speaks for: the parent's signature, else when it arrived. */
export function formAsOf(sub: { signature_date?: string | null; created_at?: string | null }): string | null {
  const d = sub?.signature_date ?? sub?.created_at
  return blank(d) ? null : String(d).slice(0, 10)
}

/** Recency rule (Nikolay, 2026-07-16): on disagreement the LATER date wins.
 *  The roster's schedule carries its own `sched_updated_at`; a form older than
 *  it is a statement that has already been superseded — by the owner's CSV, or
 *  by a director who edited the child since. Equal dates go to the form: it is
 *  the signed document. Forms stay editable, so a correction re-dates itself. */
export function scheduleIsStale(formDate: string | null, rosterUpdatedAt: any): boolean {
  if (blank(rosterUpdatedAt)) return false     // roster has no schedule → nothing to lose
  if (!formDate) return true                   // undated form never beats a dated roster
  return String(rosterUpdatedAt).slice(0, 10) > formDate
}

export function buildSchedulePort(fd: any): SchedulePort {
  const sch = fd?.schedule
  if (!sch || typeof sch !== 'object' || Array.isArray(sch)) return { ok: false, reason: 'no schedule on the form' }

  // Day keys arrive as `mon` (current form) or `Mon` (older submissions).
  const inCare = Object.entries(sch as Record<string, any>)
    .map(([k, v]) => [k.toLowerCase(), v] as const)
    .filter(([, v]) => v && v.in_care === true)
  if (inCare.length === 0) return { ok: false, reason: 'no days marked in care' }

  // The mask is Mon–Fri (CHECK 1..31). A weekend child is not representable —
  // refuse rather than silently drop the day.
  const weekend = inCare.filter(([d]) => d === 'sat' || d === 'sun').map(([d]) => d)
  if (weekend.length) return { ok: false, reason: `in care on ${weekend.join('/')} — the roster schedule is Mon–Fri only` }
  const unknown = inCare.filter(([d]) => !(d in DAY_BIT)).map(([d]) => d)
  if (unknown.length) return { ok: false, reason: `unrecognized day: ${unknown.join(', ')}` }

  // The roster holds ONE arrival/departure. A split day (arr2/dep2) or times
  // that differ by day cannot be stored without losing the difference.
  if (inCare.some(([, v]) => String(v.arr2 ?? '').trim() || String(v.dep2 ?? '').trim()))
    return { ok: false, reason: 'a split day (second drop-off/pick-up) — the roster holds one pair of times' }

  const arrs = new Set(inCare.map(([, v]) => String(v.arr1 ?? '').trim()))
  const deps = new Set(inCare.map(([, v]) => String(v.dep1 ?? '').trim()))
  if (arrs.size > 1 || deps.size > 1) return { ok: false, reason: 'times differ by day — the roster holds one pair of times' }

  const sched_in = parseFormTime([...arrs][0])
  const sched_out = parseFormTime([...deps][0])
  if (!sched_in || !sched_out)
    return { ok: false, reason: `times are not stated unambiguously ("${[...arrs][0]}" → "${[...deps][0]}") — am/pm required` }
  if (sched_out <= sched_in) return { ok: false, reason: `departure ${sched_out} is not after arrival ${sched_in}` }

  return { ok: true, sched_days: inCare.reduce((m, [d]) => m | DAY_BIT[d], 0), sched_in, sched_out }
}

// What Approve will do with the form's days/hours — one answer, used by both the
// patch and the panel, so the screen cannot promise what the write won't do.
export type ScheduleDecision =
  | { write: true; sched_days: number; sched_in: string; sched_out: string }
  | { write: false; reason: string }

export function decideSchedule(
  fd: any,
  formDate: string | null,
  existing?: { sched_updated_at?: any; sched_in?: any; sched_out?: any } | null,
): ScheduleDecision {
  const port = buildSchedulePort(fd)
  if (!port.ok) return { write: false, reason: port.reason }
  if (scheduleIsStale(formDate, existing?.sched_updated_at)) {
    const cur = `${String(existing?.sched_in ?? '').slice(0, 5)}–${String(existing?.sched_out ?? '').slice(0, 5)}`
    return { write: false, reason: `the roster’s schedule (${cur}) was set later than this form — the later date wins` }
  }
  return { write: true, sched_days: port.sched_days, sched_in: port.sched_in, sched_out: port.sched_out }
}

// Build the roster patch for a CACFP submission. `dateIn` is the director's
// optional Date In from the review panel. `opts.formDate` + `opts.existing` feed
// the recency rule; omit them and the schedule ports whenever it parses (correct
// for a NEW child, who has no roster schedule to lose).
export function buildCacfpPatch(
  fd: any, dateIn?: string | null,
  opts?: { formDate?: string | null; existing?: { sched_updated_at?: any; sched_in?: any; sched_out?: any } | null },
): RosterPatch {
  // Name (2026-07-23, ratified "First Last"): first_name/last_name are the source
  // of truth; child_name is a DERIVED display string = `${first} ${last}`. When the
  // form states BOTH first_name and last_name explicitly (every manual/online
  // submission does), use them VERBATIM — re-splitting the combined child_name
  // string mis-parses a two-word first name and swaps a correctly-entered pair
  // (the observed bug: Yuri James → first "James", last "Yuri"). Only fall back to
  // splitChildName when the form carries the combined string alone (paper/OCR).
  const split = splitChildName(fd?.child_name)
  const hasExplicit = !blank(fd?.first_name) && !blank(fd?.last_name)
  const first = hasExplicit ? String(fd.first_name).trim() : split.first
  const last = hasExplicit ? String(fd.last_name).trim() : split.last
  const m = fd?.mailing ?? {}
  const addr = [m.street, [m.city, m.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ')
  const patch: RosterPatch = { child_name: `${first} ${last}`.trim() }  // First Last (ratified)
  if (first) patch.first_name = first
  if (last) patch.last_name = last
  if (!blank(fd?.birthdate)) patch.birthday = String(fd.birthdate).slice(0, 10)
  if (addr) patch.child_address = addr
  // Date In: reviewer's field wins; else fall back to the form's own date_in
  // (manual entry carries it) so the child is active on the intended start.
  const di = !blank(dateIn) ? dateIn : fd?.date_in
  if (!blank(di)) patch.date_in = String(di).slice(0, 10)
  // Manual entry carries classroom + FRP so the approved child lands in a
  // classroom (visible in the meal grid) with the director-set status. Parent
  // submissions omit these → behaviour unchanged.
  if (!blank(fd?.classroom_id)) patch.classroom_id = fd.classroom_id
  if (!blank(fd?.frp)) patch.frp = fd.frp
  // Days and hours of care, when the form states them unambiguously. A refusal
  // leaves the roster's schedule untouched — an existing one (the CSV import,
  // or the director's own edit) is never overwritten by a partial read, and a
  // missing one keeps printing an empty Hours cell, which the blank already
  // counts out loud ("3 of 10 children have no schedule on file").
  const d = decideSchedule(fd, opts?.formDate ?? null, opts?.existing ?? null)
  if (d.write) {
    patch.sched_days = d.sched_days
    patch.sched_in = d.sched_in
    patch.sched_out = d.sched_out
    patch.sched_source = 'enrollment_form'
    patch.sched_updated_at = nowIso()
  }
  return patch
}

// FRP determination for an IEA submission.
export function buildIeaFrp(fd: any): { frp: string | null; source: 'sponsor' | 'helper' | null; frp_expires: string | null } {
  const sp = fd?.sponsor ?? {}
  let frp: string | null = null
  let source: 'sponsor' | 'helper' | null = null
  if (sp.free) { frp = 'F'; source = 'sponsor' }
  else if (sp.reduced) { frp = 'R'; source = 'sponsor' }
  else if (sp.paid) { frp = 'P'; source = 'sponsor' }
  else {
    const v = String(fd?.helper?.verdict ?? '').toLowerCase()
    const map: Record<string, string> = { free: 'F', reduced: 'R', paid: 'P' }
    if (map[v]) { frp = map[v]; source = 'helper' }
  }
  const frp_expires = !blank(sp.expiration) ? String(sp.expiration).slice(0, 10) : null
  return { frp, source, frp_expires }
}

// Normalize a date string to ISO 'YYYY-MM-DD'. Paper/OCR forms carry US
// 'M/D/YYYY' (e.g. "7/31/2027"); embed forms carry ISO already.
export function isoDate(v: any): string {
  const s = String(v ?? '').trim()
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (us) return `${us[3]}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}`
  return s.slice(0, 10)
}

// Fiscal year for an IEA determination comes from the FORM EDITION, never date
// math (source of truth = the registry blank). Embed submissions carry
// form_data.type = 'iea_fy2026_27'; scanned-paper submissions don't, so the
// caller passes the registry's current edition URL (…/IEA_FY2026-27_v5.html).
// Both encode the same FY token → 'FY2026-27'.
export function parseIeaFiscalYear(source: any): string | null {
  const m = String(source ?? '').match(/fy_?(\d{4})[_-](\d{2})/i)
  return m ? `FY${m[1]}-${m[2]}` : null
}

// frp_expires: the paper/form's stated expiration if present (it wins — the v6 form
// computes it from the signature date, to end of month), else the CACFP default.
// Official rule: valid until the LAST DAY of the month one year after the base date —
// which the caller passes as the household SIGNATURE date (formAsOf), NOT the Approve
// date. setUTCMonth(m+13, 0) = day 0 of month+13 = last day of month+12.
// determinationDate is ISO 'YYYY-MM-DD'.
export function frpExpiryDefault(determinationDate: string, paperExpiration: string | null | undefined): string {
  if (!blank(paperExpiration)) return isoDate(paperExpiration)
  const d = new Date(`${determinationDate}T00:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() + 13, 0)
  return d.toISOString().slice(0, 10)
}

// ─── duplicate / child matching ──────────────────────────────────────────────
export type RosterLite = {
  id: string; first_name: string | null; last_name: string | null; child_name: string | null
  birthday: string | null; is_active: boolean
  // Carried so the recency rule can be decided for a MATCHED child too — the
  // review panel resolves ctx only for an already-linked child.
  sched_updated_at?: string | null; sched_in?: string | null; sched_out?: string | null
}

// Gate detector (enrollment dup prevention): load the WHOLE center roster,
// including inactive/departed children, so matchRoster can surface a returning
// child at review time and the reviewer reactivates instead of creating a
// duplicate skeleton. Active first so exact live matches sort ahead of inactive.
export async function loadCenterRoster(centerId: string): Promise<RosterLite[]> {
  const { data } = await S().from('roster')
    .select('id,first_name,last_name,child_name,birthday,is_active,sched_updated_at,sched_in,sched_out')
    .eq('center_id', centerId)
    .order('is_active', { ascending: false })
  return (data ?? []) as RosterLite[]
}

// Bounded Levenshtein for soft name matching (import typos / spelling variants
// like Talylah↔Talulah).
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

/** Match a {name, dob} against roster candidates. A candidate matches on an
 *  EXACT normalized-name hit (either order / stored child_name), or — to catch
 *  import typos and returning children — a SOFT name hit (small edit distance)
 *  corroborated by an equal DOB. A conflicting DOB always rules a candidate out.
 *  Candidates may be inactive (loadCenterRoster no longer filters); the caller
 *  reactivates a chosen inactive match rather than inserting a duplicate. */
export function matchRoster(candidates: RosterLite[], name: any, dob?: any): RosterLite[] {
  const target = normName(name)
  if (!target) return []
  const d = dob ? String(dob).slice(0, 10) : ''
  return candidates.filter(c => {
    const forms = [
      normName(`${c.first_name ?? ''} ${c.last_name ?? ''}`),
      normName(`${c.last_name ?? ''} ${c.first_name ?? ''}`),
      normName(c.child_name ?? ''),
    ].filter(Boolean)
    const cd = c.birthday ? String(c.birthday).slice(0, 10) : ''
    if (d && cd && d !== cd) return false            // conflicting DOB → different child
    if (forms.some(f => f === target)) return true   // exact name (DOB equal or unknown)
    // Soft (fuzzy) name — only when DOB corroborates, to avoid false positives.
    if (d && cd && d === cd) {
      const tol = target.length <= 6 ? 1 : 2
      return forms.some(f => lev(f, target) <= tol)
    }
    return false
  })
}

// ─── shared submission-status writes ─────────────────────────────────────────
export interface ApproveResult { message: string; undo: () => Promise<void> }

async function markApproved(subId: string, childId: string | null, reviewerId: string, paperSigned: boolean) {
  await S().from('enrollment_submissions').update({
    status: 'approved', child_id: childId, reviewed_by: reviewerId, reviewed_at: nowIso(),
    ...(paperSigned ? { paper_signed_at: nowIso(), paper_signed_by: reviewerId } : {}),
  }).eq('id', subId)
}

async function restorePending(subId: string, childId: string | null) {
  await S().from('enrollment_submissions').update({
    status: 'pending', child_id: childId, reviewed_by: null, reviewed_at: null,
    paper_signed_at: null, paper_signed_by: null,
  }).eq('id', subId)
}

// ─── roster: insert a new active child ───────────────────────────────────────
// The one place a brand-new roster row is created from an approval flow. Shared by
// the CACFP Approve path (approveCacfpInsert) and the document-review "create child
// from this form" action (EnrollmentReviewModal), so both stamp org_id/center_id +
// is_active identically. Returns the new roster id; the caller decides what to do
// next (mark the submission approved, link the document, etc.).
export async function insertRosterChild(
  sub: { org_id: string; center_id: string },
  patch: RosterPatch,
): Promise<string> {
  const { data, error } = await S().from('roster')
    .insert({ org_id: sub.org_id, center_id: sub.center_id, is_active: true, ...patch })
    .select('id').single()
  if (error) throw error
  return (data as any).id as string
}

// ─── CACFP: insert a new roster child ────────────────────────────────────────
export async function approveCacfpInsert(
  sub: { id: string; org_id: string; center_id: string; child_id: string | null },
  patch: RosterPatch, reviewerId: string, paperSigned: boolean,
): Promise<ApproveResult> {
  const rosterId = await insertRosterChild(sub, patch)
  await markApproved(sub.id, rosterId, reviewerId, paperSigned)
  return {
    message: `Approved — ${patch.child_name} added to roster`,
    undo: async () => {
      await S().from('roster').delete().eq('id', rosterId)
      await restorePending(sub.id, sub.child_id)
    },
  }
}

// ─── CACFP / matched: update an existing roster child ────────────────────────
export async function approveCacfpUpdate(
  sub: { id: string; child_id: string | null }, rosterId: string,
  patch: RosterPatch, reviewerId: string, paperSigned: boolean,
  reactivate = false,
): Promise<ApproveResult> {
  // Claim-bridge protection (invariant until Oct 1): child_name is the identity
  // key into meal_week_records (cellKey = classroom_id|child_name|monday_date|col).
  // On an EXISTING child we must NEVER rewrite it, or its already-written meal rows
  // desync. Strip it here — birthday/classroom/frp/schedule still update. (The
  // INSERT path keeps First-Last child_name; a brand-new child has no meal rows.)
  const { child_name: _cn, ...rest } = patch
  // Reactivating a departed match: flip is_active back on in the same write, and
  // capture it in `cols` so undo restores the prior (inactive) state.
  const effPatch: RosterPatch = reactivate ? { ...rest, is_active: true } : rest
  const cols = Object.keys(effPatch)
  const { data: prev } = await S().from('roster').select(['id', ...cols].join(',')).eq('id', rosterId).single()
  const { error } = await S().from('roster').update(effPatch).eq('id', rosterId)
  if (error) throw error
  await markApproved(sub.id, rosterId, reviewerId, paperSigned)
  return {
    message: `Approved — ${reactivate ? 'reactivated' : 'updated'} ${patch.child_name ?? 'child'}`,
    undo: async () => {
      const revert: RosterPatch = {}
      for (const c of cols) revert[c] = (prev as any)?.[c] ?? null
      await S().from('roster').update(revert).eq('id', rosterId)
      await restorePending(sub.id, sub.child_id)
    },
  }
}

// ─── IEA: apply FRP to every matched child ───────────────────────────────────
// The director-confirmed determination (F/R/P + expiry + form-edition fiscal
// year + who/when). eligibility_source: 'ocr_sponsor' | 'ocr_helper' | 'manual'.
export interface IeaDetermination {
  frp: string
  frp_expires: string | null
  fiscal_year: string           // from the form edition, e.g. 'FY2026-27'
  eligibility_source: string
  determined_by: string         // reviewer auth uid
  determined_by_name: string    // human-readable director name (signature)
}

const IE_SNAP = 'id,eligibility,frp_expires,eligibility_source,determined_by,determined_by_name,determined_at,determination_log'

// Write/append ONE child's F/R/P determination to the authoritative
// income_eligibility fiscal-year record (select-then-update/insert; there is no
// unique key), with who/when + an append-only determination_log entry. Returns
// an undo that reverts exactly this write. Shared by the IEA approve flow
// (Layer 1) and profile late-corrections (Layer 2). `ieSource` is the row's
// `source` column ('iea_review' | 'profile_edit'); eligibility_source is how the
// value was set ('ocr_sponsor' | 'ocr_helper' | 'manual').
export interface DeterminationInput {
  roster_id: string; org_id: string; center_id: string
  frp: string; frp_expires: string | null; fiscal_year: string
  eligibility_source: string; determined_by: string; determined_by_name: string
  ieSource?: string; at?: string
}

export async function recordDetermination(p: DeterminationInput): Promise<() => Promise<void>> {
  const at = p.at ?? nowIso()
  const entry = (from: any) => ({ at, by: p.determined_by, by_name: p.determined_by_name, from: from ?? null, to: p.frp, source: p.eligibility_source })
  const { data: existing } = await S().from('income_eligibility').select(IE_SNAP)
    .eq('roster_id', p.roster_id).eq('fiscal_year', p.fiscal_year)
    .order('updated_at', { ascending: false }).limit(1).maybeSingle()
  if (existing?.id) {
    const prev: any = { ...existing }
    const log = Array.isArray(existing.determination_log) ? existing.determination_log : []
    const { error } = await S().from('income_eligibility').update({
      eligibility: p.frp, frp_expires: p.frp_expires, eligibility_source: p.eligibility_source,
      determined_by: p.determined_by, determined_by_name: p.determined_by_name, determined_at: at,
      determination_log: [...log, entry(existing.eligibility)], updated_at: at,
    }).eq('id', existing.id)
    if (error) throw error
    return async () => {
      await S().from('income_eligibility').update({
        eligibility: prev.eligibility, frp_expires: prev.frp_expires, eligibility_source: prev.eligibility_source,
        determined_by: prev.determined_by, determined_by_name: prev.determined_by_name,
        determined_at: prev.determined_at, determination_log: prev.determination_log,
      }).eq('id', prev.id)
    }
  }
  const { data: ins, error } = await S().from('income_eligibility').insert({
    org_id: p.org_id, center_id: p.center_id, roster_id: p.roster_id, fiscal_year: p.fiscal_year,
    eligibility: p.frp, frp_expires: p.frp_expires, eligibility_source: p.eligibility_source,
    determined_by: p.determined_by, determined_by_name: p.determined_by_name, determined_at: at,
    determination_log: [entry(null)], source: p.ieSource ?? 'iea_review',
  }).select('id').single()
  if (error) throw error
  const newId = (ins as any).id as string
  return async () => { await S().from('income_eligibility').delete().eq('id', newId) }
}

/** Whether IEA Approve is blocked. Canon (Nikolay 2026-07-22): the FORM validates
 *  itself at submission — the app never re-checks or re-states the form's rules, and
 *  validateIea findings NEVER gate Approve (they render as informational warnings).
 *  The determination is the General Director's call, final for 12 months. Only the
 *  STRUCTURAL gates remain: a determination needs an F/R/P choice, a resolved fiscal
 *  year (to write the right FY record), and at least one matched roster child (record
 *  addressing — where the eligibility is written — not a re-check of the form). */
export function ieaApproveBlocked(opts: {
  frpChosen: boolean; fiscalYearResolved: boolean; matchedCount: number
}): boolean {
  return !opts.frpChosen || !opts.fiscalYearResolved || opts.matchedCount === 0
}

/** The signatures patch to write for the GD's IEA countersignature, or null when
 *  nothing should change. Variant 1 amended (Nikolay 2026-07-22): the determination's
 *  AUTHORITY is the Approve under auth.uid (income_eligibility.determined_by); the
 *  slot image is secondary. So a sponsor_sig the storefront form already submitted
 *  ("Sponsor Use Only") is NEVER overwritten and NEVER blocks — we only stamp an
 *  EMPTY slot. The applicant's own signature (key `adult_sig` on IEA) is preserved by
 *  the merge and never rewritten. Pure so the posture is unit-tested without the DB. */
export function ieaCountersignPatch(
  before: Record<string, any>, slot: string, image: string | null,
): Record<string, any> | null {
  if (before[slot]) return null           // form (or a prior Approve) already signed → keep it
  if (!image) return null                 // empty slot, nothing to stamp (signature is optional)
  return { ...before, [slot]: image }
}

export async function approveIea(
  sub: { id: string; child_id: string | null; org_id: string; center_id: string },
  det: IeaDetermination,
  matchedIds: string[], reviewerId: string, paperSigned: boolean,
  // The General Director's own sponsor_sig countersignature (Ф2, кусок 2). Optional
  // so the existing shape (and tests) keep working; when present it is written into
  // enrollment_submissions.signatures[slot], merge-not-replace, and undone exactly.
  countersign?: Countersign | null,
): Promise<ApproveResult> {
  if (matchedIds.length === 0) throw new Error('No matched roster children to apply eligibility to')
  if (!det.fiscal_year) throw new Error('Could not resolve the IEA form edition / fiscal year')
  const at = nowIso()

  // 1) roster.frp / frp_expires — the current effective value the claim RPC reads.
  const { data: prevRows } = await S().from('roster').select('id,frp,frp_expires').in('id', matchedIds)
  const prevRoster = new Map((prevRows ?? []).map((r: any) => [r.id, { frp: r.frp, frp_expires: r.frp_expires }]))
  const { error: rErr } = await S().from('roster').update({ frp: det.frp, frp_expires: det.frp_expires }).in('id', matchedIds)
  if (rErr) throw rErr

  // 2) income_eligibility — the authoritative FY determination record, one per
  // child for det.fiscal_year (NEW row; prior-cycle FYs are left untouched as
  // history), via the shared recordDetermination helper.
  const ieUndo: Array<() => Promise<void>> = []
  try {
    for (const rid of matchedIds) {
      ieUndo.push(await recordDetermination({
        roster_id: rid, org_id: sub.org_id, center_id: sub.center_id,
        frp: det.frp, frp_expires: det.frp_expires, fiscal_year: det.fiscal_year,
        eligibility_source: det.eligibility_source, determined_by: reviewerId,
        determined_by_name: det.determined_by_name, ieSource: 'iea_review', at,
      }))
    }
  } catch (e) {
    // Roll the income_eligibility writes back on partial failure, then restore
    // roster, so a mid-loop error doesn't leave a half-applied determination.
    for (const u of ieUndo) await u().catch(() => {})
    for (const id of matchedIds) await S().from('roster').update(prevRoster.get(id) ?? { frp: null, frp_expires: null }).eq('id', id)
    throw e
  }

  // 3) sponsor_sig — the General Director's countersignature (secondary; see
  // ieaCountersignPatch). Only an EMPTY slot is stamped; a form-submitted sponsor_sig
  // is kept, never overwritten, and never blocks. The applicant's `adult_sig` is
  // preserved by the merge. Snapshot the prior block so undo restores it. Written
  // BEFORE markApproved so a failure rolls step 1+2 back and leaves the row pending.
  let prevSignatures: Record<string, any> | null = null
  if (countersign) {
    if (!countersign.image?.startsWith('data:image/')) throw new Error('The countersignature must be an image')
    const { data: prevSig } = await S().from('enrollment_submissions').select('signatures').eq('id', sub.id).single()
    const before = ((prevSig as any)?.signatures ?? {}) as Record<string, any>
    const patch = ieaCountersignPatch(before, countersign.slot, countersign.image)
    if (patch) {   // empty slot → stamp; already signed (form or prior) → keep, write nothing
      prevSignatures = before
      const { error: sErr } = await S().from('enrollment_submissions')
        .update({ signatures: patch }).eq('id', sub.id)
      if (sErr) {
        for (const u of ieUndo) await u().catch(() => {})
        for (const id of matchedIds) await S().from('roster').update(prevRoster.get(id) ?? { frp: null, frp_expires: null }).eq('id', id)
        throw sErr
      }
    }
  }

  await markApproved(sub.id, null, reviewerId, paperSigned)
  return {
    message: `Approved — FRP ${det.frp} (${det.fiscal_year}) applied to ${matchedIds.length} child${matchedIds.length > 1 ? 'ren' : ''}`
      + (countersign ? `, countersigned by ${countersign.signedName}` : ''),
    undo: async () => {
      for (const u of ieUndo) await u()
      for (const id of matchedIds) await S().from('roster').update(prevRoster.get(id) ?? { frp: null, frp_expires: null }).eq('id', id)
      if (prevSignatures !== null) await S().from('enrollment_submissions').update({ signatures: prevSignatures }).eq('id', sub.id)
      await restorePending(sub.id, sub.child_id)
    },
  }
}

// ─── Reject ──────────────────────────────────────────────────────────────────
export async function rejectSubmission(
  sub: { id: string; child_id: string | null }, reason: string, reviewerId: string,
): Promise<ApproveResult> {
  const { error } = await S().from('enrollment_submissions')
    .update({ status: 'rejected', reject_reason: reason, reviewed_by: reviewerId, reviewed_at: nowIso() })
    .eq('id', sub.id)
  if (error) throw error
  return {
    message: 'Rejected',
    undo: async () => {
      await S().from('enrollment_submissions')
        .update({ status: 'pending', reject_reason: null, reviewed_by: null, reviewed_at: null })
        .eq('id', sub.id)
    },
  }
}

// ─── documents: approve a form that does not write the roster ────────────────
// Consent, DCY 01234, Release Auth, Parents Book ack… Until now the panel threw
// «This submission type cannot be approved yet» on every one of them: it knew
// only CACFP and IEA. Izabella's consent and DCY 01234 have sat pending since
// 15.07 for exactly that reason — the online path works right up to the Inbox
// and stops there.
//
// Approving a document files it: it is linked to a child and marked approved.
// Nothing is written to the roster — that stays the CACFP/IEA path («ничего не
// пишется в roster до Approve» concerns the roster; a document is not one).
//
// The countersignature is ADDED to the signature block, never a rewrite of what
// the parent signed: we merge into `signatures`, keeping every existing key. A
// signed record is never rewritten (platform-standards) — and a countersignature
// is not an edit of the parent's statement, it is the director's own, in the
// slot the form already declares for it.

export interface Countersign {
  /** The slot the FORM declares — measured, never invented. See countersignSlot(). */
  slot: string
  image: string
  signedBy: string
  signedName: string
}

export async function approveDocument(
  sub: { id: string; child_id: string | null; submission_type: string },
  childId: string | null,
  reviewerId: string,
  paperSigned: boolean,
  countersign?: Countersign | null,
): Promise<ApproveResult> {
  // Snapshot what we are about to touch, so undo restores it exactly — including
  // the signature block, which must come back byte-for-byte.
  const { data: prev, error: readErr } = await S().from('enrollment_submissions')
    .select('signatures,status,child_id,reviewed_by,reviewed_at,paper_signed_at,paper_signed_by')
    .eq('id', sub.id).single()
  if (readErr) throw readErr

  const patch: Record<string, any> = {
    status: 'approved', child_id: childId, reviewed_by: reviewerId, reviewed_at: nowIso(),
    ...(paperSigned ? { paper_signed_at: nowIso(), paper_signed_by: reviewerId } : {}),
  }

  if (countersign) {
    if (!countersign.image?.startsWith('data:image/')) throw new Error('The countersignature must be an image')
    const before = ((prev as any)?.signatures ?? {}) as Record<string, any>
    if (before[countersign.slot]) throw new Error(`This form is already countersigned in ${countersign.slot}`)
    // Merge, never replace: the parent's signature keeps its exact bytes.
    patch.signatures = { ...before, [countersign.slot]: countersign.image }
  }

  const { data, error } = await S().from('enrollment_submissions')
    .update(patch).eq('id', sub.id).select('id')
  if (error) throw error
  if (!data?.length) throw new Error('Nothing was written — the submission was not filed')

  return {
    message: countersign
      ? `Filed and countersigned by ${countersign.signedName}`
      : 'Filed — on file, no action needed',
    undo: async () => {
      await S().from('enrollment_submissions').update({
        signatures: (prev as any)?.signatures ?? {},
        status: (prev as any)?.status ?? 'pending',
        child_id: sub.child_id,
        reviewed_by: (prev as any)?.reviewed_by ?? null,
        reviewed_at: (prev as any)?.reviewed_at ?? null,
        paper_signed_at: (prev as any)?.paper_signed_at ?? null,
        paper_signed_by: (prev as any)?.paper_signed_by ?? null,
      }).eq('id', sub.id)
    },
  }
}

// ─── the registration fee (20260723) ─────────────────────────────────────────
// A FACT the director records by hand — not a payment system, which Nikolay
// froze until the food program is at a working level. On a start_form, no fee =
// ПОТЕНЦИАЛЬНЫЙ: filled packet #1 but never started, so packet #2/#3 is not
// issued. Orthogonal to status: "paid but not yet reviewed" must be expressible.

export async function setFeeReceived(subId: string, received: boolean, by: string): Promise<void> {
  const { data, error } = await S().from('enrollment_submissions')
    .update(received
      ? { fee_received_at: nowIso(), fee_received_by: by }
      : { fee_received_at: null, fee_received_by: null })
    .eq('id', subId).select('id')
  if (error) throw error
  if (!data?.length) throw new Error('Nothing was written — the fee was not recorded')
}

/** A prospect: signed packet #1, the registration fee was never recorded. */
export const isProspect = (sub: { submission_type: string; status: string; fee_received_at?: any }): boolean =>
  (sub.submission_type === 'start_form' || sub.submission_type === 'parent_consent')
  && sub.status === 'pending'
  && blank(sub.fee_received_at)
