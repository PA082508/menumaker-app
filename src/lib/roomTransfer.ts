// src/lib/roomTransfer.ts
// Перевод ребёнка в другую комнату — СОБЫТИЕ с датой действия, а не правка поля.
//
// ПОВОД (замер 04.08). У поля `classroom_id` стоял документный замок с текстом
// про «enrollment or transfer form», и событий с этим ключом за всё время было
// НОЛЬ. Это не дисциплина: transfer form в природе центра не существует, а «со
// слов» было запрещено — значит комнату меняли мимо системы или не меняли вовсе.
//
// ЧТО ТЕПЕРЬ. Замок снят до уровня `marked` (со слов можно, и это помечается), а
// рядом с правкой поля пишется строка истории: откуда, куда, С КАКОГО ДНЯ и
// почему. Дата действия — не дата ввода: ребёнка переводят с понедельника, а
// вносят в четверг, и путать это значит считать ратио и катмап не за те дни.
//
// ЧЕГО ЗДЕСЬ НЕТ НАРОЧНО:
//   · `date_in` не участвует ВОВСЕ. Его затирание при переводе было прежним
//     корнем дрейфа: ребёнок «поступал» заново при каждом переезде из комнаты в
//     комнату, и стаж в центре терялся.
//   · прошлые недельные строки не трогаются. `meal_week_records` замораживает
//     `classroom_id` в самой строке недели (замер: заполнен у всех, 0 пустых),
//     поэтому июль остаётся в старой комнате сам собой — переписывать нечего.

import { supabase } from '@/lib/supabase'

export interface RoomTransfer {
  orgId: string
  centerId: string
  rosterId: string
  fromClassroomId: string | null
  toClassroomId: string
  /** Transfer Date — день, С КОТОРОГО ребёнок в новой комнате. */
  effectiveFrom: string
  reason: string | null
  enteredBy: string | null
  enteredByName: string | null
}

/**
 * Отказ до сети: перевод без даты действия. ЧИСТАЯ — проверяется пробой.
 *
 * Дата обязательна не из педантизма: без неё нельзя сказать, с какого дня
 * считать ребёнка в новой комнате, а значит нельзя ни собрать ратио, ни
 * объяснить проверяющему, почему в понедельник он числился в одной комнате, а в
 * среду в другой.
 */
export function transferRefusal(toClassroomId: string | null, effectiveFrom: string | null): string | null {
  if (!toClassroomId) return null           // комнату не меняли — переводить нечего
  if (!effectiveFrom || !effectiveFrom.trim()) {
    return 'A room transfer needs a transfer date — the day the child starts in the new room, not today. ' +
           'Weekly counts and ratios are read from that day.'
  }
  return null
}

/** Записать перевод. Возвращает текст отказа или null. */
export async function recordRoomTransfer(t: RoomTransfer): Promise<string | null> {
  const { error } = await supabase.schema('menumaker').from('child_room_history').insert({
    org_id: t.orgId, center_id: t.centerId, roster_id: t.rosterId,
    from_classroom_id: t.fromClassroomId, to_classroom_id: t.toClassroomId,
    effective_from: t.effectiveFrom, reason: t.reason,
    entered_by: t.enteredBy, entered_by_name: t.enteredByName,
  })
  return error ? error.message : null
}
