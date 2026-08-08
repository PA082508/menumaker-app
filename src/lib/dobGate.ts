// dobGate.ts — «DOB differs»: сверка ДАТЫ РОЖДЕНИЯ формы с датой ребёнка,
// к которому форму привязывают.
//
// ПОВОД — история Isaac Baron (07.08). На бумаге ДР 7/13/2020, OCR прочитал
// 1/13/2020. Дедуп смотрит ДР — не сматчил — Approve завёл ВТОРУЮ строку
// ростера; фантом потом погасили, а подписанная форма осталась висеть на мёртвой
// строке, и у живого ребёнка формы зачисления не стало. Дыра claim-facing.
//
// ⚠️ ГЕЙТ СВЕРЯЕТ ЗНАЧЕНИЯ, А НЕ ФЛАГИ УВЕРЕННОСТИ OCR. В `_ocr.lowConfidence`
// той записи перечислены `day_phone`, `mailing.street`, `child_name` — поля
// `birthdate` там НЕТ. Флаги молчали ровно там, где ошибка: уверенность машины
// в себе — не факт (канон 07.08, DECISIONS).
//
// ГЕЙТ НЕ БЛОКИРУЕТ. Он СПРАШИВАЕТ: человек вправе подтвердить привязку, но уже
// осознанно. Блокировка здесь остановила бы законные случаи (описка в бумаге,
// исправленная позже) и научила бы обходить экран.

/** Дата-день как есть, без часовых поясов: `new Date('2020-07-13')` в Нью-Йорке
 *  съезжает на вчера, и гейт загорался бы на ровном месте. Сравниваем СТРОКИ. */
const dayOf = (v: unknown): string | null => {
  if (typeof v !== 'string') return null
  const m = v.trim().match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}

export type DobGate =
  | { kind: 'ok' }                                     // совпало
  | { kind: 'unknown'; missing: 'form' | 'child' | 'both' }  // сверять нечего
  | { kind: 'differs'; formDob: string; childDob: string; line: string }

/** Где в форме лежит ДР — замерено по типам: dob · child_dob · birthdate · birthday. */
export function formDobOf(formData: any): string | null {
  return dayOf(formData?.dob) ?? dayOf(formData?.child_dob)
      ?? dayOf(formData?.birthdate) ?? dayOf(formData?.birthday)
}

/** Читаемо для человека: 2020-01-13 → 01/13/2020 (как на бумаге). */
export const usDate = (iso: string): string => `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}`

export function dobGate(formData: any, childBirthday: unknown): DobGate {
  const f = formDobOf(formData)
  const c = dayOf(typeof childBirthday === 'string' ? childBirthday : null)
  if (!f && !c) return { kind: 'unknown', missing: 'both' }
  if (!f) return { kind: 'unknown', missing: 'form' }
  if (!c) return { kind: 'unknown', missing: 'child' }
  if (f === c) return { kind: 'ok' }
  return {
    kind: 'differs', formDob: f, childDob: c,
    line: `DOB differs: form ${usDate(f)} vs child ${usDate(c)} — is this the right child?`,
  }
}
