// src/hooks/useMealRitual.ts
// MenuMaker · «Пристегни ремни» — сведение часов, окон, звука и экрана.
//
// Вся арифметика живёт в lib/mealWindows.ts, все голоса — в lib/mealChime.ts.
// Здесь только то, что нельзя проверить чистой функцией: тик времени, ОДИН звонок
// на событие и переключение экрана на текущий приём.
//
// ПОЧЕМУ ЗВОНОК ЗАПОМИНАЕТСЯ В localStorage, А НЕ В ПАМЯТИ. Планшет в группе
// перезагружают, и приложение переоткрывают. Память о звонке, живущая в React,
// исчезает вместе с вкладкой — и обед звонил бы заново каждый раз, когда кто-то
// потянул страницу вниз. Ключ несёт дату: назавтра всё звонит заново, как и надо.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  activeWindow, bannerState, buildWindows, phaseOf, unbuckledWindows,
  type BannerState, type MealWindow, type ScheduleRow, type UnbuckledWindow,
} from '@/lib/mealWindows'
import { ritualDay, ritualMinutes, hhmm, type RitualDayKey } from '@/lib/ritualClock'
import { isAudioUnlocked, playChime, subscribeChime, unlockAudio, type ChimeVariantKey } from '@/lib/mealChime'

export type RitualEvent = 'start' | 'reminder' | 'close'

/** Как часто пересчитывать. 15 с: окно открывается в минуту, и опоздать на минуту
 *  «можно начинать» — значит опоздать по-настоящему; чаще смысла нет. */
const TICK_MS = 15000

function ringKey(dateISO: string, classroomId: string, slot: string, ev: RitualEvent) {
  return `mm_ritual_${dateISO}_${classroomId}_${slot}_${ev}`
}
function alreadyRang(k: string): boolean {
  try { return localStorage.getItem(k) === '1' } catch { return false }
}
function rememberRang(k: string) {
  try { localStorage.setItem(k, '1') } catch { /* хранилище заблокировано — прозвоним ещё раз, это не беда */ }
}

export interface RitualInput {
  /** Ритуал идёт только когда показанная неделя содержит сегодняшний день. */
  enabled: boolean
  /** Дата, под которой пишутся отметки (yyyy-MM-dd) — ключ памяти о звонках. */
  todayISO: string
  classroomId: string
  /** Расписание выбранного класса. */
  rows: readonly ScheduleRow[]
  /** Расписание всех классов центра + имена комнат — для красного списка. */
  centerRows: readonly (ScheduleRow & { classroomName: string })[]
  /** Есть ли хоть одна отметка в приёме у выбранного класса (сегодня). */
  isSlotMarked: (slot: string) => boolean
  /** Есть ли отметки у любого класса центра (сегодня). */
  isCenterSlotMarked: (classroomId: string, slot: string) => boolean
  variant: ChimeVariantKey
  /** Переключить экран на приём, чьё окно открылось. */
  onOpenSlot?: (slot: string) => void
}

export interface RitualOutput {
  nowMin: number
  day: RitualDayKey | null
  active: MealWindow | null
  banner: BannerState
  unbuckled: UnbuckledWindow[]
  audioUnlocked: boolean
  /** Позвать ИЗ ОБРАБОТЧИКА КАСАНИЯ — иначе iOS не оживит звук. */
  unlock: () => void
}

