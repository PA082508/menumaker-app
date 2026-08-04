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
