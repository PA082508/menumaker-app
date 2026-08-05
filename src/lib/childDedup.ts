// childDedup.ts — «похоже, этот ребёнок уже есть» на вводе имени.
//
// ЗАЧЕМ. Дедуп, который человек должен ЗАПУСТИТЬ, не запускается: директор с
// бумагой в руках заводит ребёнка, а поиск делает тот, кто сомневается. Замер
// 31.07: у Bates в ростере Wickliffe две пары строк-двойников на одно имя —
// заведённых руками, по одной на каждый раз, когда кто-то не нашёл существующую.
//
// ПОЭТОМУ ПРОВЕРКА ФОНОВАЯ и идёт на вводе, а не по кнопке. Она НИЧЕГО НЕ РЕШАЕТ
// за человека: показывает найденное и оставляет обе двери — «это он» и «нет, новый».
//
// ПРАВИЛО СОВПАДЕНИЯ. Двойник — это:
//   1. совпали ОБА слова имени (имя и фамилия), в любом порядке; ИЛИ
//   2. совпала фамилия И совпала дата рождения — этого достаточно, потому что
//      имя в бумаге и в системе часто разное (Tyree Jr / Jr Tyree, Sasha / Alexandra).
// Только фамилии НЕ ХВАТАЕТ: у Bates шесть родных детей, и шесть подсказок
// «похоже, уже есть» на каждом вводе — это шум, который перестают читать.

export interface DedupCandidate {
  rosterId: string
  childName: string          // как хранится: «Фамилия Имя»
  firstName?: string | null
  lastName?: string | null
  birthday?: string | null   // 'YYYY-MM-DD'
  room?: string | null
  isActive?: boolean
}

export interface DedupQuery {
  first: string
  last: string
  birthday?: string | null
}

function words(s: string | null | undefined): string[] {
  return (s ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean)
}

/** Слово запроса совпало со словом имени: полностью или как начало (Tyr → Tyree). */
function hasWord(pool: string[], w: string): boolean {
  if (!w) return false
  return pool.some(p => p === w || p.startsWith(w) || w.startsWith(p))
}

export function similarChildren(
  list: readonly DedupCandidate[],
  q: DedupQuery,
): DedupCandidate[] {
  const first = words(q.first)[0] ?? ''
  const last = words(q.last)[0] ?? ''
  // До двух букв в каждом поле молчим: на «Ja» совпадёт половина ростера, и
  // подсказка появится раньше, чем человек успел дописать имя.
  if (first.length < 3 && last.length < 3 && !q.birthday) return []

  const out: DedupCandidate[] = []
  for (const c of list) {
    const pool = [...words(c.childName), ...words(c.firstName), ...words(c.lastName)]
    const firstHit = first.length >= 3 && hasWord(pool, first)
    const lastHit = last.length >= 3 && hasWord(pool, last)
    const bdayHit = !!q.birthday && !!c.birthday && q.birthday === c.birthday
    if ((firstHit && lastHit) || (lastHit && bdayHit) || (firstHit && bdayHit)) out.push(c)
  }
  // Действующие первыми: вернувшийся ребёнок — частый случай, но действующий
  // двойник — это тот, из-за которого счёт питания раздваивается сегодня.
  return out.sort((a, b) => Number(b.isActive !== false) - Number(a.isActive !== false))
}

/** Подпись кандидата в плашке: «Фамилия Имя · комната · b.MM/DD/YYYY». */
export function candidateLine(c: DedupCandidate): string {
  const parts = [c.childName]
  if (c.room) parts.push(c.room)
  if (c.birthday) parts.push(`b.${c.birthday.slice(5, 7)}/${c.birthday.slice(8, 10)}/${c.birthday.slice(0, 4)}`)
  if (c.isActive === false) parts.push('no longer enrolled')
  return parts.join(' · ')
}
