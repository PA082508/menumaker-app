// src/lib/mealChime.ts
// MenuMaker · Голоса ритуала «Пристегни ремни» — синтез Web Audio, без файлов.
//
// ПОЧЕМУ СИНТЕЗ, А НЕ ЗВУКОВЫЕ ФАЙЛЫ. Экран счёта обязан открываться без сети
// (в этом весь смысл офлайн-очереди). Звук из файла — это ещё один ресурс, который
// может не докачаться, вылететь из кэша или потеряться при обновлении сборки, и
// тогда ритуал молчит ровно в тот день, когда сеть плохая. Осциллятор не теряется.
//
// ТРИ ГОЛОСА, И ОНИ РАЗНЫЕ ПО НАЗНАЧЕНИЮ, А НЕ ПО ВКУСУ:
//   · start    — ярко, вверх: «можно начинать». Первое назначение важнее второго —
//                сначала «начинайте есть», и только потом «отметьте» (канон 31.07:
//                ранняя подача стоила центру приёма пищи на проверке).
//   · reminder — тише и НИЖЕ старта: это напоминание, а не новая команда. Голос,
//                равный по яркости старту, через неделю перестанут различать.
//   · close    — низкий нейтральный D4→A3, одинаковый у всех вариантов: окно
//                закрылось. Не наказание и не тревога — падающая терция вниз.
//
// КОЛОКОЛЬНЫЙ КОНВЕРТ: быстрая атака (5 мс), затем экспоненциальное затухание.
// Старту добавлен обертон октавой выше на малой громкости — та самая «лёгкая
// яркость»; у напоминания и закрытия обертона нет, поэтому они звучат глуше при
// тех же нотах.

import { isMuted } from './soundMute'

export type ChimeVoice = 'start' | 'reminder' | 'close'
export type ChimeVariantKey = 'v1' | 'v2' | 'v3'

export interface ChimePhrase {
  /** Ноты в научной записи (C4 = средняя до). */
  notes: string[]
  /** Слова, которые видит человек на плашке. Звук без слов — просто «пикнуло». */
  words: string
}

export interface ChimeVariant {
  key: ChimeVariantKey
  label: string
  start: ChimePhrase
  reminder: ChimePhrase
}

/** Закрытие окна — один голос на все варианты: низкий, нейтральный, вниз. */
export const CLOSE_PHRASE: ChimePhrase = {
  notes: ['D4', 'A3'],
  words: 'Window closed',
}

export const CHIME_VARIANTS: Record<ChimeVariantKey, ChimeVariant> = {
  v1: {
    key: 'v1',
    label: 'Variant 1 · «It\'s time to eat!»',
    start:    { notes: ['C5', 'E5', 'G5', 'C6'], words: "It's time to eat!" },
    reminder: { notes: ['G4', 'B4', 'D5', 'G5'], words: 'Please mark the meal' },
  },
  v2: {
    key: 'v2',
    label: 'Variant 2 · «Wash your hands and eat»',
    start:    { notes: ['G4', 'C5', 'E5', 'D5', 'C5'], words: 'Wash your hands and eat' },
    reminder: { notes: ['E4', 'A4', 'C5', 'B4', 'A4'], words: 'Ten more minutes left' },
  },
  v3: {
    key: 'v3',
    label: 'Variant 3 · «Yummy-yummy time!»',
    start:    { notes: ['E5', 'C5', 'E5', 'C5', 'G5'], words: 'Yummy-yummy time!' },
    reminder: { notes: ['C5', 'A4', 'C5', 'A4', 'D5'], words: 'Did you mark the meal?' },
  },
}

export const CHIME_VARIANT_KEYS: ChimeVariantKey[] = ['v1', 'v2', 'v3']
// Выбор владельца 03.08: «Маленькая песенка». Старт называет ДЕЙСТВИЕ («вымой руки
// и ешь»), а не факт («время есть»), напоминание называет ОСТАТОК («десять минут») —
// поэтому два голоса не путаются на слух даже через неделю, а это главное требование
// к паре, которую слышат каждый день. То же значение стоит умолчанием у колонки
// meal_count_settings.chime_variant (20260802c), чтобы центр без выбора и экран без
// связи звонили одинаково.
export const DEFAULT_VARIANT: ChimeVariantKey = 'v2'

