// enrollmentTitle.ts — как называется строка инбокса, когда имени ребёнка в
// заявке НЕТ.
//
// ПОВОД (глаз владельца 07.08 + замер 08.08). Семейная заявка о доходе (`iea`)
// несёт детей СПИСКОМ, а одиночное поле `child_name` в ней пусто — строка
// честно показывала «(no name)». Замер по базе: пустой титул у 11 из 13 `iea`
// (у 10 из них есть массив `children`) и у 12 из 13 `other`.
//
// ⚠️ НАЙДЕНО ЗАОДНО И ХУЖЕ ТИТУЛА: группировка складывала ВСЕ безымянные строки
// в ОДНУ корзину `__noname__` — то есть заявки РАЗНЫХ семей сливались в одну
// строку инбокса. Титул это бы прикрыл, а слипание осталось бы. Поэтому здесь
// две вещи сразу: как СЧИТАТЬ семью (ключ) и как её НАЗВАТЬ (титул).
//
// ЧЕГО ЗДЕСЬ НЕТ НАРОЧНО: титула для `other`. Замер показал, что все 13 таких
// строк — сфотографированные НЕ заявки (лицензии FSO, регистрации пищевой
// безопасности, тестовые снимки): у них нет ни имени, ни ребёнка, и собрать
// титул не из чего. Выдуманный титул хуже честного «(no name)»: он обещает
// ребёнка там, где ребёнка нет.

/** Ребёнок внутри семейной заявки: `{ name, dob, case_no, … }` — замер 08.08. */
type HouseholdChild = { name?: unknown; dob?: unknown }

export type Household = {
  /** Фамилия семьи, если её видно у детей. null — не видно, и выдумывать нельзя. */
  surname: string | null
  /** Имена детей как есть, в порядке заявки. */
  names: string[]
  count: number
}

const cleanName = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

/** Фамилия = ПОСЛЕДНЕЕ слово имени: в заявке имена записаны «Isaac Rife».
 *  Берётся САМАЯ ЧАСТАЯ среди детей — у сводных семей фамилии расходятся, и
 *  первая попавшаяся назвала бы семью по младшему из двух родов. */
function commonSurname(names: string[]): string | null {
  const counts = new Map<string, number>()
  for (const n of names) {
    const parts = n.split(/\s+/).filter(Boolean)
    if (parts.length < 2) continue                    // одно слово — не фамилия
    const s = parts[parts.length - 1]
    counts.set(s, (counts.get(s) ?? 0) + 1)
  }
  let best: string | null = null
  let bestN = 0
  for (const [s, n] of counts) if (n > bestN) { best = s; bestN = n }
  return best
}

/** Семья внутри заявки — или null, если детей списком нет. */
export function householdOf(formData: any): Household | null {
  const raw = formData?.children
  if (!Array.isArray(raw) || raw.length === 0) return null
  const names = (raw as HouseholdChild[]).map((c) => cleanName(c?.name)).filter(Boolean)
  if (names.length === 0) return null
  return { surname: commonSurname(names), names, count: raw.length }
}

/**
 * Титул строки: «Rife household · 2 children».
 * null — собрать честно не из чего (нет списка детей).
 * Фамилии не видно → «Household · N children»: без выдуманного имени.
 */
export function householdTitle(formData: any): string | null {
  const h = householdOf(formData)
  if (!h) return null
  const who = h.surname ? `${h.surname} household` : 'Household'
  return `${who} · ${h.count} ${h.count === 1 ? 'child' : 'children'}`
}

/**
 * Ключ группировки для безымянной заявки: имена детей, нормализованные и
 * отсортированные. Две заявки ОДНОЙ семьи сходятся в одну строку, заявки РАЗНЫХ
 * семей больше не слипаются в общую корзину «(no name)».
 */
export function householdKey(formData: any): string | null {
  const h = householdOf(formData)
  if (!h) return null
  const norm = h.names
    .map((n) => n.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').split(/\s+/).filter(Boolean).sort().join(' '))
    .filter(Boolean)
    .sort()
  return norm.length ? `household:${norm.join('|')}` : null
}
