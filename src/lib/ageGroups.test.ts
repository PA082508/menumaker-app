import { describe, it, expect, vi, afterEach } from 'vitest'
import { deriveMealFields, monthsOld } from './ageGroups'

// Pin "today" so bracket edges are deterministic regardless of when the suite runs.
function freezeToday(iso: string) {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(`${iso}T12:00:00`))
}
afterEach(() => vi.useRealTimers())

describe('monthsOld — calendar-month difference', () => {
  it('counts whole months (day-of-month ignored)', () => {
    freezeToday('2026-07-23')
    expect(monthsOld('2026-01-23')).toBe(6)   // (2026-2026)*12 + (7-1)
    expect(monthsOld('2025-07-23')).toBe(12)
    expect(monthsOld('2024-07-23')).toBe(24)
  })
  it('accepts a Date as well as a string', () => {
    freezeToday('2026-07-23')
    expect(monthsOld(new Date(2025, 6, 1))).toBe(12) // month index 6 = July
  })
})

describe('deriveMealFields — authoritative v_meal_grid brackets', () => {
  const at = (birthMonthsAgo: number) => {
    freezeToday('2026-07-15')
    // Build a birthday exactly N calendar months before 2026-07.
    const totalMonths = 2026 * 12 + 7 - birthMonthsAgo
    const y = Math.floor((totalMonths - 1) / 12)
    const m = ((totalMonths - 1) % 12) + 1
    return `${y}-${String(m).padStart(2, '0')}-15`
  }

  it('birth–5m: infant, formula (null milk), 0 oz', () => {
    expect(deriveMealFields(at(3))).toEqual({
      age_group_food: 'birth_5m', age_group_milk: 'infant', rate_oz: '0', milk_kind: null,
    })
  })
  it('6–11m: still infant/formula, 0 oz', () => {
    expect(deriveMealFields(at(8))).toEqual({
      age_group_food: '6_11m', age_group_milk: 'infant', rate_oz: '0', milk_kind: null,
    })
  })
  it('12–23m (1y): whole milk (red), 4 oz', () => {
    expect(deriveMealFields(at(18))).toEqual({
      age_group_food: '1y', age_group_milk: '1y', rate_oz: '4', milk_kind: 'red',
    })
  })
  it('24–35m (2y): 1% milk, 4 oz', () => {
    expect(deriveMealFields(at(30))).toEqual({
      age_group_food: '2y', age_group_milk: '2y', rate_oz: '4', milk_kind: '1pct',
    })
  })
  it('36–71m (3–5y): 1% milk, 6 oz', () => {
    expect(deriveMealFields(at(48))).toEqual({
      age_group_food: '3_5y', age_group_milk: '3_5y', rate_oz: '6', milk_kind: '1pct',
    })
  })
  it('72m+ (6–12y): 1% milk, 8 oz', () => {
    expect(deriveMealFields(at(90))).toEqual({
      age_group_food: '6_12y', age_group_milk: '6_12y', rate_oz: '8', milk_kind: '1pct',
    })
  })
})
