import { describe, it, expect } from 'vitest'
import { normDob, extractToken, extractSubmittedDob, dobVerdict } from './identity'

describe('normDob', () => {
  it('passes a bare ISO date through', () => {
    expect(normDob('2020-03-04')).toBe('2020-03-04')
  })
  it('slices the date out of a timestamp (same rule as matchRoster)', () => {
    expect(normDob('2020-03-04T00:00:00Z')).toBe('2020-03-04')
    expect(normDob('2020-03-04T12:34:56.789+02:00')).toBe('2020-03-04')
  })
  it('treats null / undefined / blank as no date', () => {
    expect(normDob(null)).toBe('')
    expect(normDob(undefined)).toBe('')
    expect(normDob('')).toBe('')
    expect(normDob('   ')).toBe('')
  })
  it('rejects non-date and shape-only-valid strings', () => {
    expect(normDob('not a date')).toBe('')
    expect(normDob('03/04/2020')).toBe('')      // wrong format → not corroborated
    expect(normDob('2020-13-40')).toBe('')      // matches \d{4}-\d{2}-\d{2} but impossible
  })
  it('accepts a Date object via String()', () => {
    // A JS Date stringifies to a locale string, NOT ISO — so it must NOT falsely
    // parse as a match. Only ISO-leading strings corroborate.
    expect(normDob(new Date('2020-03-04T00:00:00Z')).length === 10
      || normDob(new Date('2020-03-04T00:00:00Z')) === '').toBe(true)
  })
})

describe('extractToken', () => {
  it('reads each accepted field name', () => {
    expect(extractToken({ t: 'abc' })).toBe('abc')
    expect(extractToken({ issue_token: 'def' })).toBe('def')
    expect(extractToken({ prefill_token: 'ghi' })).toBe('ghi')
  })
  it('is null when there is no token (a walk-in)', () => {
    expect(extractToken({})).toBeNull()
    expect(extractToken({ t: '' })).toBeNull()
    expect(extractToken({ t: '   ' })).toBeNull()
    expect(extractToken(null)).toBeNull()
  })
  it('prefers t over the aliases', () => {
    expect(extractToken({ t: 'first', issue_token: 'second' })).toBe('first')
  })
})

describe('extractSubmittedDob', () => {
  it('reads birthdate / child_dob / child_birthday', () => {
    expect(extractSubmittedDob({ birthdate: '2020-03-04' })).toBe('2020-03-04')
    expect(extractSubmittedDob({ child_dob: '2020-03-04' })).toBe('2020-03-04')
    expect(extractSubmittedDob({ child_birthday: '2020-03-04' })).toBe('2020-03-04')
  })
  it('is empty when the form carries no DOB (today, before the form half exists)', () => {
    expect(extractSubmittedDob({ child_name: 'A' })).toBe('')
    expect(extractSubmittedDob({})).toBe('')
  })
})

describe('dobVerdict — the §2e-2 corroboration', () => {
  it('match: equal dates, tolerant of a timestamp on the roster side', () => {
    expect(dobVerdict('2020-03-04', '2020-03-04')).toBe('match')
    expect(dobVerdict('2020-03-04', '2020-03-04T00:00:00Z')).toBe('match')
  })
  it('mismatch: both present, different → a forwarded link is refused', () => {
    expect(dobVerdict('2020-03-04', '2019-11-20')).toBe('mismatch')
  })
  it('absent: no submitted DOB is NEVER a pass (strict — the whole point)', () => {
    expect(dobVerdict('', '2020-03-04')).toBe('absent')
    expect(dobVerdict(null, '2020-03-04')).toBe('absent')
    expect(dobVerdict(undefined, '2020-03-04')).toBe('absent')
  })
  it('absent: a missing roster birthday cannot corroborate either', () => {
    expect(dobVerdict('2020-03-04', null)).toBe('absent')
    expect(dobVerdict('2020-03-04', '')).toBe('absent')
  })
  it('absent: a malformed submitted DOB does not sneak through as a match', () => {
    expect(dobVerdict('03/04/2020', '2020-03-04')).toBe('absent')
    expect(dobVerdict('2020-13-40', '2020-13-40')).toBe('absent')  // both impossible → no match
  })
})
