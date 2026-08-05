import { describe, it, expect } from 'vitest'
import { milkByAge, milkByAgeLine, ageMonths } from './milkByAge'

// ============================================================================
// МОЛОКО СЛЕДУЕТ ИЗ ДАТЫ РОЖДЕНИЯ. Пороги — зеркало v_meal_grid: по ней кормят,
// и разойтись с ней значит обещать в карточке одно, а наливать другое.
// ============================================================================

const ASOF = '2026-08-05'

describe('молоко по возрасту', () => {
  it('младенец до года — Formula, 0 oz', () => {
    expect(milkByAge('2026-02-01', ASOF)).toMatchObject({ label: 'Formula', oz: 0 })
  })

  it('от года до двух — Whole, 4 oz', () => {
    expect(milkByAge('2025-01-15', ASOF)).toMatchObject({ label: 'Whole', oz: 4 })
  })

  it('от двух до трёх — уже 1%, но всё ещё 4 oz (пороги метки и унций РАЗНЫЕ)', () => {
    expect(milkByAge('2024-01-15', ASOF)).toMatchObject({ label: '1%', oz: 4 })
  })

  it('три-пять лет — 1%, 6 oz', () => {
    expect(milkByAge('2022-04-11', ASOF)).toMatchObject({ label: '1%', oz: 6 })
  })

  it('школьник — 1%, 8 oz', () => {
    expect(milkByAge('2018-09-01', ASOF)).toMatchObject({ label: '1%', oz: 8 })
  })

  it('день рождения сегодня — месяц уже засчитан', () => {
    expect(ageMonths('2025-08-05', ASOF)).toBe(12)
    expect(milkByAge('2025-08-05', ASOF)).toMatchObject({ label: 'Whole' })
  })

  it('за день до дня рождения — месяц ещё не наступил', () => {
    expect(ageMonths('2025-08-06', ASOF)).toBe(11)
    expect(milkByAge('2025-08-06', ASOF)).toMatchObject({ label: 'Formula', oz: 0 })
  })

  it('даты нет — считать нечего, и строка это говорит', () => {
    expect(milkByAge(null, ASOF)).toBeNull()
    expect(milkByAgeLine('', ASOF)).toContain('Enter the birthday')
  })

  it('строка карточки выглядит как заказано', () => {
    expect(milkByAgeLine('2022-04-11', ASOF)).toBe('1% · 6 oz — by age')
  })

  it('дата режется СТРОКОЙ: new Date над date-only в Нью-Йорке отдал бы вчера', () => {
    expect(ageMonths('2023-05-04', '2026-05-04')).toBe(36)
    expect(ageMonths('2023-05-04', '2026-05-03')).toBe(35)
  })
})
