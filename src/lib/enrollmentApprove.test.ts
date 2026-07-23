import { describe, it, expect, vi, beforeEach } from 'vitest'

// Record every roster/enrollment_submissions write so the claim-bridge tests can
// assert exactly what approveCacfpInsert/Update send. A thenable chainable stub
// stands in for the PostgREST builder (works for both `.eq()`-terminated updates
// and `.single()`-terminated inserts/selects).
const h = vi.hoisted(() => ({ calls: [] as { table: string; op: string; payload: any }[] }))
vi.mock('./supabase', () => {
  const makeBuilder = (table: string) => {
    const b: any = {
      _op: null as string | null,
      insert(p: any) { b._op = 'insert'; h.calls.push({ table, op: 'insert', payload: p }); return b },
      update(p: any) { b._op = 'update'; h.calls.push({ table, op: 'update', payload: p }); return b },
      select() { return b }, eq() { return b }, in() { return b },
      order() { return b }, limit() { return b },
      single() { return Promise.resolve({ data: b._op === 'insert' ? { id: 'new-roster-id' } : {}, error: null }) },
      maybeSingle() { return Promise.resolve({ data: null, error: null }) },
      then(res: any, rej: any) { return Promise.resolve({ data: {}, error: null }).then(res, rej) },
    }
    return b
  }
  const from = (table: string) => makeBuilder(table)
  return { supabase: { schema: () => ({ from }), from } }
})

import {
  matchRoster, parseIeaFiscalYear, frpExpiryDefault, isoDate,
  parseFormTime, buildSchedulePort, buildCacfpPatch, decideSchedule, scheduleIsStale, formAsOf,
  ieaCountersignPatch, ieaApproveBlocked, approveCacfpInsert, approveCacfpUpdate,
  type RosterLite,
} from './enrollmentApprove'

const kid = (o: Partial<RosterLite>): RosterLite => ({
  id: o.id ?? 'x', first_name: null, last_name: null, child_name: null,
  birthday: null, is_active: true, ...o,
})

describe('matchRoster — gate detector', () => {
  const talulah = kid({ id: 'k', first_name: 'Talulah', last_name: 'Graves', birthday: '2021-09-29' })

  it('exact name matches', () => {
    expect(matchRoster([talulah], 'Graves Talulah', '2021-09-29').map(m => m.id)).toEqual(['k'])
  })

  it('soft-matches a spelling variant when DOB corroborates', () => {
    // "Talylah" (import typo) vs keeper "Talulah", same DOB → edit distance 1.
    expect(matchRoster([talulah], 'Graves Talylah', '2021-09-29').map(m => m.id)).toEqual(['k'])
  })

  it('does NOT soft-match a spelling variant without a corroborating DOB', () => {
    expect(matchRoster([talulah], 'Graves Talylah', undefined)).toEqual([])
  })

  it('a conflicting DOB rules the candidate out even on an exact name', () => {
    expect(matchRoster([talulah], 'Graves Talulah', '2019-01-01')).toEqual([])
  })

  it('surfaces an INACTIVE (departed) candidate so it can be reactivated', () => {
    const departed = kid({ id: 'dep', first_name: 'Talulah', last_name: 'Graves', birthday: '2021-09-29', is_active: false })
    const hit = matchRoster([departed], 'Graves Talulah', '2021-09-29')
    expect(hit.map(m => m.id)).toEqual(['dep'])
    expect(hit[0].is_active).toBe(false)
  })

  it('does not match an unrelated child', () => {
    expect(matchRoster([talulah], 'Smith John', '2021-09-29')).toEqual([])
  })
})

describe('ieaCountersignPatch — Variant 1 amended: image is secondary, never overwrites the form', () => {
  const GD = 'data:image/png;base64,GDSAMPLE'
  const FORM = 'data:image/png;base64,FORMSPONSOR'

  it('form-WITHOUT sponsor_sig, slot empty → stamps the GD sample', () => {
    const patch = ieaCountersignPatch({ adult_sig: 'data:image/png;base64,PARENT' }, 'sponsor_sig', GD)
    expect(patch).toEqual({ adult_sig: 'data:image/png;base64,PARENT', sponsor_sig: GD })
  })

  it('form-WITH sponsor_sig → kept, never overwritten (returns null = write nothing)', () => {
    const before = { adult_sig: 'data:image/png;base64,PARENT', sponsor_sig: FORM }
    expect(ieaCountersignPatch(before, 'sponsor_sig', GD)).toBeNull()
  })

  it('empty slot but no image (signature is optional) → write nothing', () => {
    expect(ieaCountersignPatch({ adult_sig: 'x' }, 'sponsor_sig', null)).toBeNull()
  })

  it('never mutates the applicant signature key (adult_sig), whichever branch', () => {
    const before = { adult_sig: 'A' }
    const patch = ieaCountersignPatch(before, 'sponsor_sig', GD)
    expect(patch?.adult_sig).toBe('A')     // preserved by the merge
    expect(before).toEqual({ adult_sig: 'A' })  // input not mutated
  })
})

