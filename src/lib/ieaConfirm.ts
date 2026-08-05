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
}

export interface FamilyRow {
  guardianId: string
  guardianName: string
  children: FamilyChild[]
}

/** Семьи, отсортированные так, как их удобно проходить: сначала те, где на
 *  файле нет НИКОГО, потом частично закрытые, потом закрытые целиком. */
export function sortFamiliesByWork(rows: readonly FamilyRow[]): FamilyRow[] {
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
  /** rosterId детей, совпавших с запросом — их подсвечивает экран. */
  childIds: string[]
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
    return rows.map(row => ({ row, childIds: [], guardianHit: false }))
  }
  const out: FamilyHit<T>[] = []
  for (const row of rows) {
    const childIds = row.children.filter(c => nameMatches(c.name, query)).map(c => c.rosterId)
    const guardianHit = nameMatches(row.guardianName, query)
    if (childIds.length || guardianHit) out.push({ row, childIds, guardianHit })
  }
  return out
}
