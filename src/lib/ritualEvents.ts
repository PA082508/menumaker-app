// src/lib/ritualEvents.ts
// MenuMaker · Что ритуал обязан сделать ИМЕННО СЕЙЧАС — чистой функцией.
//
// ПОЧЕМУ ОТДЕЛЬНО ОТ ХУКА. Лестница окна (песенка · горн · сообщение директору ·
// напоминание · тишина на закрытии) — это правило, которое иначе проверяется
// глазами в 9:25 и ровно один раз в день. Пока решение жило внутри useEffect, у
// него не было ни одного способа быть проверенным машиной: эффект нельзя позвать
// без React, а React — без браузера, которого у пробы нет.
//
// Здесь нет ни звука, ни базы, ни экрана: на входе — окна, час и память о том,
// что уже звучало; на выходе — список событий. Исполнение (сыграть, отправить,
// запомнить) остаётся хуку.
//
// ПАМЯТЬ — ВХОДНОЙ ПАРАМЕТР, а не переменная модуля. Так «после перезагрузки
// повторов нет» проверяется вторым прогоном по той же памяти, а не рассуждением.

import { alertStage, phaseOf, ritualLed, type MealWindow } from './mealWindows'

/**
 * `close` в этом списке НЕТ и не будет: карта звуков 04.08 закрывает окно молча.
 * Конец окна ничего не исправляет, а звук в этот момент читается как «поздно,
 * не трогай» — ровно наоборот тому, что нужно. Пустое окно подбирает красный
 * список, и только глазами.
 */
export type RitualEventKind = 'start' | 'reminder' | 'horn' | 'director'

export interface DueEvent {
  kind: RitualEventKind
  window: MealWindow
  /** Ключ памяти «это уже было» — он же ключ localStorage у хука. */
  key: string
}

export function ritualEventKey(
  dateISO: string, classroomId: string, slot: string, kind: RitualEventKind,
): string {
  return `mm_ritual_${dateISO}_${classroomId}_${slot}_${kind}`
}

export interface RitualDueInput {
  windows: readonly MealWindow[]
  nowMin: number
  dateISO: string
  classroomId: string
  /** Есть ли хоть одна отметка в этом приёме сегодня. */
  isMarked: (slot: string) => boolean
  /** Уже звучало? (у хука — localStorage). */
  hasRung: (key: string) => boolean
}

/**
 * События, которые должны произойти в эту минуту. Порядок в списке — порядок
 * исполнения: сначала то, что зовёт комнату, и только потом то, что зовёт
 * директора.
 */
export function ritualDue(i: RitualDueInput): DueEvent[] {
  const out: DueEvent[] = []
  const push = (kind: RitualEventKind, w: MealWindow) => {
    const key = ritualEventKey(i.dateISO, i.classroomId, w.slot, kind)
    if (!i.hasRung(key)) out.push({ kind, window: w, key })
  }

  for (const w of i.windows) {
    // Завтрак «по мере прихода» ритуал не ведёт ЦЕЛИКОМ (решение владельца 03.08):
    // у такого окна нет минуты, в которую «можно начинать», и любой голос над ним
    // толкает к ранней подаче — к тому, за что снимают возмещение.
    if (!ritualLed(w)) continue

    const ph = phaseOf(w, i.nowMin)
    const marked = i.isMarked(w.slot)

    if (ph === 'open' || ph === 'reminder') push('start', w)
    if (ph === 'reminder' && !marked) push('reminder', w)

    const stage = alertStage(w, i.nowMin, marked)
    if (stage === 'horn' || stage === 'director') push('horn', w)
    if (stage === 'director') push('director', w)
  }
  return out
}
