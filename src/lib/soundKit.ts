// src/lib/soundKit.ts
// MenuMaker · Ярусы «капля» и «горн» + голос устройства.
//
// КАРТА ЗВУКОВ (утверждена владельцем 03.08, ярусы закреплены 04.08):
//   капля   — персонал: чек-ин учителя (одна), чек-аут (две). Тише всего: это
//             расписка самому себе, её слышит тот, кто нажал, и никто больше.
//   песенка — старт окна питания и напоминание за 10 минут (lib/mealChime.ts).
//   горн    — 10-я минута окна при НУЛЕ отметок. Громче и резче песенки нарочно:
//             песенка приглашает, горн будит. Один раз на окно.
//   голос   — письменная квитанция, прочитанная вслух (передачи ребёнка) и отказ
//             записи отметки. Голосом говорят только то, что и так написано на
//             экране: если голос скажет больше написанного, проверять будет нечего.
//
// ВСЁ СИНТЕЗОМ, БЕЗ ФАЙЛОВ — по той же причине, что и песенка: звуковой файл
// может не докачаться, вылететь из кэша или потеряться при обновлении сборки, и
// тогда устройство молчит ровно в тот день, когда сеть плохая.
//
// ГЛУШИТЕЛЬ ОДИН на все ярусы и живёт НИЖЕ них (playTones / speakLine), а не в
// вызывающем коде: проверка «а не заглушено ли» в каждом вызове — это проверка,
// которую однажды забудут добавить новому голосу.

import { isAudioUnlocked, playTones, type ScheduledTone } from './mealChime'
import { isMuted } from './soundMute'

// ─── Капля ───────────────────────────────────────────────────────────────────
// Настоящая капля — это падение высоты, а не писк: синус скользит сверху вниз за
// 120 мс. Две капли (чек-аут) — та же капля дважды с ощутимым зазором: две ноты
// подряд слились бы в трель и перестали читаться как «две».

const DROP_FROM = 950
const DROP_TO = 330
const DROP_DECAY = 0.16
const DROP_GAP = 0.22

/** Чистая раскладка капли (одной или двух). Проба смотрит сюда. */
export function dropTones(times: 1 | 2): ScheduledTone[] {
  const out: ScheduledTone[] = []
  for (let i = 0; i < times; i++) {
    out.push({
      freq: DROP_FROM, glideTo: DROP_TO, at: i * DROP_GAP,
      decay: DROP_DECAY, peak: 0.16, type: 'sine',
    })
  }
  return out
}

// ─── Горн ────────────────────────────────────────────────────────────────────
// Сигнальный рожок: пила вместо синуса (богатые обертоны — то, что делает звук
// «медным»), восходящая триада с возвратом, пик выше песенки. Он обязан
// перебивать шум комнаты, где двадцать детей едят.

const BUGLE_NOTES = [523.25, 659.25, 783.99, 659.25, 783.99] // C5 E5 G5 E5 G5

export function bugleTones(): ScheduledTone[] {
  return BUGLE_NOTES.map((freq, i) => ({
    freq,
    at: i * 0.15,
    decay: i === BUGLE_NOTES.length - 1 ? 0.55 : 0.22,
    // Выше пика песенки старта (0.32 в VOICE_SHAPE) — нарочно и с запасом:
    // горн обязан перебивать комнату, где двадцать детей едят.
    peak: 0.36,
    type: 'sawtooth' as OscillatorType,
  }))
}

// ─── Проигрывание ────────────────────────────────────────────────────────────
// Событие `mm:sound` — тот же приём, что у песенки: услышать звук машиной нельзя,
// а «прозвучал ли горн на 10-й минуте» проба обязана подтвердить.

export type DeviceSound = 'drop_in' | 'drop_out' | 'bugle'

function announce(kind: DeviceSound | 'speech', detail: Record<string, unknown> = {}) {
  try {
    window.dispatchEvent(new CustomEvent('mm:sound', { detail: { kind, ...detail } }))
  } catch { /* нет window (тест в node) — событие не нужно */ }
}

/** Чек-ин учителя — одна капля. */
export function playDropIn(): boolean {
  if (!playTones(dropTones(1))) return false
  announce('drop_in')
  return true
}

/** Чек-аут учителя — две капли. */
export function playDropOut(): boolean {
  if (!playTones(dropTones(2))) return false
  announce('drop_out')
  return true
}

/** 10-я минута окна при нуле отметок. */
export function playBugle(): boolean {
  if (!playTones(bugleTones())) return false
  announce('bugle')
  return true
}

// ─── Голос ───────────────────────────────────────────────────────────────────
/**
 * Сказать строку вслух. Синтез речи браузера — ни файлов, ни внешней службы,
 * ничего не уходит с устройства (имя ребёнка вслух в комнате — это не то же
 * самое, что имя ребёнка, отправленное в чужую службу синтеза).
 *
 * Разблокировка та же, что у песенки: на iOS речь без предшествующего касания
 * молча не звучит, поэтому спрашиваем ровно тот же флаг — иначе экран считал бы
 * сказанным то, чего никто не слышал.
 */
export function speakLine(text: string, lang = 'en-US'): boolean {
  if (!text.trim()) return false
  if (isMuted()) return false
  if (!isAudioUnlocked()) return false
  try {
    const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined
    if (!synth) return false
    // Предыдущая фраза обрывается: две квитанции внахлёст не разобрать, а важнее
    // всегда последняя — очередь у двери движется.
    synth.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = lang
    u.rate = 0.95
    u.pitch = 1
    u.volume = 1
    synth.speak(u)
    announce('speech', { text })
    return true
  } catch {
    return false
  }
}

/** Есть ли на устройстве синтез речи вообще. Нет — голосовой ярус молчит, и
 *  сказать об этом честнее, чем притвориться, что сказали. */
export function speechAvailable(): boolean {
  try { return typeof window !== 'undefined' && 'speechSynthesis' in window } catch { return false }
}
