import { describe, it, expect } from 'vitest'
import { toFormLibItems, isPublishable, isDirectorComposable, isHiddenFromDirector } from './formsLibrary'

describe('toFormLibItems (the useFormsLibrary seam)', () => {
  it('returns [] for missing forms', () => {
    expect(toFormLibItems(undefined)).toEqual([])
    expect(toFormLibItems(null)).toEqual([])
    expect(toFormLibItems({})).toEqual([])
  })

  it('maps key/title and falls back to key when title is absent', () => {
    const items = toFormLibItems({ enroll: { title: 'CACFP Enrollment' }, bare: {} })
    expect(items.find(i => i.key === 'enroll')?.title).toBe('CACFP Enrollment')
    expect(items.find(i => i.key === 'bare')?.title).toBe('bare')
  })

  it('sorts by title', () => {
    const items = toFormLibItems({ b: { title: 'Zebra' }, a: { title: 'Apple' } })
    expect(items.map(i => i.key)).toEqual(['a', 'b'])
  })

  it('derives isGovForm from requiringOrg, director countersign, or paper_scan intake', () => {
    const items = toFormLibItems({
      gov_org: { title: 'A', requiringOrg: 'ODJFS/DCY' },
      gov_sign: { title: 'B', requires_countersign: 'director' },
      gov_scan: { title: 'C', intakeMode: 'paper_scan' },
      plain: { title: 'D' },
    })
    const by = new Map(items.map(i => [i.key, i.isGovForm]))
    expect(by.get('gov_org')).toBe(true)
    expect(by.get('gov_sign')).toBe(true)
    expect(by.get('gov_scan')).toBe(true)
    expect(by.get('plain')).toBe(false)
  })

  it('surfaces gov metadata (requiringOrg / countersign / intakeMode) as data, not UI', () => {
    const [item] = toFormLibItems({ dcy: { title: 'DCY', requiringOrg: 'ODJFS/DCY', requires_countersign: 'director', intakeMode: 'paper_scan' } })
    expect(item.requiringOrg).toBe('ODJFS/DCY')
    expect(item.requiresCountersign).toBe('director')
    expect(item.intakeMode).toBe('paper_scan')
  })

  it('skips `_`-prefixed registry meta keys (e.g. _alias_note)', () => {
    const items = toFormLibItems({ _alias_note: { title: 'a note' }, enroll: { title: 'CACFP Enrollment' } })
    expect(items.map(i => i.key)).toEqual(['enroll'])
  })

  it('alias (sameAs): title stays the alias label, gov metadata comes from the target', () => {
    const items = toFormLibItems({
      enroll: { title: 'CACFP Enrollment', requiringOrg: 'ODE Nutrition/CACFP', intakeMode: 'paper_scan' },
      school_enrollment_regular: { title: 'School Enrollment (Regular)', sameAs: 'enroll' },
      school_enrollment_fullday: { title: 'School Enrollment (Full-Day)', sameAs: 'enroll' },
    })
    const reg = items.find(i => i.key === 'school_enrollment_regular')!
    expect(reg.title).toBe('School Enrollment (Regular)')       // its own label
    expect(reg.requiringOrg).toBe('ODE Nutrition/CACFP')        // inherited from enroll
    expect(reg.intakeMode).toBe('paper_scan')
    expect(reg.isGovForm).toBe(true)                            // inherits gov status
    // both aliases distinct keys → can both live in a set's form_keys[]
    expect(items.filter(i => i.key.startsWith('school_enrollment_')).length).toBe(2)
  })

  it('alias with a missing target degrades gracefully (no gov status, keeps title)', () => {
    const [item] = toFormLibItems({ orphan: { title: 'Orphan', sameAs: 'nope' } })
    expect(item.title).toBe('Orphan')
    expect(item.isGovForm).toBe(false)
    expect(item.publishable).toBe(false)      // no target → nothing to publish
  })
})

