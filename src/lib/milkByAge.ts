// milkByAge.ts — молоко выводится из ДАТЫ РОЖДЕНИЯ, а не спрашивается.
//
// КАНОН ВЛАДЕЛЬЦА 05.08: «Birthday = single source of truth». Вид молока и
// порция — следствие возраста, и человеку их вводить незачем: он либо повторит
// то, что система и так знает, либо ошибётся, и тогда в карточке будет одно, а
// в сетке питания — другое.
//
// ЗЕРКАЛО `v_meal_grid`. Эти же пороги считает сетка счёта (и по ней кормят):
//   до 12 мес → Formula, 0 oz   ·   до 24 мес → Whole, 4 oz
//   до 36 мес → 1%, 4 oz        ·   до 72 мес → 1%, 6 oz   ·   дальше → 1%, 8 oz
// Порог метки (24) и порог унций (36) РАЗНЫЕ — так в самой вью, и расходиться
// с ней здесь нельзя: карточка обещала бы одно, а кухня наливала другое.
//
// ЕДИНСТВЕННЫЙ ВВОД — медицинская замена: она бьёт расчёт, но не отменяет его,
// и в сетке показывается тем, что налито по справке.

export interface MilkByAge {
  /** Метка, как её показывает сетка питания: Formula · Whole · 1%. */
  label: string
  /** Унции на приём. */
  oz: number
  /** Возраст в месяцах на дату расчёта — для подписи и отладки. */
  months: number
}

/** Месяцы от даты рождения до дня расчёта. Считается по срезам строки:
 *  `new Date('2023-05-04')` в нью-йоркском поясе отдаёт предыдущий день. */
export function ageMonths(birthdayISO: string, asOfISO: string): number {
  const [by, bm, bd] = birthdayISO.slice(0, 10).split('-').map(Number)
  const [ay, am, ad] = asOfISO.slice(0, 10).split('-').map(Number)
  if (!by || !bm || !bd || !ay || !am || !ad) return NaN
  let m = (ay - by) * 12 + (am - bm)
  if (ad < bd) m -= 1
  return m
}

/** Молоко и порция по возрасту. null — когда даты рождения ещё нет. */
export function milkByAge(birthdayISO: string | null | undefined, asOfISO: string): MilkByAge | null {
  if (!birthdayISO) return null
  const months = ageMonths(birthdayISO, asOfISO)
  if (!Number.isFinite(months) || months < 0) return null
  const label = months < 12 ? 'Formula' : months < 24 ? 'Whole' : '1%'
  const oz = months < 12 ? 0 : months < 36 ? 4 : months < 72 ? 6 : 8
  return { label, oz, months }
}

/** Строка для карточки: «1% · 6 oz — by age». */
export function milkByAgeLine(birthdayISO: string | null | undefined, asOfISO: string): string {
  const m = milkByAge(birthdayISO, asOfISO)
  if (!m) return 'Enter the birthday — milk and ounces follow from it'
  return `${m.label} · ${m.oz} oz — by age`
}