describe('ieaApproveBlocked — canon: form self-validates, only structural gates block', () => {
  const ok = { frpChosen: true, fiscalYearResolved: true, matchedCount: 1 }
  it('foster / incomplete-form (validateIea would red) but determination complete → NOT blocked', () => {
    // The form validated itself at submission; its findings are informational, not a gate.
    expect(ieaApproveBlocked(ok)).toBe(false)
  })
  it('a submission with warnings but a complete determination → NOT blocked (Approve active)', () => {
    expect(ieaApproveBlocked({ ...ok, matchedCount: 3 })).toBe(false)
  })
  it('no F/R/P choice → blocked (the GD must decide)', () => {
    expect(ieaApproveBlocked({ ...ok, frpChosen: false })).toBe(true)
  })
  it('unresolved fiscal year → blocked (cannot write the right FY record)', () => {
    expect(ieaApproveBlocked({ ...ok, fiscalYearResolved: false })).toBe(true)
  })
  it('no matched roster child → structural gate holds', () => {
    expect(ieaApproveBlocked({ ...ok, matchedCount: 0 })).toBe(true)
  })
})

describe('parseIeaFiscalYear — fiscal year from the FORM EDITION (never date math)', () => {
  it('parses the embed form_data.type token', () => {
    expect(parseIeaFiscalYear('iea_fy2026_27')).toBe('FY2026-27')
  })
  it('parses the registry edition URL/filename', () => {
    expect(parseIeaFiscalYear('https://pa082508.github.io/forms/1-data-sources/IEA_FY2026-27_v5.html')).toBe('FY2026-27')
    expect(parseIeaFiscalYear('IEA_FY2027-28_v6.html')).toBe('FY2027-28')
  })
  it('returns null when no FY token is present', () => {
    expect(parseIeaFiscalYear('iea')).toBeNull()
    expect(parseIeaFiscalYear(null)).toBeNull()
    expect(parseIeaFiscalYear(undefined)).toBeNull()
  })
})

describe('isoDate', () => {
  it('normalizes US M/D/YYYY to ISO', () => {
    expect(isoDate('7/31/2027')).toBe('2027-07-31')
    expect(isoDate('12/5/2026')).toBe('2026-12-05')
  })
  it('passes ISO through', () => {
    expect(isoDate('2027-07-31')).toBe('2027-07-31')
  })
})

describe('frpExpiryDefault', () => {
  it('uses the paper expiration when present (normalized to ISO)', () => {
    expect(frpExpiryDefault('2026-07-07', '7/31/2027')).toBe('2027-07-31')
    expect(frpExpiryDefault('2026-07-07', '2027-07-31')).toBe('2027-07-31')
  })
  it('defaults to the LAST DAY of the month, 12 months from the base (signature) date', () => {
    // Official CACFP rule: valid until end of the month one year later.
    expect(frpExpiryDefault('2026-07-07', null)).toBe('2027-07-31')
    expect(frpExpiryDefault('2026-07-07', '')).toBe('2027-07-31')
    expect(frpExpiryDefault('2026-07-07', undefined)).toBe('2027-07-31')
  })
  it('rounds to month-end correctly across month lengths and February', () => {
    expect(frpExpiryDefault('2026-05-15', null)).toBe('2027-05-31')   // 31-day month
    expect(frpExpiryDefault('2026-02-10', null)).toBe('2027-02-28')   // Feb, non-leap target
    expect(frpExpiryDefault('2027-02-01', null)).toBe('2028-02-29')   // Feb, leap target (2028)
    expect(frpExpiryDefault('2026-12-31', null)).toBe('2027-12-31')   // year rollover
  })
})

