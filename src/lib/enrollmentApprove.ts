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

// Build the roster patch for a CACFP submission. `dateIn` is the director's
// optional Date In from the review panel.
export function buildCacfpPatch(fd: any, dateIn?: string | null): RosterPatch {
  const { first, last, rosterChildName } = splitChildName(fd?.child_name)
  const m = fd?.mailing ?? {}
  const addr = [m.street, [m.city, m.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ')
  const patch: RosterPatch = { child_name: rosterChildName }
  if (first) patch.first_name = first
  if (last) patch.last_name = last
  if (!blank(fd?.birthdate)) patch.birthday = String(fd.birthdate).slice(0, 10)
  if (addr) patch.child_address = addr
  if (!blank(dateIn)) patch.date_in = String(dateIn).slice(0, 10)
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

// frp_expires: the paper's stated expiration if present, else the CACFP default
// of determinationDate + 12 months. determinationDate is ISO 'YYYY-MM-DD'.
export function frpExpiryDefault(determinationDate: string, paperExpiration: string | null | undefined): string {
  if (!blank(paperExpiration)) return isoDate(paperExpiration)
  const d = new Date(`${determinationDate}T00:00:00Z`)
  d.setUTCFullYear(d.getUTCFullYear() + 1)
  return d.toISOString().slice(0, 10)
}

// ─── duplicate / child matching ──────────────────────────────────────────────
export type RosterLite = { id: string; first_name: string | null; last_name: string | null; child_name: string | null; birthday: string | null; is_active: boolean }

// Gate detector (enrollment dup prevention): load the WHOLE center roster,
// including inactive/departed children, so matchRoster can surface a returning
// child at review time and the reviewer reactivates instead of creating a
// duplicate skeleton. Active first so exact live matches sort ahead of inactive.
export async function loadCenterRoster(centerId: string): Promise<RosterLite[]> {
  const { data } = await S().from('roster')
    .select('id,first_name,last_name,child_name,birthday,is_active')
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

// ─── CACFP: insert a new roster child ────────────────────────────────────────
export async function approveCacfpInsert(
  sub: { id: string; org_id: string; center_id: string; child_id: string | null },
  patch: RosterPatch, reviewerId: string, paperSigned: boolean,
): Promise<ApproveResult> {
  const { data, error } = await S().from('roster')
    .insert({ org_id: sub.org_id, center_id: sub.center_id, is_active: true, ...patch })
    .select('id').single()
  if (error) throw error
  const rosterId = (data as any).id as string
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
  // Reactivating a departed match: flip is_active back on in the same write, and
  // capture it in `cols` so undo restores the prior (inactive) state.
  const effPatch: RosterPatch = reactivate ? { ...patch, is_active: true } : patch
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

export async function approveIea(
  sub: { id: string; child_id: string | null; org_id: string; center_id: string },
  det: IeaDetermination,
  matchedIds: string[], reviewerId: string, paperSigned: boolean,
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

  await markApproved(sub.id, null, reviewerId, paperSigned)
  return {
    message: `Approved — FRP ${det.frp} (${det.fiscal_year}) applied to ${matchedIds.length} child${matchedIds.length > 1 ? 'ren' : ''}`,
    undo: async () => {
      for (const u of ieUndo) await u()
      for (const id of matchedIds) await S().from('roster').update(prevRoster.get(id) ?? { frp: null, frp_expires: null }).eq('id', id)
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
