// formGate.ts — ПОЛКА: форма существует, но витрина её не выдаёт.
//
// ЗАЧЕМ (канон владельца 05.08). Есть формы, которые нельзя раздавать семьям,
// пока не пришло разрешение органов. Удалять их нельзя — они понадобятся, и
// удаление стёрло бы историю версий; прятать в коде экрана тоже нельзя — дверей
// у формы пять (голая витрина · ссылка на форму · реестровые пакеты · наборы
// в базе · школьная родня), и второй список однажды разойдётся с первым.
//
// ПОЭТОМУ ПРИЗНАК ЖИВЁТ В РЕЕСТРЕ ФОРМ, рядом с версиями:
//   "enroll": { "current": "v11", "versions": {...}, "gated": true,
//               "gate": "authority_approval" }
// Один признак закрывает все двери разом, снятие — одним словом, и оно же
// оживляет наборы и QR: ничего больше трогать не нужно.
//
// ЧЕГО ЭТО НЕ ДЕЛАЕТ: не прячет форму от офиса (директор печатает бумагу как
// раньше) и не трогает уже поданное — поданное разбирается столом.

export interface GateInfo {
  gated: boolean
  /** Почему закрыто — словами, для серой строки в наборе. */
  reason: string
}

const REASON: Record<string, string> = {
  authority_approval: 'Not issued yet — waiting for the authority’s approval',
}

/** Закрыта ли форма для выдачи семье. Реестр — единственный источник правды. */
export function formGate(reg: any, formKey: string): GateInfo {
  const f = reg?.forms?.[formKey]
  const gated = !!f?.gated
  const key = String(f?.gate ?? 'authority_approval')
  return { gated, reason: gated ? (REASON[key] ?? 'Not issued yet') : '' }
}

/** Состав набора, разделённый на выдаваемое и полку. Порядок сохраняется:
 *  человек должен видеть, что форма в наборе ЕСТЬ, но сейчас не выдаётся. */
export function splitGatedSlots<T extends { key: string }>(
  reg: any, slots: readonly T[],
): { issued: T[]; shelved: { slot: T; reason: string }[] } {
  const issued: T[] = []
  const shelved: { slot: T; reason: string }[] = []
  for (const s of slots) {
    const g = formGate(reg, s.key)
    if (g.gated) shelved.push({ slot: s, reason: g.reason })
    else issued.push(s)
  }
  return { issued, shelved }
}

/** Ключи, которые витрина не должна получить в `only=` / составе набора. */
export function gatedKeys(reg: any, keys: readonly string[]): string[] {
  return keys.filter(k => formGate(reg, k).gated)
}