// ─── schedule port: CACFP form → roster.sched_* ──────────────────────────────
// Every fixture below is a REAL shape measured in the live submissions.
describe('parseFormTime — refuses to guess a meridiem', () => {
  it('parses the current form (100% of live v9 values carry am/pm)', () => {
    expect(parseFormTime('8:00 am')).toBe('08:00')
    expect(parseFormTime('5:30 pm')).toBe('17:30')
    expect(parseFormTime('4:30 PM')).toBe('16:30')
    expect(parseFormTime('12:00 am')).toBe('00:00')
    expect(parseFormTime('12:30 pm')).toBe('12:30')
  })

  it('refuses the old free-text forms rather than guessing', () => {
    // "6:00" in a DEPARTURE column means 18:00. Reading it as 06:00 would send
    // the child home before they arrived — and print it on an attendance sheet.
    expect(parseFormTime('6:00')).toBeNull()
    expect(parseFormTime('10')).toBeNull()
    expect(parseFormTime('5')).toBeNull()
    expect(parseFormTime('15:30')).toBeNull()   // unambiguous, but never emitted — stay strict
    expect(parseFormTime('')).toBeNull()
    expect(parseFormTime(null)).toBeNull()
    expect(parseFormTime('13:00 pm')).toBeNull()
  })
})

const day = (arr: string, dep: string, extra: any = {}) =>
  ({ in_care: true, arr1: arr, dep1: dep, arr2: '', dep2: '', ...extra })
const off = { in_care: false, arr1: '', dep1: '', arr2: '', dep2: '' }

describe('buildSchedulePort', () => {
  it('ports a clean current-form week (Lidia, live)', () => {
    const fd = { schedule: {
      mon: day('8:45 am', '4:30 pm'), tue: day('8:45 am', '4:30 pm'), wed: day('8:45 am', '4:30 pm'),
      thu: day('8:45 am', '4:30 pm'), fri: day('8:45 am', '4:30 pm'), sat: off, sun: off,
    } }
    expect(buildSchedulePort(fd)).toEqual({ ok: true, sched_days: 31, sched_in: '08:45', sched_out: '16:30' })
  })

  it('accepts capitalized day keys (older submissions)', () => {
    const fd = { schedule: { Mon: day('7:00 am', '5:30 pm'), Wed: day('7:00 am', '5:30 pm') } }
    expect(buildSchedulePort(fd)).toEqual({ ok: true, sched_days: 1 | 4, sched_in: '07:00', sched_out: '17:30' })
  })

  it('refuses free-text times instead of guessing (Aaron Broadwater, live)', () => {
    const fd = { schedule: { Mon: day('9:00', '5:00'), Tue: day('9:00', '5:00') } }
    const r = buildSchedulePort(fd)
    expect(r.ok).toBe(false)
    expect((r as any).reason).toMatch(/am\/pm required/)
  })

  it('refuses a weekend child — the mask is Mon–Fri', () => {
    const fd = { schedule: { mon: day('8:00 am', '5:00 pm'), sat: day('8:00 am', '5:00 pm') } }
    const r = buildSchedulePort(fd)
    expect(r.ok).toBe(false)
    expect((r as any).reason).toMatch(/sat/)
  })

  it('refuses times that differ by day — the roster holds one pair', () => {
    const fd = { schedule: { mon: day('8:00 am', '5:00 pm'), tue: day('9:00 am', '5:00 pm') } }
    expect(buildSchedulePort(fd)).toEqual({ ok: false, reason: 'times differ by day — the roster holds one pair of times' })
  })

  it('refuses a split day (arr2/dep2)', () => {
    const fd = { schedule: { mon: day('8:00 am', '5:00 pm', { dep2: '1:00 pm' }) } }
    const r = buildSchedulePort(fd)
    expect(r.ok).toBe(false)
    expect((r as any).reason).toMatch(/split day/)
  })

  it('refuses an in-care day with empty times (live: one approved row)', () => {
    const fd = { schedule: { Mon: day('', '') } }
    expect(buildSchedulePort(fd).ok).toBe(false)
  })

  it('refuses a departure that is not after the arrival', () => {
    const fd = { schedule: { mon: day('5:00 pm', '8:00 am') } }
    const r = buildSchedulePort(fd)
    expect(r.ok).toBe(false)
    expect((r as any).reason).toMatch(/not after/)
  })

  it('refuses when nothing is stated', () => {
    expect(buildSchedulePort({}).ok).toBe(false)
    expect(buildSchedulePort({ schedule: {} }).ok).toBe(false)
    expect(buildSchedulePort({ schedule: { mon: off, sat: off } }).ok).toBe(false)
  })
})

