import { describe, it, expect } from 'vitest'
import { matchRoster, type RosterLite } from './enrollmentApprove'

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
