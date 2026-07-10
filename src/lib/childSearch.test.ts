import { describe, it, expect } from 'vitest'
import { classifyChild, tokenMatch, nameForms, scoreChild, scoreMatch } from './childSearch'

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

describe('childSearch — scoreMatch (search-v2 ranking)', () => {
  it('grades exact whole word (3) > word-prefix (2) > fragment (1)', () => {
    expect(scoreMatch(['erulan rakhmanov'], 'erulan')).toBe(3)   // exact word
    expect(scoreMatch(['erulan rakhmanov'], 'eru')).toBe(2)      // word-prefix
    expect(scoreMatch(['erulan rakhmanov'], 'ula')).toBe(1)      // interior fragment
  })
  it('sums per-token scores (reversed order still scores)', () => {
    expect(scoreChild(rakhmanov, 'Erulan Rakhmanov')).toBe(6)    // 3 + 3
  })
  it('returns 0 unless EVERY token hits (threshold)', () => {
    expect(scoreChild(rakhmanov, 'Rakhmanov Zoya')).toBe(0)
  })
  it('is equivalent to tokenMatch on the match/no-match boundary', () => {
    const forms = nameForms('José', 'Núñez', null)
    expect(scoreMatch(forms, 'jose nunez') > 0).toBe(tokenMatch(forms, 'jose nunez'))
    expect(scoreMatch(forms, 'zoya') > 0).toBe(tokenMatch(forms, 'zoya'))
  })
  it('ranks a fuller query above a shorter one', () => {
    expect(scoreChild(rakhmanov, 'erulan')).toBeGreaterThan(scoreChild(rakhmanov, 'eru'))
  })
})