describe('buildCacfpPatch — schedule', () => {
  const week = (arr: string, dep: string) => ({
    mon: day(arr, dep), tue: day(arr, dep), wed: day(arr, dep), thu: day(arr, dep), fri: day(arr, dep),
  })

  it('carries a clean schedule into the roster patch', () => {
    const p = buildCacfpPatch({ child_name: 'Aaron Broadwater', schedule: week('8:00 am', '5:30 pm') })
    expect(p.sched_days).toBe(31)
    expect(p.sched_in).toBe('08:00')
    expect(p.sched_out).toBe('17:30')
    expect(p.sched_source).toBe('enrollment_form')
  })

  it('leaves the roster schedule untouched when the form is ambiguous', () => {
    // No sched_* keys at all → approveCacfpUpdate never snapshots or writes
    // them → an existing schedule (CSV import / director edit) survives.
    const p = buildCacfpPatch({ child_name: 'Aaron Broadwater', schedule: week('9:00', '5:00') })
    expect(Object.keys(p).some(k => k.startsWith('sched_'))).toBe(false)
  })

  it('does not invent a schedule when the form carries none', () => {
    const p = buildCacfpPatch({ child_name: 'Aaron Broadwater' })
    expect(Object.keys(p).some(k => k.startsWith('sched_'))).toBe(false)
  })
})

// ─── name order: ratified "First Last"; explicit fields win over child_name ──
describe('buildCacfpPatch — name derivation (First Last, no swap)', () => {
  it('uses explicit first_name/last_name VERBATIM when both are present', () => {
    // The observed bug: correct explicit Yuri/James, but the old code re-split the
    // combined child_name and produced first "James" / last "Yuri". Never again.
    const p = buildCacfpPatch({ child_name: 'Yuri James', first_name: 'Yuri', last_name: 'James' })
    expect(p.first_name).toBe('Yuri')
    expect(p.last_name).toBe('James')
    expect(p.child_name).toBe('Yuri James')     // First Last
  })

  it('keeps a two-word first name intact from the explicit fields', () => {
    // splitChildName would call "Rodriguez" the whole first name and "Texidor" the
    // surname; the explicit fields say otherwise and must be honoured verbatim.
    const p = buildCacfpPatch({
      child_name: 'Izabella Rodriguez Texidor', first_name: 'Izabella', last_name: 'Rodriguez Texidor',
    })
    expect(p.first_name).toBe('Izabella')
    expect(p.last_name).toBe('Rodriguez Texidor')
    expect(p.child_name).toBe('Izabella Rodriguez Texidor')
  })

  it('falls back to splitChildName when only child_name is present (paper/OCR)', () => {
    // No explicit fields → last token is the surname; child_name written First Last.
    const p = buildCacfpPatch({ child_name: 'Yuri James' })
    expect(p.first_name).toBe('Yuri')
    expect(p.last_name).toBe('James')
    expect(p.child_name).toBe('Yuri James')     // First Last (was "James Yuri" before)
  })

  it('falls back to splitChildName when only ONE explicit field is present', () => {
    // A partial pair is not trusted as the split — child_name governs.
    const p = buildCacfpPatch({ child_name: 'Yuri James', first_name: 'Yuri' })
    expect(p.first_name).toBe('Yuri')
    expect(p.last_name).toBe('James')
  })
})

// ─── claim-bridge: child_name is the meal_week_records identity key ──────────
// INSERT (brand-new child) sets First-Last child_name; UPDATE (existing matched
// child) must NEVER rewrite it, or its meal rows desync (invariant until Oct 1).
describe('approveCacfpInsert / approveCacfpUpdate — claim-bridge protection', () => {
  beforeEach(() => { h.calls.length = 0 })
  const patch = () => buildCacfpPatch({ child_name: 'Yuri James', first_name: 'Yuri', last_name: 'James', birthdate: '2021-03-04' })

  it('INSERT sets child_name First-Last on the new roster row', async () => {
    await approveCacfpInsert({ id: 's1', org_id: 'o1', center_id: 'c1', child_id: null }, patch(), 'rev', false)
    const ins = h.calls.find(c => c.table === 'roster' && c.op === 'insert')
    expect(ins?.payload.child_name).toBe('Yuri James')   // First Last
    expect(ins?.payload.is_active).toBe(true)
  })

  it('UPDATE never sends child_name (protects the meal_week_records key)', async () => {
    await approveCacfpUpdate({ id: 's2', child_id: 'k1' }, 'roster-id', patch(), 'rev', false)
    const upd = h.calls.find(c => c.table === 'roster' && c.op === 'update')
    expect(upd).toBeTruthy()
    expect('child_name' in upd!.payload).toBe(false)     // the bridge key is left as-is
    expect(upd!.payload.first_name).toBe('Yuri')         // but other fields still update
    expect(upd!.payload.birthday).toBe('2021-03-04')
  })

  it('UPDATE + reactivate still omits child_name and flips is_active back on', async () => {
    await approveCacfpUpdate({ id: 's3', child_id: 'k1' }, 'roster-id', patch(), 'rev', false, true)
    const upd = h.calls.find(c => c.table === 'roster' && c.op === 'update')
    expect('child_name' in upd!.payload).toBe(false)
    expect(upd!.payload.is_active).toBe(true)
  })
})

