import { describe, it, expect } from 'vitest'
import {
  toWindow, buildWindows, phaseOf, activeWindow, activeRitualWindow, ritualLed, countdownLeft,
  unbuckledWindows, bannerState, RITUAL_COUNTDOWN_MIN, REMINDER_LEAD_MIN,
} from './mealWindows'

// ============================================================================
// РИТУАЛ «ПРИСТЕГНИ РЕМНИ» — арифметика окон.
// Проверяется машиной именно потому, что глазами это проверяется только в 11:30
// и только один раз в день.
// ============================================================================

const M = (h: number, m = 0) => h * 60 + m
const ROW = (slot: string, s: string | null, e: string | null, mode = 'event') =>
  ({ slot, start_time: s, end_time: e, intake_mode: mode })

describe('окно из строки расписания', () => {
  it('берёт настоящий конец, когда он есть (обед 11:30–12:30)', () => {
    const w = toWindow(ROW('lunch', '11:30:00', '12:30:00'))!
    expect(w.start).toBe(M(11, 30))
    expect(w.end).toBe(M(12, 30))
    expect(w.remindAt).toBe(M(12, 20))               // за 10 минут до конца
    expect(w.countdownTo).toBe(M(12, 0))             // ритуальные 30 минут
  })

  it('нет конца — окно длиной в обещанные плашкой 30 минут', () => {
    const w = toWindow(ROW('lunch', '11:30', null))!
    expect(w.end).toBe(M(11, 30) + RITUAL_COUNTDOWN_MIN)
    expect(w.remindAt).toBe(M(11, 30) + RITUAL_COUNTDOWN_MIN - REMINDER_LEAD_MIN)
  })

  it('короткое окно (перекус 30 минут) — отсчёт не тикает дольше самого окна', () => {
    const w = toWindow(ROW('am_snack', '09:15', '09:45'))!
    expect(w.countdownTo).toBe(w.end)
    expect(countdownLeft(w, M(9, 40))).toBe(5)
  })

  it('нет времени начала — окна нет вовсе', () => {
    expect(toWindow(ROW('supper', null, '16:30'))).toBeNull()
  })

  it('конец раньше начала — считаем, что конца нет, а не разворачиваем сутки', () => {
    const w = toWindow(ROW('supper', '15:30', '09:00'))!
    expect(w.end).toBe(M(15, 30) + RITUAL_COUNTDOWN_MIN)
  })

  it('«по мере прихода» помечено: завтрак не имеет минуты старта', () => {
    expect(toWindow(ROW('breakfast', '07:00', '08:00', 'on_arrival'))!.onArrival).toBe(true)
    expect(toWindow(ROW('lunch', '11:30', '12:30'))!.onArrival).toBe(false)
  })
})

describe('фазы дня', () => {
  const lunch = toWindow(ROW('lunch', '11:30', '12:30'))!

  it('до / открыто / последние десять минут / закрыто', () => {
    expect(phaseOf(lunch, M(11, 29))).toBe('before')
    expect(phaseOf(lunch, M(11, 30))).toBe('open')     // ровно в начале — уже открыто
    expect(phaseOf(lunch, M(12, 19))).toBe('open')
    expect(phaseOf(lunch, M(12, 20))).toBe('reminder') // ровно за 10 минут
    expect(phaseOf(lunch, M(12, 30))).toBe('closed')   // ровно в конце — уже закрыто
  })

  it('открытым считается позже начавшееся, если расписание внахлёст', () => {
    const ws = buildWindows([ROW('lunch', '11:30', '12:30'), ROW('am_snack', '12:00', '12:40')])
    expect(activeWindow(ws, M(12, 10))!.slot).toBe('am_snack')
    expect(activeWindow(ws, M(10, 0))).toBeNull()
  })
})

describe('непристёгнутые до конца дня', () => {
  const day = [
    { ...toWindow(ROW('am_snack', '09:15', '09:45'))!, classroomName: 'Green' },
    { ...toWindow(ROW('lunch', '11:30', '12:30'))!, classroomName: 'Green' },
    { ...toWindow(ROW('lunch', '11:30', '12:30'))!, classroomName: 'Blue' },
    { ...toWindow(ROW('supper', '15:30', '16:30'))!, classroomName: 'Green' },
  ]

  it('краснеют только ЗАКРЫВШИЕСЯ окна без отметок', () => {
    const marked = new Set(['Green|lunch'])
    const out = unbuckledWindows(day, M(17, 0), (w) => marked.has(`${(w as any).classroomName}|${w.slot}`))
    expect(out.map((w) => `${w.classroomName}/${w.slot}`)).toEqual(['Green/am_snack', 'Blue/lunch', 'Green/supper'])
  })

  it('идущее сейчас окно в список не попадает — оно ещё не провалено', () => {
    const out = unbuckledWindows(day, M(12, 0), () => false)
    expect(out.map((w) => w.slot)).toEqual(['am_snack'])
  })

  it('день, отмеченный полностью, не даёт ни одной красной строки', () => {
    expect(unbuckledWindows(day, M(23, 0), () => true)).toEqual([])
  })
})

