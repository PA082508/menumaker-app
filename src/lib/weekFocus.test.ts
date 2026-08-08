// Проба владельца 08.08 дословно: «пятница/суббота/воскресенье дают три разных
// ожидания». Даты живые и подряд идущие — пт 07.08.2026, сб 08.08, вс 09.08.
import { describe, it, expect } from 'vitest'
import { format } from 'date-fns'
import { weekFocus, focusWeekStart, focusDayKey, focusDowIso } from './weekFocus'

const at = (iso: string) => new Date(`${iso}T09:00:00`)
const day = (d: Date) => format(d, 'yyyy-MM-dd')

describe('weekFocus — американская неделя одним правилом', () => {
  it('пятница: текущая неделя, сегодняшний день', () => {
    const f = weekFocus(at('2026-08-07'))
    expect(day(f.weekStart)).toBe('2026-08-03')
    expect(f.day).toBe('fri')
    expect(f.kind).toBe('working-day')
    expect(f.note).toBe('')
  })

  it('суббота: ЕЩЁ прошедшая неделя — её закрывают и подписывают', () => {
    const f = weekFocus(at('2026-08-08'))
    expect(day(f.weekStart)).toBe('2026-08-03')   // та же неделя, что в пятницу
    expect(f.day).toBe('fri')
    expect(f.kind).toBe('saturday-closing')
    expect(f.note).toMatch(/last week/i)
  })

  it('воскресенье: УЖЕ следующая неделя, фокус на понедельнике', () => {
    const f = weekFocus(at('2026-08-09'))
    expect(day(f.weekStart)).toBe('2026-08-10')   // на неделю вперёд от субботы
    expect(f.day).toBe('mon')
    expect(f.kind).toBe('sunday-ahead')
  })

  it('три дня подряд дают три РАЗНЫХ ожидания', () => {
    const fri = weekFocus(at('2026-08-07'))
    const sat = weekFocus(at('2026-08-08'))
    const sun = weekFocus(at('2026-08-09'))
    expect(new Set([fri.kind, sat.kind, sun.kind]).size).toBe(3)
    // Суббота и пятница — одна неделя; воскресенье — уже другая.
    expect(day(sat.weekStart)).toBe(day(fri.weekStart))
    expect(day(sun.weekStart)).not.toBe(day(sat.weekStart))
  })

  it('понедельник и среда — свои дни своей недели', () => {
    expect(weekFocus(at('2026-08-03')).day).toBe('mon')
    expect(day(weekFocus(at('2026-08-03')).weekStart)).toBe('2026-08-03')
    expect(weekFocus(at('2026-08-05')).day).toBe('wed')
    expect(day(weekFocus(at('2026-08-05')).weekStart)).toBe('2026-08-03')
  })

  it('короткие обёртки отвечают то же самое', () => {
    expect(day(focusWeekStart(at('2026-08-09')))).toBe('2026-08-10')
    expect(focusDayKey(at('2026-08-08'))).toBe('fri')
    expect(focusDowIso(at('2026-08-08'))).toBe(5)
    expect(focusDowIso(at('2026-08-09'))).toBe(1)
  })

  it('через границу месяца и года считает по календарю, а не по арифметике дней', () => {
    // Вс 03.01.2027 → неделя 04.01–08.01.2027
    expect(day(weekFocus(at('2027-01-03')).weekStart)).toBe('2027-01-04')
    // Сб 02.01.2027 → ещё неделя 28.12.2026
    expect(day(weekFocus(at('2027-01-02')).weekStart)).toBe('2026-12-28')
  })
})
