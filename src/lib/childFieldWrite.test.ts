import { describe, it, expect } from 'vitest'
import { toText, changedFields, provenanceProblem, type Provenance } from './childFieldWrite'

const F = [
  { key: 'birthday', table: 'roster' as const, column: 'birthday' },
  { key: 'allergies', table: 'child_medical' as const, column: 'allergies' },
  { key: 'emergency_transport_auth', table: 'roster' as const, column: 'emergency_transport_auth' },
]

describe('toText — the card speaks many types, the journal stores one', () => {
  it('booleans become the words the column will cast back', () => {
    expect(toText(true)).toBe('true')
    expect(toText(false)).toBe('false')   // NOT null: "no" is an answer
  })
  it('blank of any shape is absence, not a value', () => {
    expect(toText('')).toBeNull()
    expect(toText('   ')).toBeNull()
    expect(toText(null)).toBeNull()
    expect(toText(undefined)).toBeNull()
  })
  it('everything else is trimmed text', () => {
    expect(toText(' 2021-09-29 ')).toBe('2021-09-29')
    expect(toText(0)).toBe('0')           // a zero is a value
  })
})

describe('changedFields — a field nobody touched is not a change', () => {
  it('returns only what actually differs', () => {
    const base = { birthday: '2021-09-29', allergies: null, emergency_transport_auth: null }
    const now = { birthday: '2021-09-29', allergies: 'peanuts', emergency_transport_auth: false }
    expect(changedFields(F, base, now).map(w => w.fieldKey)).toEqual(['allergies', 'emergency_transport_auth'])
  })

  it('false is a change from unknown — "no" is an answer, not an absence', () => {
    // The whole emergency-transport lesson in one assertion: unknown → "no" must
    // reach the column, or the fix that made 621 rows honest cannot be undone by
    // a director who actually has the paper.
    const w = changedFields(F, { emergency_transport_auth: null }, { emergency_transport_auth: false })
    expect(w).toHaveLength(1)
    expect(w[0].value).toBe('false')
  })

  it('clearing a value is a change, and travels as null', () => {
    const w = changedFields(F, { allergies: 'peanuts' }, { allergies: '' })
    expect(w).toHaveLength(1)
    expect(w[0].value).toBeNull()
  })

  it('an untouched card writes nothing at all', () => {
    const same = { birthday: '2021-09-29', allergies: 'peanuts', emergency_transport_auth: true }
    expect(changedFields(F, same, { ...same })).toEqual([])
  })

  it('carries the table and column the RPC needs to resolve the row', () => {
    const w = changedFields(F, {}, { allergies: 'peanuts' })
    expect(w[0]).toMatchObject({ table: 'child_medical', column: 'allergies' })
  })
})

describe('provenanceProblem — the two dates are not the same date', () => {
  const p = (o: Partial<Provenance>): Provenance =>
    ({ source: 'library_form', documentDate: null, formKey: null, ...o })

  it('a document must carry the date printed on it', () => {
    expect(provenanceProblem(p({ formKey: 'dcy_01234' })))
      .toMatch(/date printed on the document/)
  })

  it('a library form must say which form', () => {
    expect(provenanceProblem(p({ documentDate: '2026-07-15' })))
      .toMatch(/which library form/)
  })

  it('a complete library-form provenance passes', () => {
    expect(provenanceProblem(p({ documentDate: '2026-07-15', formKey: 'dcy_01234' }))).toBeNull()
  })

  it('a free document needs its date but no form key', () => {
    expect(provenanceProblem(p({ source: 'free_document', documentDate: '2026-07-15' }))).toBeNull()
    expect(provenanceProblem(p({ source: 'free_document' }))).toMatch(/date printed/)
  })

  it('a verbal note carries no document date — there is no document', () => {
    expect(provenanceProblem(p({ source: 'verbal' }))).toBeNull()
    expect(provenanceProblem(p({ source: 'verbal', documentDate: '2026-07-15' })))
      .toMatch(/cannot carry a document date/)
  })
})
