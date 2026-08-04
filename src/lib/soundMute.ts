// src/lib/soundMute.ts
// MenuMaker · Тумблер «тихий час» — один выключатель на ВСЕ звуки устройства.
//
// ЗАЧЕМ ОН ЕСТЬ. В группе бывает тихий час, и планшет, который в это время поёт
// песенку обеда, будят детей. Без законного способа заглушить его заглушат
// незаконным: убавят громкость на самом планшете или уберут его в шкаф — и тогда
// молчать он будет и завтра, и через неделю, а никто об этом знать не будет.
// Тумблер существует, чтобы молчание было ЯВНЫМ и НАЗВАННЫМ.
//
// ЧТО ТУМБЛЕР НЕ ГЛУШИТ (решение владельца 04.08):
//   · пульсацию плашки — она видимая и никого не будит;
//   · ступень директора на 15-й минуте — это не звук, а сообщение о деньгах.
// Именно поэтому строка «sound muted since HH:MM» уходит В САМО сообщение:
// директор обязан видеть, что класс сигнала НЕ СЛЫШАЛ, иначе он решит, что там
// слышали и не пошли.
//
// ХРАНЕНИЕ — НА УСТРОЙСТВЕ. Тумблер принадлежит планшету, а не человеку и не
// центру: заглушают конкретную комнату на конкретный час. localStorage переживает
// перезагрузку, а вместе с состоянием живёт и журнал включений/выключений.

const KEY_ON = 'mm_sound_muted'
const KEY_SINCE = 'mm_sound_muted_at'
const KEY_LOG = 'mm_sound_mute_log'

/** Сколько записей журнала держим на устройстве. Больше незачем: журнал читают
 *  «что было сегодня», а не «что было в марте». */
export const MUTE_LOG_LIMIT = 40

export interface MuteLogEntry {
  /** ISO-время события. */
  at: string
  /** true — заглушили, false — вернули звук. */
  on: boolean
  /** Чем себя назвало устройство (метка планшета или комната). */
  device: string
}

const listeners = new Set<() => void>()
function emit() { for (const l of listeners) l() }

export function subscribeMute(cb: () => void): () => void {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}

export function isMuted(): boolean {
  try { return localStorage.getItem(KEY_ON) === '1' } catch { return false }
}

/** ISO-время, с которого длится тишина. null — звук не заглушен. */
export function mutedSinceISO(): string | null {
  if (!isMuted()) return null
  try { return localStorage.getItem(KEY_SINCE) } catch { return null }
}

/** HH:MM локального времени, с которого длится тишина (для строки в сообщении). */
export function mutedSinceHHMM(): string | null {
  const iso = mutedSinceISO()
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/**
 * Строка о тишине для сообщения директору. ЧИСТАЯ функция — проверяется тестом.
 * null, когда звук не заглушен: приписывать «звук включён» не нужно, это норма.
 */
export function muteNoteLine(sinceHHMM: string | null): string | null {
  return sinceHHMM ? `sound muted since ${sinceHHMM}` : null
}

export function muteLog(): MuteLogEntry[] {
  try {
    const raw = localStorage.getItem(KEY_LOG)
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? (arr as MuteLogEntry[]) : []
  } catch { return [] }
}

/** Дописать запись в журнал, срезав хвост. Чистая часть вынесена ради теста. */
export function appendMuteLog(
  prev: readonly MuteLogEntry[], entry: MuteLogEntry, limit = MUTE_LOG_LIMIT,
): MuteLogEntry[] {
  return [entry, ...prev].slice(0, limit)
}

/**
 * Включить/выключить тишину. `device` — как устройство себя называет (метка
 * планшета, иначе комната): в журнале «кто-то заглушил» бесполезно.
 */
export function setMuted(on: boolean, device: string, nowISO = new Date().toISOString()): void {
  try {
    if (on) {
      localStorage.setItem(KEY_ON, '1')
      localStorage.setItem(KEY_SINCE, nowISO)
    } else {
      localStorage.removeItem(KEY_ON)
      localStorage.removeItem(KEY_SINCE)
    }
    localStorage.setItem(KEY_LOG, JSON.stringify(appendMuteLog(muteLog(), { at: nowISO, on, device })))
  } catch {
    /* хранилище заблокировано — тумблер сработает на эту сессию и не запомнится;
       врать об этом нечем, состояние всё равно читается из того же места */
  }
  emit()
}

/** Только для проб. */
export function __resetMute(): void {
  try {
    localStorage.removeItem(KEY_ON); localStorage.removeItem(KEY_SINCE); localStorage.removeItem(KEY_LOG)
  } catch { /* нет хранилища — сбрасывать нечего */ }
  emit()
}
