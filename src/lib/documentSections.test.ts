import { describe, it, expect } from 'vitest'
import { sectionOfKey, SECTIONS, LIBRARY_SECTIONS, SEC1, SEC2, OUR_DOCS, NON_REGISTRY_DOCS, isNonRegistryDoc } from './documentSections'

describe('documentSections — shared Library taxonomy', () => {
  it('maps known keys to their section', () => {
    expect(sectionOfKey('dcy_01234')).toBe('ohio_dcy')   // SEC1
    expect(sectionOfKey('sutq_family_needs_survey')).toBe('ohio_dcy') // SUTQ sub-group
    expect(sectionOfKey('iea')).toBe('cacfp')            // SEC2
    expect(sectionOfKey('parent_consent')).toBe('our_documents') // SEC4_FORMS
    expect(sectionOfKey('parents_book')).toBe('our_documents')   // OUR_DOCS
  })
  it('buckets an unlisted key to "other" (never dropped)', () => {
    expect(sectionOfKey('school_enrollment_regular')).toBe('other')
    expect(sectionOfKey('nonexistent_key')).toBe('other')
  })
  it('every SECTIONS id is reachable, and every list key resolves to a real section id', () => {
    const ids = new Set(SECTIONS.map(s => s.id))
    expect(ids.has('other')).toBe(true)
    for (const k of [...SEC1, ...SEC2, ...OUR_DOCS]) expect(ids.has(sectionOfKey(k))).toBe(true)
  })

  it('non-registry docs live in claim_print and are flagged as non-registry', () => {
    expect(NON_REGISTRY_DOCS.length).toBeGreaterThanOrEqual(13)
    for (const d of NON_REGISTRY_DOCS) {
      expect(sectionOfKey(d.key)).toBe('claim_print')
      expect(isNonRegistryDoc(d.key)).toBe(true)
    }
    expect(isNonRegistryDoc('iea')).toBe(false)          // a registry key
    expect(new Set(NON_REGISTRY_DOCS.map(d => d.key)).size).toBe(NON_REGISTRY_DOCS.length) // unique keys
  })
  it('the builder SECTIONS omit claim_print (internal docs are not composable yet), the Library set includes it', () => {
    expect(SECTIONS.some(s => s.id === 'claim_print')).toBe(false)
    expect(LIBRARY_SECTIONS.some(s => s.id === 'claim_print')).toBe(true)
  })
})