export function isChimeVariant(v: unknown): v is ChimeVariantKey {
  return typeof v === 'string' && (CHIME_VARIANT_KEYS as string[]).includes(v)
}

export function phraseFor(variant: ChimeVariantKey, voice: ChimeVoice): ChimePhrase {
  if (voice === 'close') return CLOSE_PHRASE
  const v = CHIME_VARIANTS[variant] ?? CHIME_VARIANTS[DEFAULT_VARIANT]
  return voice === 'start' ? v.start : v.reminder
}

// ─── Ноты → частота ──────────────────────────────────────────────────────────
// Равномерная темперация, A4 = 440 Гц. Таблицей частот не обойтись: варианты
// перебирают ноты от E4 до C6, и рукописная таблица однажды разойдётся с нотой.

const SEMITONE: Record<string, number> = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5,
  'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
}

export function noteToFreq(note: string): number {
  const m = /^([A-G][#b]?)(-?\d)$/.exec(note.trim())
  if (!m) throw new Error(`mealChime: not a note — “${note}”`)
  const semi = SEMITONE[m[1]]
  const octave = Number(m[2])
  // MIDI: A4 = 69, C-1 = 0.
  const midi = (octave + 1) * 12 + semi
  return 440 * Math.pow(2, (midi - 69) / 12)
}

// ─── Раскладка голоса во времени ─────────────────────────────────────────────

export interface VoiceShape {
  /** Шаг между нотами, с. */
  step: number
  /** Длина затухания одной ноты, с. */
  decay: number
  /** Пиковая громкость основной ноты. */
  peak: number
  /** Громкость октавного обертона (0 — обертона нет). */
  overtone: number
  type: OscillatorType
}

/** Атака одинакова у всех голосов — это и есть «колокол»: удар, потом затухание. */
export const ATTACK_S = 0.005

export const VOICE_SHAPE: Record<ChimeVoice, VoiceShape> = {
  // Ярко: короткий шаг, звонкое затухание, обертон октавой выше.
  start:    { step: 0.16, decay: 0.85, peak: 0.32, overtone: 0.11, type: 'triangle' },
  // Мягче и ниже: шаг длиннее, пик тише, обертона нет.
  reminder: { step: 0.20, decay: 0.70, peak: 0.20, overtone: 0,    type: 'sine' },
  // Нейтрально и низко: самый длинный шаг, долгий хвост.
  close:    { step: 0.28, decay: 1.10, peak: 0.18, overtone: 0,    type: 'sine' },
}

export interface ScheduledTone {
  freq: number; at: number; decay: number; peak: number; type: OscillatorType
  /** Частота, к которой нота СКОЛЬЗИТ за своё затухание. Пусто — высота держится. */
  glideTo?: number
}

/**
 * Что именно прозвучит — чистая функция. Проба смотрит сюда, а не «слышно ли»:
 * услышать машиной нельзя, а проверить расписание нот — можно.
 */
export function scheduleTones(variant: ChimeVariantKey, voice: ChimeVoice, t0 = 0): ScheduledTone[] {
  const shape = VOICE_SHAPE[voice]
  const { notes } = phraseFor(variant, voice)
  const out: ScheduledTone[] = []
  notes.forEach((n, i) => {
    const freq = noteToFreq(n)
    const at = t0 + i * shape.step
    out.push({ freq, at, decay: shape.decay, peak: shape.peak, type: shape.type })
    if (shape.overtone > 0) {
      out.push({ freq: freq * 2, at, decay: shape.decay * 0.6, peak: shape.overtone, type: shape.type })
    }
  })
  return out
}

// ─── Живой звук ──────────────────────────────────────────────────────────────
// iOS: AudioContext рождается «suspended» и оживает ТОЛЬКО внутри обработчика
// касания. Пока не оживили — играть нечего, и врать плашкой «сейчас зазвонит»
// нельзя: до первого касания дня плашка беззвучная и так и говорит.

type Ctor = new () => AudioContext
let ctx: AudioContext | null = null
let unlocked = false
const listeners = new Set<() => void>()
let version = 0

function emit() { version++; for (const l of listeners) l() }

export function subscribeChime(cb: () => void): () => void {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}
export function getChimeVersion(): number { return version }
export function isAudioUnlocked(): boolean { return unlocked }

function getCtor(): Ctor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { AudioContext?: Ctor; webkitAudioContext?: Ctor }
  return w.AudioContext ?? w.webkitAudioContext ?? null
}

/**
 * Разблокировать звук. Звать ТОЛЬКО из обработчика настоящего касания/клика —
 * иначе iOS оставит контекст спящим и вернёт «разблокировано» ложно.
 */
export async function unlockAudio(): Promise<boolean> {
  const Ctor = getCtor()
  if (!Ctor) return false
  try {
    if (!ctx) ctx = new Ctor()
    if (ctx.state === 'suspended') await ctx.resume()
    // Беззвучный щелчок: некоторым WebKit'ам мало resume() — нужен реальный узел,
    // созданный внутри жеста, иначе первый настоящий звук проглатывается.
    const g = ctx.createGain()
    g.gain.value = 0
    g.connect(ctx.destination)
    const o = ctx.createOscillator()
    o.connect(g)
    o.start()
    o.stop(ctx.currentTime + 0.01)
    const nowUnlocked = ctx.state === 'running'
    if (nowUnlocked !== unlocked) { unlocked = nowUnlocked; emit() }
    return unlocked
  } catch {
    return false
  }
}

/**
 * Сыграть голос. Возвращает false, если звук ещё не разблокирован — молча, без
 * попытки: провалившийся play() на iOS печатает ошибку в консоль, которой у
 * планшета всё равно никто не видит.
 */
export function playChime(variant: ChimeVariantKey, voice: ChimeVoice): boolean {
  if (!playTones(scheduleTones(variant, voice))) return false
  // Прозвучавшее объявляется событием. Услышать звук машиной нельзя, а
  // «прозвенело ли в 11:30» — единственное, что проба обязана подтвердить;
  // без этого проверялась бы только картинка. Слушателей в обычной работе нет,
  // событие ничего не стоит.
  try {
    window.dispatchEvent(new CustomEvent('mm:chime', { detail: { variant, voice } }))
  } catch { /* нет window (тест в node) — событие не нужно */ }
  return true
}

/**
 * Сыграть готовое расписание тонов. Времена в `tones` отсчитываются ОТ НУЛЯ —
 * контекст добавляет свой «сейчас» сам, поэтому одну и ту же чистую раскладку
 * можно и проверить тестом, и отдать в динамик.
 *
 * Отдельная функция появилась вместе с ярусами «капля» и «горн» (04.08): у них
 * своя раскладка, а конверт колокола, глушитель и защита от неразблокированного
 * звука обязаны быть ОДНИ на все голоса устройства. Второй такой цикл рядом —
 * это второй набор правил, который однажды разойдётся с первым.
 */
export function playTones(tones: readonly ScheduledTone[]): boolean {
  // Тумблер «тихий час» глушит ЛЮБОЙ звук устройства и делает это здесь, в
  // единственном месте, где звук рождается: проверка в вызывающем коде — это
  // проверка, которую однажды забудут добавить новому голосу.
  if (isMuted()) return false
  if (!unlocked || !ctx) return false
  try {
    const t0 = ctx.currentTime + 0.02
    for (const tone of tones) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = tone.type
      osc.frequency.setValueAtTime(tone.freq, t0 + tone.at)
      if (tone.glideTo && tone.glideTo > 0) {
        // Капля: высота ПАДАЕТ по ходу ноты — это и делает её каплей, а не писком.
        osc.frequency.exponentialRampToValueAtTime(tone.glideTo, t0 + tone.at + tone.decay)
      }
      // Колокол: мгновенный удар, затем экспоненциальный хвост. Ноль в
      // exponentialRamp недопустим — отсюда 0.0001 как «практический ноль».
      gain.gain.setValueAtTime(0.0001, t0 + tone.at)
      gain.gain.exponentialRampToValueAtTime(tone.peak, t0 + tone.at + ATTACK_S)
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + tone.at + tone.decay)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(t0 + tone.at)
      osc.stop(t0 + tone.at + tone.decay + 0.05)
    }
    return true
  } catch {
    return false
  }
}

/** Прослушивание из настроек: сначала разблокировать (это жест), потом сыграть. */
export async function previewChime(variant: ChimeVariantKey, voice: ChimeVoice = 'start'): Promise<boolean> {
  await unlockAudio()
  return playChime(variant, voice)
}

/** Только для проб. */
export function __resetChimeAudio(): void { ctx = null; unlocked = false; emit() }
