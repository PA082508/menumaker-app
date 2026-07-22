import { describe, it, expect } from 'vitest'
import {
  isIncomeType, familyKey, childLabel, groupIncome, pendingIncomeCount,
  type IncomeRowLite,
} from './incomeInbox'

const row = (o: Partial<IncomeRowLite>): IncomeRowLite => ({
  id: o.id ?? 'x', center_id: o.center_id ?? 'c1', child_id: o.child_id ?? null,
  submission_type: o.submission_type ?? 'iea', form_data: o.form_data ?? {},
  status: o.status ?? 'pending', created_at: o.created_at ?? '2026-07-01',
})

describe('isIncomeType', () => {
  it('matches iea and usda_waiver only', () => {
    expect(isIncomeType('iea')).toBe(true)
    expect(isIncomeType('usda_waiver')).toBe(true)
    expect(isIncomeType('cacfp_enrollment')).toBe(false)
    expect(isIncomeType('iea_fy2026_27')).toBe(false) // submission_type is 'iea', not the form_data.type
    expect(isIncomeType(null)).toBe(false)
  })
})

describe('familyKey — signing adult anchors the household', () => {
  it('uses adult.print_name when present', () => {
    expect(familyKey({ adult: { print_name: 'Kayla Friel' } })).toBe('Kayla Friel')
  })
  it('falls back to the child surname (Last First)', () => {
    expect(familyKey({ child_name: 'Kolhmorgen Sasha' })).toBe('Kolhmorgen')
  })
  it('is stable for empty/whitespace adult names', () => {
    expect(familyKey({ adult: { print_name: '  ' } })).toBe('(unidentified household)')
    expect(familyKey({})).toBe('(unidentified household)')
  })
})

describe('childLabel — honest about household-level forms', () => {
  it('uses a child name if one is on the form', () => {
    expect(childLabel({ child_name: 'Sasha Lily-Rose' })).toBe('Sasha Lily-Rose')
  })
  it('summarizes a children[] list', () => {
    expect(childLabel({ children: [{ name: 'Ann' }, { name: 'Bo' }] })).toBe('Ann +1 more')
  })
  it('says "household" when there is no child', () => {
    expect(childLabel({ adult: { print_name: 'X' } })).toBe('Income application (household)')
  })
})

describe('groupIncome — center → family → child', () => {
  const name = (id: string) => ({ c1: 'Pearl', c2: 'Ridge' } as Record<string, string>)[id] ?? id

  it('nests rows by center then family, preserving order', () => {
    const rows = [
      row({ id: 'a', center_id: 'c1', form_data: { adult: { print_name: 'Friel' } } }),
      row({ id: 'b', center_id: 'c1', form_data: { adult: { print_name: 'Friel' } } }),
      row({ id: 'c', center_id: 'c2', form_data: { adult: { print_name: 'Pullett' } } }),
    ]
    const g = groupIncome(rows, name)
    expect(g.map(x => x.centerName)).toEqual(['Pearl', 'Ridge'])
    expect(g[0].families).toHaveLength(1)
    expect(g[0].families[0].label).toBe('Friel')
    expect(g[0].families[0].rows.map(r => r.id)).toEqual(['a', 'b'])
    expect(g[1].families[0].label).toBe('Pullett')
  })
})

describe('pendingIncomeCount — pending only, honest 0', () => {
  it('counts pending, never rejected/approved', () => {
    const rows = [
      row({ status: 'rejected' }), row({ status: 'approved' }), row({ status: 'rejected' }),
    ]
    expect(pendingIncomeCount(rows)).toBe(0) // today's real shape: 6 rejected + 1 approved
    expect(pendingIncomeCount([...rows, row({ status: 'pending' })])).toBe(1)
  })
})
