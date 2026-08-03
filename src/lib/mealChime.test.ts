import { describe, it, expect } from 'vitest'
import {
  CHIME_VARIANTS, CHIME_VARIANT_KEYS, CLOSE_PHRASE, VOICE_SHAPE, ATTACK_S,
  noteToFreq, phraseFor, scheduleTones, isChimeVariant, playChime, isAudioUnlocked,
} from './mealChime'

// ============================================================================
// ГОЛОСА РИТУАЛА. Услышать машиной нельзя — поэтому проверяется то, что делает
// звук звуком: ноты, слова, форма конверта и различимость трёх голосов.
// Заказанные ноты выписаны здесь ЗАНОВО, а не взяты из модуля: иначе тест
// подтверждал бы сам себя, а не совпадение с заказом.
// ============================================================================

describe('варианты — ровно то, что заказано', () => {
  it('вариантов три', () => {
    expect(CHIME_VARIANT_KEYS).toEqual(['v1', 'v2', 'v3'])
  })

  it('ноты и слова совпадают с заказом дословно', () => {
    expect(CHIME_VARIANTS.v1.start).toEqual({ notes: ['C5', 'E5', 'G5', 'C6'], words: "It's time to eat!" })
    expect(CHIME_VARIANTS.v1.reminder).toEqual({ notes: ['G4', 'B4', 'D5', 'G5'], words: 'Please mark the meal' })
    expect(CHIME_VARIANTS.v2.start).toEqual({ notes: ['G4', 'C5', 'E5', 'D5', 'C5'], words: 'Wash your hands and eat' })
    expect(CHIME_VARIANTS.v2.reminder).toEqual({ notes: ['E4', 'A4', 'C5', 'B4', 'A4'], words: 'Ten more minutes left' })
    expect(CHIME_VARIANTS.v3.start).toEqual({ notes: ['E5', 'C5', 'E5', 'C5', 'G5'], words: 'Yummy-yummy time!' })
    expect(CHIME_VARIANTS.v3.reminder).toEqual({ notes: ['C5', 'A4', 'C5', 'A4', 'D5'], words: 'Did you mark the meal?' })
  })

  it('закрытие — один низкий нейтральный голос на все варианты, D4→A3', () => {
    expect(CLOSE_PHRASE.notes).toEqual(['D4', 'A3'])
    for (const k of CHIME_VARIANT_KEYS) expect(phraseFor(k, 'close')).toBe(CLOSE_PHRASE)
  })

  it('неизвестный вариант не роняет экран — звучит первый', () => {
    expect(isChimeVariant('v9')).toBe(false)
    expect(phraseFor('v9' as any, 'start')).toEqual(CHIME_VARIANTS.v1.start)
  })
})

describe('ноты → частоты', () => {
  it('опорные точки', () => {
    expect(noteToFreq('A4')).toBeCloseTo(440, 6)
    expect(noteToFreq('C5')).toBeCloseTo(523.25, 1)
    expect(noteToFreq('C6')).toBeCloseTo(1046.5, 1)
    expect(noteToFreq('A3')).toBeCloseTo(220, 6)
    expect(noteToFreq('D4')).toBeCloseTo(293.66, 1)
  })
  it('октава — ровно вдвое', () => {
    expect(noteToFreq('C6') / noteToFreq('C5')).toBeCloseTo(2, 9)
  })
  it('не нота — отказ словами, а не тихий ноль', () => {
    expect(() => noteToFreq('H7')).toThrow(/не нота/)
  })
})

describe('голоса различимы по замыслу, а не по вкусу', () => {
  it('напоминание ТИШЕ и НИЖЕ старта', () => {
    expect(VOICE_SHAPE.reminder.peak).toBeLessThan(VOICE_SHAPE.start.peak)
    const startTop = Math.max(...CHIME_VARIANTS.v1.start.notes.map(noteToFreq))
    const remTop = Math.max(...CHIME_VARIANTS.v1.reminder.notes.map(noteToFreq))
    expect(remTop).toBeLessThan(startTop)
    for (const k of CHIME_VARIANT_KEYS) {
      const s = Math.max(...CHIME_VARIANTS[k].start.notes.map(noteToFreq))
      const r = Math.max(...CHIME_VARIANTS[k].reminder.notes.map(noteToFreq))
      expect(r, `вариант ${k}: напоминание должно быть ниже старта`).toBeLessThan(s)
    }
  })

  it('закрытие — самое низкое из всего, что звучит', () => {
    const closeTop = Math.max(...CLOSE_PHRASE.notes.map(noteToFreq))
    for (const k of CHIME_VARIANT_KEYS) {
      expect(closeTop).toBeLessThan(Math.min(...CHIME_VARIANTS[k].start.notes.map(noteToFreq)))
    }
  })

  it('закрытие идёт ВНИЗ — D4 выше A3', () => {
    expect(noteToFreq(CLOSE_PHRASE.notes[0])).toBeGreaterThan(noteToFreq(CLOSE_PHRASE.notes[1]))
  })
})

describe('колокольный конверт', () => {
  it('атака быстрая, затухание длинное — это и есть колокол', () => {
    expect(ATTACK_S).toBeLessThanOrEqual(0.01)
    for (const v of ['start', 'reminder', 'close'] as const) {
      expect(VOICE_SHAPE[v].decay).toBeGreaterThan(ATTACK_S * 50)
    }
  })

  it('у старта есть октавный обертон (лёгкая яркость), у остальных — нет', () => {
    expect(VOICE_SHAPE.start.overtone).toBeGreaterThan(0)
    expect(VOICE_SHAPE.reminder.overtone).toBe(0)
    expect(VOICE_SHAPE.close.overtone).toBe(0)
    const tones = scheduleTones('v1', 'start')
    expect(tones).toHaveLength(8)                       // 4 ноты × (основа + обертон)
    expect(tones[1].freq).toBeCloseTo(tones[0].freq * 2, 6)
    expect(tones[1].peak).toBeLessThan(tones[0].peak)   // обертон тише основы
  })

  it('ноты идут по очереди, а не аккордом', () => {
    const t = scheduleTones('v2', 'reminder', 10)
    expect(t.map((x) => x.at)).toEqual([10, 10.2, 10.4, 10.6, 10.8].map((x) => expect.closeTo(x, 6)))
  })
})

describe('iOS: до касания — тишина, и это честно', () => {
  it('пока звук не разблокирован, playChime молча отказывает', () => {
    expect(isAudioUnlocked()).toBe(false)
    expect(playChime('v1', 'start')).toBe(false)
  })
})
