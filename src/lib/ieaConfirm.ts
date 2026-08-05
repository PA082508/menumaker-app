// src/lib/ieaConfirm.ts
// Построчное подтверждение бумажных IEA — ПО СЕМЬЯМ, а не по детям.
//
// ПОЧЕМУ ПО СЕМЬЯМ. Заявление о доходе подаётся на ДОМОХОЗЯЙСТВО: одна форма
// определяет всех детей семьи разом. Список по детям заставил бы Татьяну вносить
// одну и ту же бумагу по три раза для трёх братьев — и на третьем разе даты
// разъедутся. Замер 04.08: Highland 29 · Ridge 65 · Pearl 32 ребёнка, семей
// заметно меньше; у одного только Roman Guarnera пять доверенных лиц.
//
// ЧТО ПИШЕТСЯ ЗА ОДИН ВВОД (обе записи КАЖДОМУ ребёнку семьи):
//   1. `documents` — бумага в деле: тип из реестра 28, дата с бумаги, кто ручается;
//   2. `recordDetermination` — носитель, которым СЧИТАЕТСЯ ЗАЯВКА.
// Первая гасит жёлтую плашку, вторая двигает деньги. Одной без другой не бывает:
// строка документа без определения — бумага, которую никто не применил;
// определение без документа — категория, которую нечем обосновать.

export type Frp = 'F' | 'R' | 'P'

export interface FamilyChild {
  rosterId: string
  name: string
  room: string
  frp: string | null
  /** Есть ли уже действующая IEA (решение в системе или бумага в деле). */
  onFile: boolean
  /** Числится ли ребёнок в центре сейчас. Ушедший остаётся ВИДЕН, но серым. */
  active?: boolean
  /** date_out как в базе, 'YYYY-MM-DD'. Форматируется СРЕЗОМ строки: `new Date`
   *  над date-only в нью-йоркском поясе сдвигает день на вчера. */
  dateOut?: string | null
}

export interface FamilyRow {
  guardianId: string
  guardianName: string
  /** Кого строка ПОКАЗЫВАЕТ и ждёт заявления. */
  children: FamilyChild[]
  /** Остальные дети дома — с бумагой, с Paid, ушедшие. Строкой не идут, но ИЩУТСЯ:
   *  человек набирает имя с бумаги, и «нет такого ребёнка» про ребёнка, который
   *  в этом доме есть, — самый дорогой ответ из возможных. */
  others?: FamilyChild[]
}

/** Семьи, отсортированные так, как их удобно проходить: сначала те, где на
 *  файле нет НИКОГО, потом частично закрытые, потом закрытые целиком. */
export function sortFamiliesByWork<T extends FamilyRow>(rows: readonly T[]): T[] {
  const rank = (f: FamilyRow) => {
    const done = f.children.filter(c => c.onFile).length
    if (done === 0) return 0
    if (done < f.children.length) return 1
    return 2
  }
  return [...rows].sort((a, b) =>
    rank(a) - rank(b) || a.guardianName.localeCompare(b.guardianName))
}

export interface ConfirmInput {
  frp: Frp | ''
  documentDate: string
  paperInSafe: boolean
}

/**
 * Отказ до записи. ЧИСТАЯ — на ней стоит запрет массового подтверждения.
 *
 * ГЛАВНОЕ ПРАВИЛО: F и R — доходные категории, и без даты С БУМАГИ их ставить
 * нельзя. Это то же правило, что стоит в замке карточки (`record_child_field_change`
 * отобьёт такую запись и на сервере), но здесь оно звучит РАНЬШЕ — на экране,
 * где человек проходит сто семей подряд и не должен узнавать об отказе после
 * каждой сотой.
 */
export function confirmRefusal(i: ConfirmInput): string | null {
  if (!i.frp) return 'Choose the category printed on the application.'
  // Paid не требует заявления вовсе: это состояние «определения не было», а не
  // вывод из бумаги. Дату можно указать, если бумага всё-таки есть, но требовать
  // её значило бы запрещать самое частое и самое безобидное действие.
  if (i.frp === 'P') return null
  if (!i.documentDate) {
    return 'Free and Reduced are income categories — enter the date printed on the application. ' +
           'Without it the category cannot be counted in the claim.'
  }
  if (!i.paperInSafe) {
    return 'Confirm the paper is filed — that confirmation is what the record rests on.'
  }
  return null
}

/**
 * Можно ли подтвердить пачкой. НИКОГДА без дат: массовое «подтвердить всё»
 * означало бы сто определений, за которыми не стоит ни одной названной бумаги.
 */
export function bulkAllowed(rows: readonly { input: ConfirmInput }[]): boolean {
  if (rows.length === 0) return false
  return rows.every(r => confirmRefusal(r.input) === null)
}

/** Сколько детей закроет один ввод по семье — цифра для кнопки. */
export function childrenCovered(f: FamilyRow): number {
  return f.children.length
}

// ============================================================================
// ПОИСК ПО ИМЕНИ РЕБЁНКА (заказ владельца 05.08)
//
// ЗАЧЕМ. Строка списка — СЕМЬЯ, и подписана она опекуном. Но родители зачастую
// носят другую фамилию, чем дети: искать семью Bella Cheeks по слову «Cheeks»
// бесполезно, если строка называется «Thiana Carter». Человек со стопкой бумаг
// в руках читает имя РЕБЁНКА — по нему и должен находить.
//
// ПОЧЕМУ СЛОВА, А НЕ ПОДСТРОКА. Имя ребёнка хранится «Фамилия Имя» (канон CACFP),
// а произносят и пишут его «Имя Фамилия». Поиск подстрокой по всей строке нашёл бы
// «Mathews Harlei» и не нашёл бы «Harlei Mathews» — то есть отвечал бы «нет такого
// ребёнка» на правильно набранное имя. Поэтому запрос бьётся на слова, и каждое
// слово запроса должно начать КАКОЕ-ТО слово имени, в любом порядке.
// ============================================================================

