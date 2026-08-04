import { describe, it, expect } from 'vitest'
import { buildWindows } from './mealWindows'
import { ritualDue, ritualEventKey, type RitualEventKind } from './ritualEvents'

// ============================================================================
// СМОУК ЛЕСТНИЦЫ ОКНА — машиной, минута за минутой.
//
// Это проба пункта 8 захода «Звуковые дополнения»: окно 30 минут (утренний
// снек) обязано дать горн на 10-й, сообщение директору на 15-й, напоминание на
// 20-й и ТИШИНУ на закрытии; окно с отметкой до 10-й минуты — ни горна, ни
// сообщения; после перезагрузки — ни одного повтора.
//
// Прогон идёт по ТОЙ ЖЕ памяти, что у планшета (набор ключей), поэтому «ровно
// один раз на событие» проверяется, а не предполагается. Перезагрузка планшета —
// это второй проход по тем же минутам с той же памятью: localStorage её переживает.
// ============================================================================

const M = (h: number, m = 0) => h * 60 + m
const DATE = '2026-08-04'
const ROOM = 'green-room'

/** Планшет: память о прозвучавшем + лента событий по минутам. */
function tablet(marks: { markedFrom?: number } = {}) {
  const rung = new Set<string>()
  const heard: { at: number; kind: RitualEventKind }[] = []
  const windows = buildWindows([{ slot: 'am_snack', start_time: '09:15', end_time: '09:45' }])
  const run = (from: number, to: number) => {
    for (let min = from; min <= to; min++) {
      const marked = marks.markedFrom !== undefined && min >= marks.markedFrom
      for (const ev of ritualDue({
        windows, nowMin: min, dateISO: DATE, classroomId: ROOM,
        isMarked: () => marked,
        hasRung: (k) => rung.has(k),
      })) {
        rung.add(ev.key)
        heard.push({ at: min, kind: ev.kind })
      }
    }
  }
  return { run, heard, rung, windows }
}

describe('окно 30 минут без единой отметки', () => {
  const t = tablet()
  t.run(M(8, 30), M(10, 30))
  const at = (kind: RitualEventKind) => t.heard.filter(h => h.kind === kind).map(h => h.at)

  it('песенка — ровно в минуту открытия, 09:15', () => {
    expect(at('start')).toEqual([M(9, 15)])
  })

  it('горн — на 10-й минуте, 09:25, и ровно один', () => {
    expect(at('horn')).toEqual([M(9, 25)])
  })

  it('сообщение директору — на 15-й минуте, 09:30, и ровно одно', () => {
    expect(at('director')).toEqual([M(9, 30)])
  })

  it('напоминание — за 10 минут до конца, 09:35 (20-я минута окна)', () => {
    expect(at('reminder')).toEqual([M(9, 35)])
  })

  it('на закрытии и после него — ТИШИНА: ни одного события с 09:45', () => {
    expect(t.heard.filter(h => h.at >= M(9, 45))).toEqual([])
  })

  it('порядок за день — песенка, горн, директор, напоминание; закрытие молчит', () => {
    expect(t.heard.map(h => h.kind)).toEqual(['start', 'horn', 'director', 'reminder'])
  })
})

describe('окно, отмеченное до 10-й минуты', () => {
  const t = tablet({ markedFrom: M(9, 20) })   // отметили на 5-й минуте
  t.run(M(8, 30), M(10, 30))

  it('ни горна, ни сообщения директору', () => {
    expect(t.heard.some(h => h.kind === 'horn')).toBe(false)
    expect(t.heard.some(h => h.kind === 'director')).toBe(false)
  })

  it('напоминания тоже нет — напоминать нечего', () => {
    expect(t.heard.some(h => h.kind === 'reminder')).toBe(false)
  })

  it('песенка старта всё равно прозвучала — она про «можно начинать есть»', () => {
    expect(t.heard.map(h => h.kind)).toEqual(['start'])
  })
})

describe('перезагрузка планшета', () => {
  it('второй проход по той же памяти не даёт НИ ОДНОГО повтора', () => {
    const t = tablet()
    t.run(M(8, 30), M(10, 30))
    const afterFirst = t.heard.length
    expect(afterFirst).toBe(4)
    t.run(M(8, 30), M(10, 30))          // «перезагрузили и открыли снова»
    expect(t.heard.length).toBe(afterFirst)
  })

  it('планшет, открытый впервые на 17-й минуте, догоняет обе ступени по одному разу', () => {
    const t = tablet()
    t.run(M(9, 32), M(10, 30))
    expect(t.heard.map(h => h.kind)).toEqual(['start', 'horn', 'director', 'reminder'])
  })
})

describe('завтрак «по мере прихода» ритуал не ведёт', () => {
  it('ни песенки, ни горна, ни сообщения директору — у окна нет минуты старта', () => {
    const windows = buildWindows([
      { slot: 'breakfast', start_time: '08:00', end_time: '09:00', intake_mode: 'on_arrival' },
    ])
    const rung = new Set<string>()
    const heard: RitualEventKind[] = []
    for (let min = M(7, 30); min <= M(9, 30); min++) {
      for (const ev of ritualDue({
        windows, nowMin: min, dateISO: DATE, classroomId: ROOM,
        isMarked: () => false, hasRung: (k) => rung.has(k),
      })) { rung.add(ev.key); heard.push(ev.kind) }
    }
    expect(heard).toEqual([])
  })
})

describe('ключ памяти', () => {
  it('разделяет класс, приём, событие и день — иначе одно окно глушило бы другое', () => {
    const a = ritualEventKey(DATE, 'green', 'lunch', 'horn')
    expect(a).not.toBe(ritualEventKey(DATE, 'red', 'lunch', 'horn'))
    expect(a).not.toBe(ritualEventKey(DATE, 'green', 'am_snack', 'horn'))
    expect(a).not.toBe(ritualEventKey(DATE, 'green', 'lunch', 'director'))
    expect(a).not.toBe(ritualEventKey('2026-08-05', 'green', 'lunch', 'horn'))
  })
})
