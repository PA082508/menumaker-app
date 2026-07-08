import { describe, it, expect } from 'vitest'
import { classifyChild, tokenMatch, nameForms } from './childSearch'

const rakhmanov = { first_name: 'Erulan', last_name: 'Rakhmanov', child_name: 'Rakhmanov Erulan' }
const rackmanov = { first_name: 'Erulan', last_name: 'Rackmanov', child_name: 'Rackmanov Erulan' }

describe('childSearch — token match (any order)', () => {
  it('finds "Rakhmanov Erulan" when query is reversed "Erulan Rakhmanov"', () => {
    expect(classifyChild(rakhmanov, 'Erulan Rakhmanov')).toBe('exact')
  })
  it('matches partial tokens', () => {
    expect(classifyChild(rakhmanov, 'rakh')).toBe('exact')
    expect(classifyChild(rakhmanov, 'eru')).toBe('exact')
  })
  it('requires ALL tokens to be present', () => {
    expect(classifyChild(rakhmanov, 'Rakhmanov Zoya')).toBe(null)
  })
  it('is diacritic/case-insensitive', () => {
    expect(tokenMatch(nameForms('José', 'Núñez', null), 'jose nunez')).toBe(true)
  })
})

describe('childSearch — fuzzy suggestions', () => {
  it('surfaces the typo variant "Rackmanov" for query "Rakhmanov" as similar', () => {
    expect(classifyChild(rackmanov, 'Rakhmanov')).toBe('similar')
  })
  it('exact token match beats fuzzy (returns exact, not similar)', () => {
    expect(classifyChild(rackmanov, 'Rackmanov')).toBe('exact')
  })
  it('does not fuzzy-match unrelated names', () => {
    expect(classifyChild(rackmanov, 'Baron')).toBe(null)
  })
  it('ignores too-short fuzzy tokens (< 3 chars)', () => {
    expect(classifyChild(rackmanov, 'zz')).toBe(null)
  })
})
