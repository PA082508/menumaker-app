import { describe, it, expect } from 'vitest'
import { matchRoster, parseIeaFiscalYear, frpExpiryDefault, isoDate, type RosterLite } from './enrollmentApprove'

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
  it('defaults to determination date + 12 months when the paper has no expiration', () => {
    expect(frpExpiryDefault('2026-07-07', null)).toBe('2027-07-07')
    expect(frpExpiryDefault('2026-07-07', '')).toBe('2027-07-07')
    expect(frpExpiryDefault('2026-07-07', undefined)).toBe('2027-07-07')
  })
})
