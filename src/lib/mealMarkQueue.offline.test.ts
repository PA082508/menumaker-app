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

// Хранилищ теперь ДВА — очередь и личность устройства — и они обязаны быть раздельными:
// иначе `iterate` по очереди наткнулся бы на строку с id и принял её за отметку. Мок
// раздаёт свою карту на каждый storeName, как это делает настоящий localForage.
const stores = new Map<string, Map<string, any>>()
const storeFor = (name: string) => {
  if (!stores.has(name)) stores.set(name, new Map())
  return stores.get(name)!
}
const mem = storeFor('mealMarkQueue')

vi.mock('localforage', () => ({
  default: {
    createInstance: (opts: any) => {
      const m = storeFor(opts?.storeName ?? 'default')
      return {
        setItem: async (k: string, v: any) => { m.set(k, v); return v },
        getItem: async (k: string) => m.get(k) ?? null,
        removeItem: async (k: string) => { m.delete(k) },
        keys: async () => [...m.keys()],
        iterate: async (fn: (v: any, k: string) => void) => { for (const [k, v] of m) fn(v, k) },
      }
    },
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

beforeEach(() => {
  for (const s of stores.values()) s.clear()
  sent.length = 0
  failNext = false
  delete (globalThis as any).localStorage
  vi.resetModules()
})

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

// ЛИЧНОСТЬ УСТРОЙСТВА (план 31.07d §19.3). Журнал точки обслуживания не знает ни человека,
// ни роли — только `device_id`. На нём одном держится разделение «сверочная станция против
// классного планшета», то есть и вывод, который пойдёт людям в записку. Если id меняется
// при каждом сбросе хранилища, одно устройство однажды вернётся новым и разбор разъедется.
// Проверяется то, что можно проверить без устройства; вытеснение хранилища на живом iPad —
// человеческая часть пробы.

const mark = (over: Record<string, any> = {}) => ({
  center_id: 'c1', classroom_id: 'r1', classroom: 'Blue', roster_id: 'ro1',
  child_name: 'Doe John', monday_date: '2026-07-27', day: 'mon', slot: 'lunch',
  col: 'mon_l', value: 1, marked_at: '2026-07-31T11:35:00.000Z', ...over,
})

/** Минимальное зеркало localStorage; `blocked` моделирует WebView / приватный режим. */
function stubLocalStorage(seed: Record<string, string> = {}, blocked = false) {
  const m = new Map(Object.entries(seed))
  ;(globalThis as any).localStorage = {
    getItem: (k: string) => { if (blocked) throw new Error('blocked'); return m.get(k) ?? null },
    setItem: (k: string, v: string) => { if (blocked) throw new Error('blocked'); m.set(k, v) },
    removeItem: (k: string) => { m.delete(k) },
  }
  return m
}

describe('личность устройства — устойчивость device_id', () => {
  it('device_id уходит на сервер и ПЕРЕЖИВАЕТ перезапуск приложения', async () => {
    const q1 = await import('./mealMarkQueue')
    await q1.enqueueMark(mark() as any)
    await q1.drain()
    const first = sent[0][0].device_id
    expect(first).not.toBe('unknown')
    expect(first).toBeTruthy()

    vi.resetModules()                                  // «приложение закрыли и открыли»
    const q2 = await import('./mealMarkQueue')
    await q2.enqueueMark(mark({ col: 'tue_l', day: 'tue' }) as any)
    await q2.drain()

    expect(sent[1][0].device_id).toBe(first)           // ТО ЖЕ устройство, а не новое
  })

  it('заблокированный localStorage больше НЕ схлопывает устройство в «unknown»', async () => {
    stubLocalStorage({}, true)                         // WebView / приватный режим

    const q = await import('./mealMarkQueue')
    await q.enqueueMark(mark() as any)
    await q.drain()

    const id = sent[0][0].device_id
    expect(id).not.toBe('unknown')                     // ← до правки здесь было 'unknown'

    vi.resetModules()
    const q2 = await import('./mealMarkQueue')
    await q2.enqueueMark(mark({ col: 'tue_l', day: 'tue' }) as any)
    await q2.drain()
    expect(sent[1][0].device_id).toBe(id)              // и он же переживает перезапуск
  })

  it('устройство, работавшее ДО правки, сохраняет свой прежний id — история не рвётся', async () => {
    const old = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
    const ls = stubLocalStorage({ menumaker_device_id: old })   // IndexedDB пуст, зеркало есть

    const q = await import('./mealMarkQueue')
    await q.enqueueMark(mark() as any)
    await q.drain()

    expect(sent[0][0].device_id).toBe(old)                      // прежняя личность принята
    expect(storeFor('device').get('menumaker_device_id')).toBe(old)  // и перенесена в IndexedDB
    expect(ls.get('menumaker_device_id')).toBe(old)             // зеркало не тронуто
  })

  it('при расхождении хранилища и зеркала главным остаётся IndexedDB, зеркало чинится', async () => {
    const idb = '11111111-2222-4333-8444-555555555555'
    const mirror = '99999999-8888-4777-8666-555555555555'
    storeFor('device').set('menumaker_device_id', idb)
    const ls = stubLocalStorage({ menumaker_device_id: mirror })

    const q = await import('./mealMarkQueue')
    await q.enqueueMark(mark() as any)
    await q.drain()

    expect(sent[0][0].device_id).toBe(idb)
    expect(ls.get('menumaker_device_id')).toBe(idb)             // зеркало приведено к хранилищу
  })
})
