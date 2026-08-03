// src/lib/ritualClock.ts
// MenuMaker · Часы ритуала «Пристегни ремни».
//
// ЗАЧЕМ ОТДЕЛЬНЫЕ ЧАСЫ. Ритуал целиком построен на «который сейчас час»: окно
// открылось, окно закрылось, за десять минут до конца. Проверить это, не умея
// подвинуть стрелки, невозможно — пришлось бы ждать 11:30 живьём и надеяться, что
// в этот момент кто-то смотрит. Поэтому время ритуала берётся ОДНОЙ функцией,
// и только у неё есть подмена.
//
// 🔒 ПОДМЕНА РАБОТАЕТ ТОЛЬКО НА localhost. Это не украшение: экран счёта — клеймовый,
// и «show me a fake clock» на боевом адресе означал бы, что человек видит окно,
// которого нет, и отмечает не то. Проверка идёт по hostname, а не по флагу сборки:
// проба гоняет НАСТОЯЩУЮ прод-сборку на локальном preview, поэтому import.meta.env.DEV
// там false, и гейт по нему пропустил бы пробу мимо цели.
//
// Подменяется ТОЛЬКО время суток и день недели ритуала. Дата, под которой пишутся
// отметки, остаётся настоящей всегда: часы ритуала не смеют переносить отметку
// в другой день — это была бы порча клеймовых данных ради удобства пробы.

export type RitualDayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri'

const DAY_BY_INDEX: Record<number, RitualDayKey | null> = {
  0: null, 1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri', 6: null,
}

function overrideAllowed(): boolean {
  if (typeof window === 'undefined') return false
  const h = window.location.hostname
  return h === 'localhost' || h === '127.0.0.1' || h === '[::1]'
}

interface Override { atMinutes: number; day: RitualDayKey | null; setAt: number }
let override: Override | null = null
let overrideRead = false

/** `?mm_clock=HH:MM` (+ `&mm_day=tue`) — читается один раз за загрузку страницы. */
function readOverride(): Override | null {
  if (overrideRead) return override
  overrideRead = true
  if (!overrideAllowed()) return (override = null)
  const p = new URLSearchParams(window.location.search)
  const clock = p.get('mm_clock')
  if (!clock) return (override = null)
  const m = /^(\d{1,2}):(\d{2})$/.exec(clock.trim())
  if (!m) return (override = null)
  const atMinutes = Number(m[1]) * 60 + Number(m[2])
  const dayRaw = (p.get('mm_day') ?? '').toLowerCase()
  const day = (['mon', 'tue', 'wed', 'thu', 'fri'] as const).find((d) => d === dayRaw) ?? null
  override = { atMinutes, day, setAt: Date.now() }
  return override
}

/** Только для проб: поставить/снять подмену вручную (в браузере — из строки адреса). */
export function __setRitualOverride(o: { atMinutes: number; day?: RitualDayKey | null } | null): void {
  overrideRead = true
  override = o ? { atMinutes: o.atMinutes, day: o.day ?? null, setAt: Date.now() } : null
}

export function isRitualClockOverridden(): boolean {
  return readOverride() !== null
}

/** Минуты от полуночи. Подменённые часы ИДУТ: поставили 11:29 — через минуту 11:30. */
export function ritualMinutes(now: Date = new Date()): number {
  const o = readOverride()
  if (o) return (o.atMinutes + Math.floor((Date.now() - o.setAt) / 60000)) % 1440
  return now.getHours() * 60 + now.getMinutes()
}

/** День недели ритуала. Суббота и воскресенье → null: ритуала в выходной нет. */
export function ritualDay(now: Date = new Date()): RitualDayKey | null {
  const o = readOverride()
  if (o && o.day) return o.day
  return DAY_BY_INDEX[now.getDay()] ?? null
}

export function hhmm(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/** 'HH:MM[:SS]' → минуты от полуночи; мусор → null (расписание бывает пустым). */
export function parseHHMM(t: string | null | undefined): number | null {
  if (!t) return null
  const m = /^(\d{1,2}):(\d{2})/.exec(t.trim())
  if (!m) return null
  const h = Number(m[1]), min = Number(m[2])
  if (h > 23 || min > 59) return null
  return h * 60 + min
}
