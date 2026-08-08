// ============================================================
// enrollmentGrouping.ts — fold the Inbox's flat submission list into one block
// per child, and flag which forms need the director's signature.
//
// Grouping is a DISPLAY aid. There is no packet/family id on enrollment_submissions
// (each form is its own row), so siblings are grouped by a normalized, token-order-
// insensitive child-name key. A namesake collision is visible and the director
// re-links at Review — grouping writes nothing. (spec 2026-07-17, §2)
// ============================================================

import { normName } from './enrollmentApprove'
import { countersignSlot } from './signatureSamples'
import { householdKey, householdTitle } from './enrollmentTitle'

// Subset of the Inbox's Submission that grouping needs.
export type GroupableSubmission = {
  id: string
  submission_type: string
  form_data: any
  child_id: string | null
  status: string
  created_at: string
}

/** A form needs the director's signature before filing iff it declares a
 *  countersignature slot — list A: dcy_01234, iea, start_form (COUNTERSIGN_SLOT).
 *  One source of truth; never a second hardcoded list. */
export function signatureRequired(submissionType: string): boolean {
  return countersignSlot(submissionType) !== null
}

// A submission is "filed" (a fact to look up, not a task) once it is auto-filed —
// status 'received'. Mirrors EnrollmentInboxPage's `filed = row.status === 'received'`.
const isFiled = (status: string): boolean => status === 'received'

export type ChildGroup = {
  key: string              // token-sorted normalized name; '' for the no-name bucket
  childName: string        // display name, as first typed
  submissions: GroupableSubmission[]
  signatureCount: number   // forms still AWAITING a director signature (excludes filed)
}

// Token-order-insensitive key: "Hazel Broadwater" and "Broadwater Hazel" collapse.
// Rare false collisions (Anna Maria ↔ Maria Anna) are acceptable for a display
// aid the director confirms; the alternative (order-sensitive) splits one child's
// packet whenever a form types the name in the other order.
function groupKey(raw: any): string {
  return normName(raw).split(' ').filter(Boolean).sort().join(' ')
}

/** Fold submissions into one group per child. Groups are ordered by their newest
 *  submission first; within a group, newest first. Blank names share one
 *  '(no name)' bucket so nothing is dropped. Pure — sorts defensively so the
 *  result does not depend on input order. */
export function groupSubmissionsByChild(subs: GroupableSubmission[]): ChildGroup[] {
  const byKey = new Map<string, ChildGroup>()
  for (const s of subs) {
    const key = groupKey(s.form_data?.child_name)
    // СЕМЕЙНАЯ ЗАЯВКА несёт детей списком, а `child_name` в ней пуст. До 08.08
    // такие строки падали в ОДНУ корзину `__noname__` — и заявки РАЗНЫХ семей
    // сливались в одну строку инбокса. Теперь у семьи свой ключ (по именам
    // детей) и свой титул; у кого списка нет — всё как прежде.
    const hKey = key ? null : householdKey(s.form_data)
    const bucket = key || hKey || '__noname__'
    let g = byKey.get(bucket)
    if (!g) {
      const raw = s.form_data?.child_name
      const display = typeof raw === 'string' && raw.trim() ? raw.trim()
        : householdTitle(s.form_data) ?? '(no name)'
      g = { key, childName: display, submissions: [], signatureCount: 0 }
      byKey.set(bucket, g)
    }
    g.submissions.push(s)
    // Count only forms still awaiting a signature — a filed (received) form is a
    // fact, not a task, so it must not inflate the "awaiting your signature" badge.
    if (signatureRequired(s.submission_type) && !isFiled(s.status)) g.signatureCount++
  }
  const desc = (a: string, b: string) => (a < b ? 1 : a > b ? -1 : 0)
  const groups = [...byKey.values()]
  for (const g of groups) g.submissions.sort((a, b) => desc(a.created_at, b.created_at))
  groups.sort((a, b) => desc(a.submissions[0]?.created_at ?? '', b.submissions[0]?.created_at ?? ''))
  return groups
}

// ─── ДВОЙНИКИ ОДНОЙ ФОРМЫ (заказ владельца 08.08) ────────────────────────────
// Замер по Rife: семья отправила ОДНУ И ТУ ЖЕ форму дважды с разницей 5,5 минут
// (05.08 00:24:27 и 00:29:57), обе одобрены, обе на живой строке. Мис-привязки
// нет — это повторная отправка родителем.
//
// Правило владельца: показывать ДАТЫ и «СВЕЖАЯ ПОБЕЖДАЕТ». Старая НЕ прячется и
// НЕ удаляется — она остаётся видимой историей: спрятанная запись через месяц
// превращается в вопрос «а была ли вторая форма», на который никто не ответит.
//
// Чистая функция: «который по счёту и кто из них свежий» — это арифметика, и
// проверяться она должна машиной.

export type DuplicateMark = {
  /** Сколько всего форм ЭТОГО ЖЕ типа у этого ребёнка. 1 — двойников нет. */
  total: number
  /** Номер этой формы среди них, 1 = самая свежая. */
  rank: number
  /** true — свежая: именно она считается действующей. */
  current: boolean
}

/** Ключ «тот же ребёнок + тот же тип формы». Ребёнок опознаётся по привязке,
 *  а если её нет — по имени (тем же нормализованным ключом, что и группировка). */
function dupKey(s: GroupableSubmission): string {
  const who = s.child_id ?? groupKey(s.form_data?.child_name) ?? ''
  return `${who}|${s.submission_type}`
}

/** id формы → отметка двойника. Формы без двойников в карту НЕ попадают:
 *  отметка «1 of 1» — шум, а шум учит не читать отметки. */
export function duplicateMarks(subs: readonly GroupableSubmission[]): Map<string, DuplicateMark> {
  const byKey = new Map<string, GroupableSubmission[]>()
  for (const s of subs) {
    const k = dupKey(s)
    if (!k.startsWith('|')) (byKey.get(k) ?? byKey.set(k, []).get(k)!).push(s)
  }
  const marks = new Map<string, DuplicateMark>()
  for (const list of byKey.values()) {
    if (list.length < 2) continue
    const sorted = [...list].sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0))
    sorted.forEach((s, i) => marks.set(s.id, { total: sorted.length, rank: i + 1, current: i === 0 }))
  }
  return marks
}
