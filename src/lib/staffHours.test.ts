// staffHours.test.ts — проба, заказанная словом владельца 07.08:
// «строки с интервалом · строки legacy · смесь — итог всегда равен сумме видимых Hours».
//
// Тест меряет ровно это свойство, а не отдельные числа: он складывает то, что
// показала бы страница в столбце Hours, и требует, чтобы итог совпал. Пока проба
// стоит, второй вычислитель нельзя завести обратно незаметно.
import { describe, it, expect } from 'vitest'
import { dayHours, weekHours, pairShifts, sumShiftHours, type HoursDay } from '@/lib/staffHours'

const day = (p: Partial<HoursDay> = {}): HoursDay => ({
  is_active: true, shift_start: '06:30', shift_end: '15:30',
  break_start: '', break_end: '', break_minutes: 30, ...p,
})

/** То, что человек видит в столбце Hours, сложенное глазами. */
const visibleSum = (days: HoursDay[]) =>
  days.reduce((s, d) => s + (dayHours(d) ?? 0), 0)

describe('часы дня — один вычислитель', () => {
  it('живой случай владельца: 06:30–15:30 с обедом 12:00–13:00 = 8.0, а не 8.5', () => {
    const mon = day({ break_start: '12:00', break_end: '13:00', break_minutes: 30 })
    expect(dayHours(mon)).toBe(8.0)
    // Итог по одному понедельнику — то самое число, что ждут на живой карточке.
    expect(weekHours([mon]).toFixed(1)).toBe('8.0')
  })

  it('строка legacy: времени обеда нет — считаем по минутам', () => {
    expect(dayHours(day({ break_minutes: 30 }))).toBe(8.5)
  })

  it('половина интервала интервалом не считается — падение назад на минуты', () => {
    expect(dayHours(day({ break_start: '12:00', break_end: '', break_minutes: 30 }))).toBe(8.5)
    expect(dayHours(day({ break_start: '', break_end: '13:00', break_minutes: 30 }))).toBe(8.5)
  })

  it('строки без часов: выключенный день и незаданная смена дают «—», а не ноль', () => {
    expect(dayHours(day({ is_active: false }))).toBeNull()
    expect(dayHours(day({ shift_start: '' }))).toBeNull()
    // Обед длиннее смены — «—», отрицательные часы не показываем и не суммируем.
    expect(dayHours(day({ break_start: '06:00', break_end: '20:00' }))).toBeNull()
  })
})

describe('итог недели = сумма видимых Hours', () => {
  const interval = [
    day({ break_start: '12:00', break_end: '13:00' }),
    day({ break_start: '12:00', break_end: '13:00' }),
  ]
  const legacy = [day(), day({ break_minutes: 60 })]
  const mixed = [
    day({ break_start: '12:00', break_end: '13:00', break_minutes: 30 }), // оба поля — как все 10 живых строк
    day({ break_minutes: 45 }),                                           // только legacy
    day({ is_active: false }),                                            // «—»
    day({ shift_start: '07:00', shift_end: '11:45', break_minutes: 0 }),  // дробные часы
  ]

  it.each([['интервал', interval], ['legacy', legacy], ['смесь', mixed]] as const)(
    '%s', (_name, days) => {
      expect(weekHours(days as HoursDay[])).toBeCloseTo(visibleSum(days as HoursDay[]), 10)
    },
  )

  it('итог не пересчитывает обед по-своему: legacy-минуты на строке с интервалом не влияют', () => {
    // Одна и та же строка с break_minutes 30 и 90 обязана дать один итог —
    // интервал обеда задан, и legacy-поле для неё не читается никем.
    const a = [day({ break_start: '12:00', break_end: '13:00', break_minutes: 30 })]
    const b = [day({ break_start: '12:00', break_end: '13:00', break_minutes: 90 })]
    expect(weekHours(a)).toBe(weekHours(b))
    expect(weekHours(a)).toBe(8.0)
  })

  it('пустая неделя — ноль, а не NaN', () => {
    expect(weekHours([])).toBe(0)
    expect(weekHours([day({ is_active: false })])).toBe(0)
  })
})

describe('фактические часы — пары смен', () => {
  const ev = (t: string, at: string, room = 'Red') => ({ event_type: t, event_at: at, classroom_name: room })

  it('пара вход→выход даёт часы, итог равен сумме видимых', () => {
    const shifts = pairShifts([ev('check_in','2026-08-07T11:00:00Z'), ev('check_out','2026-08-07T19:30:00Z')])
    expect(shifts).toHaveLength(1)
    expect(shifts[0].hours).toBe(8.5)
    expect(sumShiftHours(shifts)).toBe(8.5)
  })

  it('открытая смена не достраивается до «сейчас» — часов нет, и это видно', () => {
    const shifts = pairShifts([ev('check_in','2026-08-07T11:00:00Z')])
    expect(shifts[0].out_at).toBeNull()
    expect(shifts[0].hours).toBeNull()
    expect(sumShiftHours(shifts)).toBe(0)
  })

  it('выход без входа не выдумывает смену', () => {
    expect(pairShifts([ev('check_out','2026-08-07T19:30:00Z')])).toHaveLength(0)
  })

  it('два входа подряд: первая смена остаётся открытой, вторая закрывается', () => {
    const shifts = pairShifts([
      ev('check_in','2026-08-07T11:00:00Z'),
      ev('check_in','2026-08-07T13:00:00Z','Blue'),
      ev('check_out','2026-08-07T18:00:00Z','Blue'),
    ])
    expect(shifts).toHaveLength(2)
    expect(shifts[0].hours).toBeNull()
    expect(shifts[1].hours).toBe(5)
    expect(sumShiftHours(shifts)).toBe(5)
  })

  it('события приходят в любом порядке — смены собираются по времени', () => {
    const shifts = pairShifts([ev('check_out','2026-08-07T19:00:00Z'), ev('check_in','2026-08-07T11:00:00Z')])
    expect(shifts).toHaveLength(1)
    expect(shifts[0].hours).toBe(8)
  })
})