/**
 * Слова имени для сравнения: нижний регистр, без диакритики, дефис/апостроф —
 * границы слов (иначе «Mathews-Smith» не нашлась бы по «Smith»).
 */
export function nameWords(s: string): string[] {
  return (s ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')   // Núñez → Nunez
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)                            // не только латиница
    .filter(Boolean)
}

/** Каждое слово запроса начинает какое-то слово имени. Порядок не важен. */
export function nameMatches(name: string, query: string): boolean {
  const q = nameWords(query)
  if (q.length === 0) return true
  const words = nameWords(name)
  return q.every(t => words.some(w => w.startsWith(t)))
}

export interface FamilyHit<T extends FamilyRow = FamilyRow> {
  row: T
  /** rosterId показанных детей, совпавших с запросом — их подсвечивает экран. */
  childIds: string[]
  /** Совпавшие дети дома, которых строка не показывает: их экран называет
   *  отдельной подписью вместе с причиной, почему они не в списке. */
  otherIds: string[]
  /** Совпало имя опекуна (а не ребёнка) — подсвечивается заголовок строки. */
  guardianHit: boolean
}

/**
 * Семьи, подходящие под запрос. Совпадение по ЛЮБОМУ ребёнку строки или по
 * имени опекуна. Пустой запрос — все семьи и ни одной подсветки: поиск, который
 * ничего не спросили, ничего и не выделяет.
 */
export function searchFamilies<T extends FamilyRow>(rows: readonly T[], query: string): FamilyHit<T>[] {
  if (nameWords(query).length === 0) {
    return rows.map(row => ({ row, childIds: [], otherIds: [], guardianHit: false }))
  }
  const out: FamilyHit<T>[] = []
  for (const row of rows) {
    const childIds = row.children.filter(c => nameMatches(c.name, query)).map(c => c.rosterId)
    const otherIds = (row.others ?? []).filter(c => nameMatches(c.name, query)).map(c => c.rosterId)
    const guardianHit = nameMatches(row.guardianName, query)
    if (childIds.length || otherIds.length || guardianHit) out.push({ row, childIds, otherIds, guardianHit })
  }
  return out
}

/** Почему ребёнок дома не стоит строкой. Словами — на экране это подпись. */
export function whyNotListed(c: FamilyChild): string {
  if (c.active === false) {
    return c.dateOut ? `left ${c.dateOut.slice(5, 7)}/${c.dateOut.slice(8, 10)}` : 'no longer enrolled'
  }
  if (c.onFile) return 'application already on file'
  if (c.frp === 'P') return 'Paid — no application needed'
  return 'not waiting for an application'
}


// ============================================================================
// СЕМЬЯ — ЭТО ГРУППА ДЕТЕЙ, А НЕ СТРОКА ОПЕКУНА (заказ владельца 05.08)
//
// Заявление подаётся на ДОМОХОЗЯЙСТВО. Пока строкой был опекун, у Bates выходило
// восемь строк на шесть детей: у каждого ребёнка по два доверенных лица, и каждое
// давало свою строку с теми же детьми. Человек вносил одну бумагу дважды, а
// счётчик семей считал доверенных лиц, а не семьи.
//
// СВЯЗНОСТЬ, А НЕ «ПЕРВЫЙ ОПЕКУН». Два ребёнка в одном домохозяйстве, если у них
// есть общий опекун — и дальше по цепочке: ребёнок A с опекунами {Х,У}, ребёнок B
// с опекуном {У} — один дом. Брать «первого опекуна» значило бы рвать семью
// пополам по порядку строк в базе.
// ============================================================================

export interface HouseholdMember {
  rosterId: string
  guardianIds: readonly string[]
}

export interface Household {
  /** Устойчивый ключ строки: по опекунам, а у ребёнка без опекуна — по нему самому. */
  key: string
  guardianIds: string[]
  rosterIds: string[]
}

export function mergeHouseholds(members: readonly HouseholdMember[]): Household[] {
  const parent = new Map<string, string>()
  const find = (x: string): string => {
    let r = parent.get(x) ?? x
    while (r !== (parent.get(r) ?? r)) r = parent.get(r) ?? r
    let cur = x
    while (cur !== r) { const nxt = parent.get(cur) ?? cur; parent.set(cur, r); cur = nxt }
    return r
  }
  const union = (a: string, b: string) => {
    const ra = find(a), rb = find(b)
    if (ra !== rb) parent.set(ra, rb)
  }
  for (const m of members) {
    const ck = `c:${m.rosterId}`
    if (!parent.has(ck)) parent.set(ck, ck)
    for (const g of m.guardianIds) {
      const gk = `g:${g}`
      if (!parent.has(gk)) parent.set(gk, gk)
      union(ck, gk)
    }
  }
  const groups = new Map<string, Household>()
  for (const m of members) {
    const root = find(`c:${m.rosterId}`)
    if (!groups.has(root)) groups.set(root, { key: '', guardianIds: [], rosterIds: [] })
    const h = groups.get(root)!
    h.rosterIds.push(m.rosterId)
    for (const g of m.guardianIds) if (!h.guardianIds.includes(g)) h.guardianIds.push(g)
  }
  const out = Array.from(groups.values())
  for (const h of out) {
    h.guardianIds.sort()
    h.rosterIds.sort()
    h.key = h.guardianIds.length ? `h:${h.guardianIds.join('+')}` : `c:${h.rosterIds[0]}`
  }
  return out
}