describe('isPublishable (the map-is-the-gate flag)', () => {
  it('true when current resolves to a real URL string', () => {
    expect(isPublishable({ current: 'v6', versions: { v6: 'https://x/iea_v6.html' } })).toBe(true)
  })
  it('false when current is null (nothing built yet)', () => {
    expect(isPublishable({ current: null, versions: { v1: 'https://x' } })).toBe(false)
    expect(isPublishable({ versions: { v1: 'https://x' } })).toBe(false)
  })
  it('false when the current version is the literal PENDING placeholder', () => {
    expect(isPublishable({ current: 'v1', versions: { v1: 'PENDING' } })).toBe(false)
    expect(isPublishable({ current: 'v1', versions: { v1: 'pending' } })).toBe(false)
  })
  it('false when current points at a missing / empty version', () => {
    expect(isPublishable({ current: 'v9', versions: { v1: 'https://x' } })).toBe(false)
    expect(isPublishable({ current: 'v1', versions: { v1: '   ' } })).toBe(false)
  })
  it('true for a per-center URL object (e.g. parents_book)', () => {
    expect(isPublishable({ current: 'v1', versions: { v1: { pearl: 'https://x/pearl.pdf' } } })).toBe(true)
  })
  it('true on a fallbackUrl even without versions', () => {
    expect(isPublishable({ fallbackUrl: 'https://x/fallback.html' })).toBe(true)
  })
  it('false for empty / nullish input', () => {
    expect(isPublishable(null)).toBe(false)
    expect(isPublishable(undefined)).toBe(false)
    expect(isPublishable({})).toBe(false)
  })
})

describe('toFormLibItems publishability wiring', () => {
  it('marks a PENDING form unpublishable with a reason, a live one publishable', () => {
    const items = toFormLibItems({
      dcy_01217: { title: 'Medication Request', current: null, versions: { v1: 'PENDING' } },
      iea: { title: 'IEA', current: 'v6', versions: { v6: 'https://x/iea.html' } },
    })
    const by = new Map(items.map(i => [i.key, i]))
    expect(by.get('dcy_01217')?.publishable).toBe(false)
    expect(by.get('dcy_01217')?.unpublishedReason).toBe('Not published yet')
    expect(by.get('iea')?.publishable).toBe(true)
    expect(by.get('iea')?.unpublishedReason).toBeUndefined()
  })
  it('an alias inherits the target’s publishability', () => {
    const items = toFormLibItems({
      enroll: { title: 'CACFP Enrollment', current: 'v9', versions: { v9: 'https://x/enroll.html' } },
      school_enrollment_regular: { title: 'School Enrollment (Regular)', sameAs: 'enroll' },
    })
    expect(items.find(i => i.key === 'school_enrollment_regular')?.publishable).toBe(true)
  })
})

describe('director-access gate — CLOSED-LIST, default OPEN (Nikolay 2026-07-22)', () => {
  // The map holds ONLY closed keys ({key:true}); absence = open.
  it('hides only a key the GD explicitly closed (=== true)', () => {
    const hidden = { iea: true }
    expect(isHiddenFromDirector('iea', hidden)).toBe(true)
    expect(isHiddenFromDirector('enroll', hidden)).toBe(false)
  })
  it('defaults to OPEN for a key with no row', () => {
    expect(isDirectorComposable('special_diet', { iea: true })).toBe(true)
    expect(isHiddenFromDirector('special_diet', { iea: true })).toBe(false)
  })
  it('everything is open when the map is missing or empty', () => {
    for (const m of [null, undefined, {}] as const) {
      expect(isDirectorComposable('enroll', m)).toBe(true)
      expect(isHiddenFromDirector('enroll', m)).toBe(false)
    }
  })
  it('isDirectorComposable is the exact complement of isHiddenFromDirector', () => {
    const hidden = { iea: true, staff: true }
    for (const k of ['iea', 'enroll', 'staff', 'unknown']) {
      expect(isDirectorComposable(k, hidden)).toBe(!isHiddenFromDirector(k, hidden))
    }
  })
  it('treats a truthy-but-not-true value as NOT closed (no coercion surprises)', () => {
    // A stray 1 / "true" from a bad row must NOT close the gate — only literal true hides.
    const hidden = { enroll: 1 as unknown as boolean, iea: 'true' as unknown as boolean }
    expect(isHiddenFromDirector('enroll', hidden)).toBe(false)
    expect(isDirectorComposable('iea', hidden)).toBe(true)
  })
})