// ─── recency rule: on disagreement the LATER date wins (Nikolay, 2026-07-16) ──
describe('scheduleIsStale', () => {
  it('roster set later than the form → form loses', () => {
    expect(scheduleIsStale('2026-07-06', '2026-07-16T15:34:14Z')).toBe(true)
  })
  it('form later than the roster → form wins', () => {
    expect(scheduleIsStale('2026-07-20', '2026-07-16T15:34:14Z')).toBe(false)
  })
  it('same day → the form wins, it is the signed document', () => {
    expect(scheduleIsStale('2026-07-16', '2026-07-16T15:34:14Z')).toBe(false)
  })
  it('roster has no schedule → nothing to lose', () => {
    expect(scheduleIsStale('2026-07-06', null)).toBe(false)
  })
  it('an undated form never beats a dated roster', () => {
    expect(scheduleIsStale(null, '2026-07-16T15:34:14Z')).toBe(true)
  })
})

describe('formAsOf', () => {
  it('prefers the parent signature date', () => {
    expect(formAsOf({ signature_date: '2026-07-06', created_at: '2026-07-08T10:00:00Z' })).toBe('2026-07-06')
  })
  it('falls back to arrival', () => {
    expect(formAsOf({ signature_date: null, created_at: '2026-07-08T10:00:00Z' })).toBe('2026-07-08')
  })
})

describe('Izabella Rodriguez-Texidor — the live case', () => {
  // Her real CACFP form, approved 06.07: Mon–Fri 8:00 am → 5:30 pm.
  const fd = { child_name: 'Izabella Rodriguez Texidor ', schedule: {
    mon: day('8:00 am','5:30 pm'), tue: day('8:00 am','5:30 pm'), wed: day('8:00 am','5:30 pm'),
    thu: day('8:00 am','5:30 pm'), fri: day('8:00 am','5:30 pm'), sat: off, sun: off } }
  // Her real roster row: 08:00–17:00, sched_source 'import', set 16.07.
  const roster = { sched_updated_at: '2026-07-16T15:34:14.983485+00', sched_in: '08:00:00', sched_out: '17:00:00' }

  it('the form parses cleanly — 17:30, half an hour past the CSV', () => {
    expect(buildSchedulePort(fd)).toEqual({ ok: true, sched_days: 31, sched_in: '08:00', sched_out: '17:30' })
  })

  it('but the CSV is later, so the CSV stands', () => {
    const d = decideSchedule(fd, '2026-07-06', roster)
    expect(d.write).toBe(false)
    expect((d as any).reason).toMatch(/later date wins/)
  })

  it('a form she signs tomorrow would win', () => {
    expect(decideSchedule(fd, '2026-07-17', roster)).toEqual({ write: true, sched_days: 31, sched_in: '08:00', sched_out: '17:30' })
  })

  it('Approve today writes no sched_* key at all — her 17:00 is untouched', () => {
    const p = buildCacfpPatch(fd, null, { formDate: '2026-07-06', existing: roster })
    expect(Object.keys(p).some(k => k.startsWith('sched_'))).toBe(false)
    expect(p.child_name).toBe('Izabella Rodriguez Texidor')  // First Last (ratified); no explicit fields → splitChildName fallback
  })

  it('a NEW child with no roster schedule always ports', () => {
    expect(buildCacfpPatch(fd, null, { formDate: '2026-07-06', existing: null }).sched_out).toBe('17:30')
  })
})
