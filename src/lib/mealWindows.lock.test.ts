// Замок отметок — заказ владельца 08.08. Проба держит ТРИ обещания:
// текущее окно кликабельно · закрытое замкнуто после льготы · прошлый день
// замкнут безусловно. И одно «не обещание»: комната без расписания не запирается.
import { describe, it, expect } from 'vitest'
import { buildWindows, slotLock, lockLine, LOCK_GRACE_MIN } from './mealWindows'

const lunch = buildWindows([{ slot: 'lunch', start_time: '11:30', end_time: '12:00' }])[0]
const at = (h: number, m: number) => h * 60 + m

describe('замок отметок питания', () => {
  it('внутри окна — открыто', () => {
    expect(slotLock(lunch, at(11, 45), 0)).toEqual({ locked: false })
  })

  it('окно кончилось, но льгота идёт — ещё открыто', () => {
    expect(slotLock(lunch, at(12, 0), 0).locked).toBe(false)
    expect(slotLock(lunch, at(12, 29), 0).locked).toBe(false)
  })

  it('льгота вышла — замок, и он называет причину', () => {
    const l = slotLock(lunch, at(12, 0) + LOCK_GRACE_MIN, 0)
    expect(l).toMatchObject({ locked: true, reason: 'window-closed' })
    expect(lockLine(l, 'Lunch')).toBe('Lunch is closed — ask your director to change it.')
  })

  it('до начала окна — открыто: отметить раньше можно, это не задний ход', () => {
    expect(slotLock(lunch, at(9, 0), 0).locked).toBe(false)
  })

  it('прошлый день замкнут безусловно — даже в час, когда окно ещё «идёт»', () => {
    const l = slotLock(lunch, at(11, 45), -1)
    expect(l).toMatchObject({ locked: true, reason: 'past-day' })
    expect(lockLine(l, 'Lunch')).toMatch(/earlier day/)
  })

  it('окна нет — замка нет: замок на незнании запретил бы отметить реальную еду', () => {
    expect(slotLock(null, at(23, 0), 0)).toEqual({ locked: false })
    expect(slotLock(undefined, at(23, 0), 0)).toEqual({ locked: false })
  })

  it('без end_time окно живёт 30 минут от начала, и замок считает от него', () => {
    const w = buildWindows([{ slot: 'breakfast', start_time: '08:00', end_time: null }])[0]
    expect(slotLock(w, at(8, 59), 0).locked).toBe(false)          // 08:30 конец + 30 льготы
    expect(slotLock(w, at(9, 0), 0)).toMatchObject({ locked: true, reason: 'window-closed' })
  })

  it('открытый замок слов не говорит', () => {
    expect(lockLine({ locked: false }, 'Lunch')).toBe('')
  })
})
