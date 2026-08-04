import { describe, it, expect } from 'vitest'
import { bugleTones, dropTones } from './soundKit'
import { appendMuteLog, muteNoteLine, MUTE_LOG_LIMIT, type MuteLogEntry } from './soundMute'

// ============================================================================
// ЯРУСЫ «КАПЛЯ» И «ГОРН» — проверяется РАСКЛАДКА, а не громкость: услышать
// машиной нельзя, но «две капли отличаются от одной» и «горн не тише песенки»
// проверить можно, и именно на этом ярусы путают на слух через неделю.
// ============================================================================

describe('капля', () => {
  it('чек-ин — ровно одна', () => {
    expect(dropTones(1)).toHaveLength(1)
  })

  it('чек-аут — две, и с ЗАЗОРОМ: слитые в трель две капли перестают быть двумя', () => {
    const t = dropTones(2)
    expect(t).toHaveLength(2)
    expect(t[1].at - t[0].at).toBeGreaterThan(t[0].decay)
  })

  it('капля — это ПАДЕНИЕ высоты, иначе это писк', () => {
    const [d] = dropTones(1)
    expect(d.glideTo).toBeDefined()
    expect(d.glideTo!).toBeLessThan(d.freq)
  })

  it('капля тише песенки старта (0.32) — это расписка себе, а не объявление комнате', () => {
    expect(dropTones(1)[0].peak).toBeLessThan(0.32)
  })
})

describe('горн', () => {
  const bugle = bugleTones()

  it('громче песенки старта — он будит, а не приглашает', () => {
    expect(Math.max(...bugle.map(t => t.peak))).toBeGreaterThan(0.32)
  })

  it('медный тембр, а не колокольчик', () => {
    expect(bugle.every(t => t.type === 'sawtooth')).toBe(true)
  })

  it('последняя нота длиннее прочих — сигнал заканчивается держащейся нотой', () => {
    expect(bugle[bugle.length - 1].decay).toBeGreaterThan(bugle[0].decay)
  })

  it('ноты идут по возрастанию времени и не наезжают одна на другую', () => {
    for (let i = 1; i < bugle.length; i++) expect(bugle[i].at).toBeGreaterThan(bugle[i - 1].at)
  })
})

describe('журнал тишины', () => {
  const e = (at: string, on: boolean): MuteLogEntry => ({ at, on, device: 'Red Room' })

  it('новая запись встаёт первой', () => {
    const log = appendMuteLog([e('2026-08-04T12:00:00Z', true)], e('2026-08-04T13:00:00Z', false))
    expect(log[0].on).toBe(false)
    expect(log).toHaveLength(2)
  })

  it('хвост срезается по потолку', () => {
    let log: MuteLogEntry[] = []
    for (let i = 0; i < MUTE_LOG_LIMIT + 10; i++) log = appendMuteLog(log, e(`2026-08-04T00:00:${i}Z`, i % 2 === 0))
    expect(log).toHaveLength(MUTE_LOG_LIMIT)
  })

  it('строка о тишине появляется ТОЛЬКО когда тишина есть', () => {
    expect(muteNoteLine(null)).toBeNull()
    expect(muteNoteLine('07:15')).toBe('sound muted since 07:15')
  })
})

// ============================================================================
// ГЛУШИТЕЛЬ — ОДИН И НИЖЕ ВСЕХ ЯРУСОВ.
//
// Услышать тишину машиной нельзя, поэтому проверяется то, что можно: состояние
// переживает чтение, ярус тревоги на него НЕ смотрит, и ни один голос не
// рождается мимо гейта. Последнее — проба по исходнику, и это не педантизм:
// новый ярус, добавленный через месяц со своим `ctx.createOscillator`, окажется
// единственным звуком, который тумблер не глушит, и найдут это в тихий час.
// ============================================================================

import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { bannerState, toWindow } from './mealWindows'
import { isMuted, setMuted, __resetMute } from './soundMute'

const HERE = dirname(fileURLToPath(import.meta.url))

describe('тумблер тишины', () => {
  // localStorage в node нет — подставляем тот же интерфейс, что у планшета.
  const store = new Map<string, string>()
  ;(globalThis as any).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, String(v)) },
    removeItem: (k: string) => { store.delete(k) },
  }

  it('включается, выключается и переживает перечитывание', () => {
    __resetMute()
    expect(isMuted()).toBe(false)
    setMuted(true, 'Red Room')
    expect(isMuted()).toBe(true)
    setMuted(false, 'Red Room')
    expect(isMuted()).toBe(false)
  })

  it('ПУЛЬСАЦИЯ ОТ ТИШИНЫ НЕ ЗАВИСИТ — заглушённая комната обязана остаться видимой', () => {
    const w = toWindow({ slot: 'lunch', start_time: '11:30', end_time: '12:30' })!
    const at = 11 * 60 + 45   // 15-я минута пустого окна
    __resetMute()
    const loud = bannerState(w, at, false, null, true).alarm
    setMuted(true, 'Red Room')
    const quiet = bannerState(w, at, false, null, true).alarm
    expect(loud).toBe(true)
    expect(quiet).toBe(true)
    __resetMute()
  })
})

describe('ни один голос не рождается мимо гейта', () => {
  const kit = readFileSync(resolve(HERE, 'soundKit.ts'), 'utf8')
  const chime = readFileSync(resolve(HERE, 'mealChime.ts'), 'utf8')

  it('гейт стоит в playTones — там, где звук рождается', () => {
    const body = chime.slice(chime.indexOf('export function playTones'))
    expect(body.slice(0, 600)).toContain('isMuted()')
  })

  it('речь спрашивает гейт сама — она идёт мимо Web Audio', () => {
    const body = kit.slice(kit.indexOf('export function speakLine'))
    expect(body.slice(0, 600)).toContain('isMuted()')
  })

  it('в ярусах нет своего осциллятора в обход playTones', () => {
    expect(kit).not.toContain('createOscillator')
    expect(kit).not.toContain('new AudioContext')
  })
})
