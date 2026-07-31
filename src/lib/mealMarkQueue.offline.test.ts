import { describe, it, expect, vi, beforeEach } from 'vitest'

// ПРОБА ОФЛАЙНА — машинная часть (владелец, 31.07). Замер 31.07 показал: за 19 дней
// максимальная задержка тап→сервер 15.5 сек, то есть долгого офлайна, ради которого
// очередь написана, на живых данных НЕ БЫЛО НИ РАЗУ. Значит страховка НЕ ПРОВЕРЕНА
// боем, и до того, как на неё опираться, она проверяется намеренно.
//
// Здесь проверяется то, что можно проверить без устройства:
//   1. отметка, сделанная без сети, доходит после включения;
//   2. на сервер уходит ВРЕМЯ ТАПА, а не время досылки — иначе журнал точки
//      обслуживания солжёт ровно о том, ради чего он заведён;
//   3. неудачная досылка НЕ ТЕРЯЕТ отметку — она остаётся в хранилище;
//   4. хранилище переживает перезапуск процесса (новый импорт модуля читает то же
//      хранилище) — модельный аналог закрытия приложения.
// Перезагрузку устройства и разряд планшета машина проверить не может — это
// человеческая часть пробы, протокол в плане 31.07d.

const mem = new Map<string, any>()
vi.mock('localforage', () => ({
  default: {
    createInstance: () => ({
      setItem: async (k: string, v: any) => { mem.set(k, v); return v },
      getItem: async (k: string) => mem.get(k) ?? null,
      removeItem: async (k: string) => { mem.delete(k) },
      keys: async () => [...mem.keys()],
      iterate: async (fn: (v: any, k: string) => void) => { for (const [k, v] of mem) fn(v, k) },
    }),
  },
}))

const sent: any[][] = []
let failNext = false
vi.mock('@/lib/supabase', () => ({
  supabase: {
    schema: () => ({
      rpc: async (_fn: string, args: any) => {
        if (failNext) return { error: { message: 'network down' } }
        sent.push(args._marks)
        return { error: null }
      },
    }),
  },
}))

beforeEach(() => { mem.clear(); sent.length = 0; failNext = false })

describe('офлайн-очередь отметок — намеренная проба', () => {
  it('отметка без сети доходит после включения, и на сервер уходит ВРЕМЯ ТАПА', async () => {
    const q = await import('./mealMarkQueue')
    const tapTime = '2026-07-31T11:35:00.000Z'
    await q.enqueueMark({
      center_id: 'c1', classroom_id: 'r1', classroom: 'Blue', roster_id: 'ro1',
      child_name: 'Doe John', monday_date: '2026-07-27', day: 'mon', slot: 'lunch',
      col: 'mon_l', value: 1, marked_at: tapTime,
    } as any)

    expect(q.getPendingCount()).toBe(1)   // сеть выключена — отметка ждёт

    await q.drain()                           // сеть включена

    expect(sent).toHaveLength(1)
    expect(sent[0][0].marked_at).toBe(tapTime)     // ⚠ не время досылки
    expect(sent[0][0].value).toBe(1)
    await new Promise(r => setTimeout(r, 0))       // счётчик обновляется снимком
    expect(q.getPendingCount()).toBe(0)            // очередь пуста
  })

  it('неудачная досылка НЕ ТЕРЯЕТ отметку — она остаётся и уходит со второй попытки', async () => {
    const q = await import('./mealMarkQueue')
    await q.enqueueMark({
      center_id: 'c1', classroom_id: 'r1', classroom: 'Blue', roster_id: 'ro1',
      child_name: 'Roe Jane', monday_date: '2026-07-27', day: 'tue', slot: 'supper',
      col: 'tue_su', value: 1, marked_at: '2026-07-31T15:32:00.000Z',
    } as any)

    failNext = true
    await q.drain()
    expect(sent).toHaveLength(0)
    expect(q.getPendingCount()).toBe(1)      // НЕ потеряна

    failNext = false
    await q.drain()
    expect(sent).toHaveLength(1)
    expect(sent[0][0].marked_at).toBe('2026-07-31T15:32:00.000Z')
    expect(q.getPendingCount()).toBe(0)
  })

  it('хранилище переживает перезапуск процесса — модель закрытия приложения', async () => {
    const q1 = await import('./mealMarkQueue')
    await q1.enqueueMark({
      center_id: 'c1', classroom_id: 'r1', classroom: 'Blue', roster_id: 'ro1',
      child_name: 'Poe Ann', monday_date: '2026-07-27', day: 'wed', slot: 'am_snack',
      col: 'wed_as', value: 1, marked_at: '2026-07-31T09:20:00.000Z',
    } as any)

    vi.resetModules()                              // «приложение закрыли»
    const q2 = await import('./mealMarkQueue')     // «открыли заново»
    await q2.drain()                               // первый же слив читает хранилище

    expect(sent[0][0].marked_at).toBe('2026-07-31T09:20:00.000Z')
  })
})
