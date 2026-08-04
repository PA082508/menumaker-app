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
  activeRitualWindow, bannerState, buildWindows, unbuckledWindows,
  type BannerState, type MealWindow, type ScheduleRow, type UnbuckledWindow,
} from '@/lib/mealWindows'
import { ritualDue, type RitualEventKind } from '@/lib/ritualEvents'
import { ritualDay, ritualMinutes, hhmm, type RitualDayKey } from '@/lib/ritualClock'
import { isAudioUnlocked, playChime, subscribeChime, unlockAudio, type ChimeVariantKey } from '@/lib/mealChime'
import { playBugle } from '@/lib/soundKit'

/**
 * События с памятью «ровно один раз». `close` больше НЕ звучит: карта звуков
 * 04.08 закрывает окно молча — красный список остаётся только видимостью.
 * Ключ 'close' удалён вместе со звонком, а не оставлен «на всякий случай»:
 * мёртвый ключ завтра прочитают как живое поведение.
 */
export type RitualEvent = RitualEventKind

/** Как часто пересчитывать. 15 с: окно открывается в минуту, и опоздать на минуту
 *  «можно начинать» — значит опоздать по-настоящему; чаще смысла нет. */
const TICK_MS = 15000

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
  /**
   * 15-я минута пустого окна — позвать директора центра. Хук НЕ знает, каким
   * рельсом: он называет ЧТО случилось, отправку делает страница. Иначе арифметика
   * ритуала потянула бы за собой базу и перестала проверяться чистым тестом.
   * Обещание вызывающему: на одно окно за день — ровно один вызов.
   */
  onDirectorAlert?: (w: MealWindow) => void
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
    isSlotMarked, isCenterSlotMarked, variant, onOpenSlot, onDirectorAlert,
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
  // activeRitualWindow, а не activeWindow: завтрак «по мере прихода» ритуал не ведёт,
  // и плашка с 30-минутным отсчётом над ним не появляется вовсе (решение 03.08).
  const active = useMemo(() => (live ? activeRitualWindow(windows, nowMin) : null), [live, windows, nowMin])

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
  const onAlertRef = useRef(onDirectorAlert)
  onAlertRef.current = onDirectorAlert

  useEffect(() => {
    if (!live || !classroomId) return
    // ЧТО делать — решает чистая функция (lib/ritualEvents.ts), здесь остаётся
    // только исполнение. Так вся лестница окна проверяется машиной, а не глазами
    // в 9:25, и «после перезагрузки повторов нет» — это второй прогон по той же
    // памяти в пробе, а не рассуждение.
    for (const ev of ritualDue({
      windows, nowMin, dateISO: todayISO, classroomId,
      isMarked: (slot) => markedRef.current(slot),
      hasRung: alreadyRang,
    })) {
      rememberRang(ev.key)
      switch (ev.kind) {
        case 'start':
          onOpenRef.current?.(ev.window.slot)   // табло само загорается
          playChime(variant, 'start')
          break
        case 'reminder':
          playChime(variant, 'reminder')
          break
        case 'horn':
          playBugle()
          break
        case 'director':
          // Память поставлена ДО отправки нарочно: повторить сообщение директору
          // хуже, чем не отправить второй раз. Не дошло — видно по пустому ящику,
          // а пять одинаковых писем про один снек он перестанет читать вовсе.
          onAlertRef.current?.(ev.window)
          break
      }
    }
  }, [live, windows, nowMin, todayISO, classroomId, variant])

  const unlock = useCallback(() => { void unlockAudio() }, [])

  return { nowMin, day, active, banner, unbuckled, audioUnlocked, unlock }
}
