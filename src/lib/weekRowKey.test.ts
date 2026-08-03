import { describe, it, expect } from 'vitest'
import { weekRowKey, indexWeekRecords } from './weekRowKey'

// ============================================================================
// ИДЕНТИЧНОСТЬ СТРОКИ НЕДЕЛИ. Проверяется ровно то, что стоило июля 2026:
// экран, индексирующий строки по НАПИСАНИЮ имени, не находит строку ребёнка,
// и повар отмечает неделю заново. 115 строк-сирот.
//
// Клиент обязан работать в ДВУХ схемах: сегодня ключ в базе по имени, после
// 20260731a — по roster_id. Отсюда запасной путь по имени и проверки на него.
// ============================================================================

const REC = (roster_id: string | null, child_name: string, extra: Record<string, unknown> = {}) =>
  ({ roster_id, child_name, ...extra }) as any

describe('weekRowKey — ключ, а не подпись', () => {
  it('ребёнок опознаётся по roster_id, как бы ни было написано имя', () => {
    const a = weekRowKey('11111111-1111-4111-8111-111111111111', 'Andras Inara')
    const b = weekRowKey('11111111-1111-4111-8111-111111111111', 'Inara Andras')
    expect(a).toBe(b)
  })

  it('строка без ребёнка (персонал) законна и опознаётся по имени', () => {
    expect(weekRowKey(null, 'Staff Room')).toBe('n:Staff Room')
    expect(weekRowKey(undefined, 'Staff Room')).toBe('n:Staff Room')
    expect(weekRowKey('   ', 'Staff Room')).toBe('n:Staff Room')
  })

  it('два пространства не смешиваются: имя, равное чужому uuid, не схлопывается с ним', () => {
    const uuid = '22222222-2222-4222-8222-222222222222'
    expect(weekRowKey(null, uuid)).not.toBe(weekRowKey(uuid, 'Кто-то Другой'))
  })

  it('разные дети — разные ключи', () => {
    expect(weekRowKey('a', 'X')).not.toBe(weekRowKey('b', 'X'))
  })
})

describe('indexWeekRecords — читаем ту строку, в которую пишем', () => {
  const RID = '33333333-3333-4333-8333-333333333333'
  const roster = [{ roster_id: RID, child_name: 'Andras Inara' }]

  it('строка находится по ребёнку, даже если написана иначе, чем в ростере', () => {
    const map = indexWeekRecords([REC(RID, 'Inara Andras', { mon_b: 1 })], roster)
    expect(map[weekRowKey(RID, 'Andras Inara')]?.mon_b).toBe(1)
  })

  it('на столкновении побеждает РОСТЕРНОЕ написание — та строка, в которую целится запись', () => {
    // Порядок из базы произвольный: правило обязано работать в обе стороны.
    const imported = REC(RID, 'Inara Andras', { id: 'import' })
    const rosterRow = REC(RID, 'Andras Inara', { id: 'roster' })
    const key = weekRowKey(RID, 'Andras Inara')
    expect(indexWeekRecords([imported, rosterRow], roster)[key].id).toBe('roster')
    expect(indexWeekRecords([rosterRow, imported], roster)[key].id).toBe('roster')
  })

  it('ростерного написания нет ни у одной строки — держим первую, не выдумываем победителя', () => {
    // Ridge · Izabella: у ростера лишний пробел, ни одна строка ему не равна.
    // Такую группу разбирает человек (20260801c §2), а не молчаливое правило.
    const one = REC(RID, 'Rodriguez-Texidor Izabella', { id: 'one' })
    const two = REC(RID, 'Izabella Rodriguez-Texidor', { id: 'two' })
    const odd = [{ roster_id: RID, child_name: 'Rodriguez- Texidor Izabella' }]
    expect(indexWeekRecords([one, two], odd)[weekRowKey(RID, 'x')].id).toBe('one')
  })

  it('строки персонала (без roster_id) остаются различимы по имени', () => {
    const map = indexWeekRecords(
      [REC(null, 'Staff Room', { mon_l: 1 }), REC(null, 'Staff Room 2', { mon_l: 1 })],
      [{ roster_id: null, child_name: 'Staff Room' }],
    )
    expect(Object.keys(map).sort()).toEqual(['n:Staff Room', 'n:Staff Room 2'])
  })
})
