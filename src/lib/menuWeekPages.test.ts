// menuWeekPages.test.ts — перечисление недель месяца в официальном меню.
//
// Повод (03.08.2026): месяц, чьё 1-е число выпало на субботу или воскресенье,
// отдавал НОЛЬ недель. Отсчёт начинается с понедельника недели, содержащей 1-е;
// у такого понедельника все пять будних дней лежат в предыдущем месяце, и прежний
// `break` срабатывал ДО первой страницы вместо того, чтобы пропустить ведущую неделю.
// Молча опустели август-2026, ноябрь-2026, май-2027, август-2027 — и живая форма,
// и опубликованный снимок, потому что рисует их одна функция.
//
// Тест держит ОБЕ стороны: месяцы-погорельцы теперь полны, обычные не разъехались.
import { describe, it, expect } from 'vitest'
import { weekPagesFor, rotationWeek } from '@/pages/menu/OfficialMenu'

// Цикл на проде: 4 недели, первая неделя с понедельника 08.06.2026.
const CYCLE_START = '2026-06-08'
const TOTAL_WEEKS = 4

const mondays = (year: number, month: number) =>
  weekPagesFor(year, month, CYCLE_START, TOTAL_WEEKS)
    .map(p => `${p.monday.getFullYear()}-${String(p.monday.getMonth() + 1).padStart(2, '0')}-${String(p.monday.getDate()).padStart(2, '0')}`)

describe('weekPagesFor — недели месяца', () => {
  it('август-2026 (1-е — суббота): 5 недель, понедельники 03/10/17/24/31', () => {
    expect(mondays(2026, 8)).toEqual([
      '2026-08-03', '2026-08-10', '2026-08-17', '2026-08-24', '2026-08-31',
    ])
  })

  it('ноябрь-2026 (1-е — воскресенье): 5 недель, начиная со 02.11', () => {
    const got = mondays(2026, 11)
    expect(got.length).toBe(5)
    expect(got[0]).toBe('2026-11-02')
    expect(got[4]).toBe('2026-11-30')
  })

  it('февраль-2027 (1-е — понедельник): ровно 4 недели', () => {
    expect(mondays(2027, 2)).toEqual([
      '2027-02-01', '2027-02-08', '2027-02-15', '2027-02-22',
    ])
  })

  it('июль-2026 (обычный месяц, 1-е — среда): 5 недель, не сломан', () => {
    expect(mondays(2026, 7)).toEqual([
      '2026-06-29', '2026-07-06', '2026-07-13', '2026-07-20', '2026-07-27',
    ])
  })

  it('ведущая неделя пропущена, а не показана: август не начинается с 27.07', () => {
    expect(mondays(2026, 8)).not.toContain('2026-07-27')
  })

  it('ни один месяц двух лет не остаётся без недель', () => {
    const empty: string[] = []
    for (const y of [2026, 2027]) {
      for (let m = 1; m <= 12; m++) {
        const n = weekPagesFor(y, m, CYCLE_START, TOTAL_WEEKS).length
        if (n < 4) empty.push(`${y}-${String(m).padStart(2, '0')} → ${n}`)
      }
    }
    expect(empty).toEqual([])
  })

  it('номера недель цикла продолжают крутиться по кругу', () => {
    // Цикл 4-недельный от 08.06.2026 → август идёт 1,2,3,4,1.
    const nums = weekPagesFor(2026, 8, CYCLE_START, TOTAL_WEEKS).map(p => p.weekNum)
    expect(nums).toEqual([1, 2, 3, 4, 1])
    // И якорь на месте: сама первая неделя цикла — первая.
    expect(rotationWeek(new Date('2026-06-08T12:00:00'), CYCLE_START, TOTAL_WEEKS)).toBe(1)
  })
})