describe('плашка', () => {
  const lunch = toWindow(ROW('lunch', '11:30', '12:30'))!

  it('окна нет — плашки нет', () => {
    expect(bannerState(null, M(10, 0), false, null, true).kind).toBe('none')
  })

  it('отметок нет — тикает отсчёт', () => {
    const b = bannerState(lunch, M(11, 40), false, null, true)
    expect(b.kind).toBe('counting')
    expect(b.minutesLeft).toBe(20)
    expect(b.urgent).toBe(false)
  })

  it('последние десять минут окна — тревожно, но по-прежнему ничего не блокирует', () => {
    const b = bannerState(lunch, M(12, 25), false, null, true)
    expect(b.urgent).toBe(true)
    // Ритуальные 30 минут вышли — счётчик показывает время ДО ЗАКРЫТИЯ, а не ноль:
    // ноль на видном месте читается как «поздно», хотя отметить ещё можно.
    expect(b.minutesLeft).toBe(0)
    expect(b.minutesToClose).toBe(5)
  })

  it('звук ещё не разблокирован — плашка беззвучная, но видимая', () => {
    expect(bannerState(lunch, M(11, 40), false, null, false).kind).toBe('locked')
  })

  it('появились отметки — зелёное «отмечен HH:MM», отсчёт гаснет', () => {
    const b = bannerState(lunch, M(11, 40), true, '11:38', true)
    expect(b.kind).toBe('done')
    expect(b.markedAt).toBe('11:38')
    expect(b.minutesLeft).toBe(0)
  })

  it('отметка гасит отсчёт и до разблокировки звука', () => {
    expect(bannerState(lunch, M(11, 40), true, '11:38', false).kind).toBe('done')
  })
})

// ============================================================================
// ЗАВТРАК «ПО МЕРЕ ПРИХОДА» — ВНЕ РИТУАЛА (решение владельца 03.08).
// Не поёт, не крутит отсчёт, экран на него сам не переключается. В красный
// список конца дня попадает — но только при нуле отметок за всё окно.
// Расписание взято действующее и подтверждённое владельцем: 09:15 / 11:30 / 15:30.
// ============================================================================
describe('завтрак «по мере прихода» вне ритуала', () => {
  const BREAKFAST = ROW('breakfast', '08:00:00', '09:00:00', 'on_arrival')
  const AM_SNACK  = ROW('am_snack',  '09:15:00', '09:45:00')
  const LUNCH     = ROW('lunch',     '11:30:00', '12:30:00')
  const PM_SNACK  = ROW('pm_snack',  '15:30:00', '16:00:00')
  const ws = buildWindows([BREAKFAST, AM_SNACK, LUNCH, PM_SNACK])

  it('ritualLed отделяет вёдомые окна от «по мере прихода»', () => {
    expect(ws.filter(ritualLed).map(w => w.slot)).toEqual(['am_snack', 'lunch', 'pm_snack'])
  })

  it('внутри завтрака ритуал не ведёт НИЧЕГО — плашки и отсчёта нет', () => {
    expect(activeRitualWindow(ws, M(8, 30))).toBeNull()
    // Плашка строится по вёдомому окну: его нет → пусто, kind === 'none'.
    expect(bannerState(activeRitualWindow(ws, M(8, 30)), M(8, 30), false, null, true).kind).toBe('none')
    // При этом окно как таковое существует и открыто — молчит именно ритуал.
    expect(activeWindow(ws, M(8, 30))!.slot).toBe('breakfast')
  })

  it('снек, обед и полдник ритуал ведёт как прежде', () => {
    expect(activeRitualWindow(ws, M(9, 20))!.slot).toBe('am_snack')
    expect(activeRitualWindow(ws, M(11, 40))!.slot).toBe('lunch')
    expect(activeRitualWindow(ws, M(15, 35))!.slot).toBe('pm_snack')
  })

  it('плашка обеда тикает и краснеет к концу окна — не задето', () => {
    const lunch = activeRitualWindow(ws, M(11, 40))!
    const b = bannerState(lunch, M(11, 40), false, null, true)
    expect(b.kind).toBe('counting')
    expect(b.minutesLeft).toBe(20)
    expect(b.urgent).toBe(false)
    expect(bannerState(lunch, M(12, 25), false, null, true).urgent).toBe(true)
  })

  it('в красный список завтрак попадает — при нуле отметок за всё окно', () => {
    const named = ws.map(w => ({ ...w, classroomName: 'Green Room' }))
    const none = unbuckledWindows(named, M(17, 0), () => false).map(w => w.slot)
    expect(none).toContain('breakfast')
  })

  it('отмеченный завтрак в красный список НЕ попадает', () => {
    const named = ws.map(w => ({ ...w, classroomName: 'Green Room' }))
    const marked = unbuckledWindows(named, M(17, 0), (w) => w.slot === 'breakfast').map(w => w.slot)
    expect(marked).not.toContain('breakfast')
  })

  it('список конца дня молчит, пока окно не закрылось', () => {
    const named = ws.map(w => ({ ...w, classroomName: 'Green Room' }))
    expect(unbuckledWindows(named, M(8, 30), () => false).map(w => w.slot)).toEqual([])
  })
})
