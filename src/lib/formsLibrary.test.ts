import { describe, it, expect } from 'vitest'
import { toFormLibItems } from './formsLibrary'

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
})
