import { describe, it, expect } from 'vitest'
import { sectionOfKey, SECTIONS, LIBRARY_SECTIONS, SEC1, SEC2, OUR_DOCS, NON_REGISTRY_DOCS, isNonRegistryDoc, kindOfDoc, groupByKind, KIND_ORDER } from './documentSections'

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

describe('documentSections — kind grouping (Part 3 substrate, up to the fork)', () => {
  it('classifies items by registry kind, gov flag, and non-registry key', () => {
    expect(kindOfDoc({ key: 'wic_information', kind: 'keep' })).toBe('keep')
    expect(kindOfDoc({ key: 'parent_consent', kind: 'signature' })).toBe('signature')
    expect(kindOfDoc({ key: 'dcy_01234', kind: 'signature', isGovForm: true })).toBe('gov') // gov promotes
    expect(kindOfDoc({ key: 'parents_book', kind: 'document' })).toBe('document')
    expect(kindOfDoc({ key: 'print_food_cost_worksheet' })).toBe('print')  // non-registry, has url
    expect(kindOfDoc({ key: 'gen_meal_count' })).toBe('export')            // non-registry, generated (url null)
    expect(kindOfDoc({ key: 'mystery' })).toBe('document')                  // unknown → document, never dropped
  })
  it('groupByKind returns KIND_ORDER order, drops empty buckets, preserves within-bucket order, never loses an item', () => {
    const items = [
      { key: 'parents_book', kind: 'document' },
      { key: 'parent_consent', kind: 'signature' },
      { key: 'wic_information', kind: 'keep' },
      { key: 'topical_product_consent', kind: 'signature' },
      { key: 'print_food_cost_worksheet' },
    ]
    const groups = groupByKind(items)
    // order follows KIND_ORDER (signature < keep < print < document); empty buckets absent.
    const order = groups.map(g => g.kind)
    expect(order).toEqual([...KIND_ORDER].filter(k => order.includes(k)))
    expect(order.indexOf('signature')).toBeLessThan(order.indexOf('keep'))
    expect(order.indexOf('keep')).toBeLessThan(order.indexOf('document'))
    // within the signature bucket, input order is kept
    const sig = groups.find(g => g.kind === 'signature')!
    expect(sig.items.map(i => i.key)).toEqual(['parent_consent', 'topical_product_consent'])
    // total items conserved
    expect(groups.reduce((n, g) => n + g.items.length, 0)).toBe(items.length)
  })
})