export function useMealRitual(input: RitualInput): RitualOutput {
  const {
    enabled, todayISO, classroomId, rows, centerRows,
    isSlotMarked, isCenterSlotMarked, variant, onOpenSlot,
  } = input

  const [nowMin, setNowMin] = useState(() => ritualMinutes())
  const [day, setDay] = useState<RitualDayKey | null>(() => ritualDay())
  const [audioTick, setAudioTick] = useState(0)

  useEffect(() => {
    const t = setInterval(() => { setNowMin(ritualMinutes()); setDay(ritualDay()) }, TICK_MS)
    return () => clearInterval(t)
  }, [])
  useEffect(() => subscribeChime(() => setAudioTick((v) => v + 1)), [])
  const audioUnlocked = useMemo(() => isAudioUnlocked(), [audioTick])

  const windows = useMemo(() => buildWindows(rows), [rows])
  const centerWindows = useMemo(
    () => centerRows
      .map((r) => {
        const w = buildWindows([r])[0]
        return w ? { ...w, classroomName: r.classroomName } : null
      })
      .filter((w): w is MealWindow & { classroomName: string } => w !== null),
    [centerRows],
  )

  const live = enabled && day !== null
  const active = useMemo(() => (live ? activeWindow(windows, nowMin) : null), [live, windows, nowMin])

  // Время первой замеченной отметки. Это наблюдение ЭТОГО устройства, а не
  // выписка из журнала: если отметили на другом планшете, а здесь только
  // перечитали, метки времени нет — тогда плашка говорит «отмечен» без часа.
  // Придумать час было бы хуже, чем не показать его.
  const [markStamps, setMarkStamps] = useState<Record<string, string>>({})
  const activeMarked = active ? isSlotMarked(active.slot) : false
  useEffect(() => {
    if (!active || !activeMarked) return
    const k = `${todayISO}|${classroomId}|${active.slot}`
    setMarkStamps((prev) => (prev[k] ? prev : { ...prev, [k]: hhmm(ritualMinutes()) }))
  }, [active, activeMarked, todayISO, classroomId])

  const banner = useMemo(
    () => (live
      ? bannerState(active, nowMin, activeMarked,
          active ? markStamps[`${todayISO}|${classroomId}|${active.slot}`] ?? null : null,
          audioUnlocked)
      : bannerState(null, nowMin, false, null, audioUnlocked)),
    [live, active, nowMin, activeMarked, markStamps, todayISO, classroomId, audioUnlocked],
  )

  const unbuckled = useMemo(
    () => (live
      ? unbuckledWindows(centerWindows, nowMin, (w) => isCenterSlotMarked(w.classroom_id ?? '', w.slot))
      : []),
    [live, centerWindows, nowMin, isCenterSlotMarked],
  )

  // ─── Звонки. Ровно один на событие, окно и день ────────────────────────────
  const onOpenRef = useRef(onOpenSlot)
  onOpenRef.current = onOpenSlot
  const markedRef = useRef(isSlotMarked)
  markedRef.current = isSlotMarked

  useEffect(() => {
    if (!live || !classroomId) return
    for (const w of windows) {
      const ph = phaseOf(w, nowMin)
      // «По мере прихода» (завтрак) старт не объявляет: у него нет минуты, в
      // которую можно начинать, а подсказка «начинайте» толкала бы к ранней
      // подаче — ровно к тому, за что снимают возмещение (канон 31.07).
      if (!w.onArrival && (ph === 'open' || ph === 'reminder')) {
        const k = ringKey(todayISO, classroomId, w.slot, 'start')
        if (!alreadyRang(k)) {
          rememberRang(k)
          onOpenRef.current?.(w.slot)          // табло само загорается
          playChime(variant, 'start')
        }
      }
      if (ph === 'reminder' && !markedRef.current(w.slot)) {
        const k = ringKey(todayISO, classroomId, w.slot, 'reminder')
        if (!alreadyRang(k)) { rememberRang(k); playChime(variant, 'reminder') }
      }
      if (ph === 'closed' && !markedRef.current(w.slot)) {
        const k = ringKey(todayISO, classroomId, w.slot, 'close')
        // Закрытие звонит только по свежему следу: открыли планшет вечером —
        // молча, иначе он отыграет весь пропущенный день подряд.
        if (!alreadyRang(k) && nowMin - w.end <= 5) { rememberRang(k); playChime(variant, 'close') }
      }
    }
  }, [live, windows, nowMin, todayISO, classroomId, variant])

  const unlock = useCallback(() => { void unlockAudio() }, [])

  return { nowMin, day, active, banner, unbuckled, audioUnlocked, unlock }
}
