// src/lib/claimFromRpc.ts
//
// ЕДИНСТВЕННЫЙ ИСТОЧНИК ЦИФР ЗАЯВКИ — `menumaker.compute_monthly_claim`.
//
// Почему это отдельный файл, а не пара строк в странице: 31.07 расхождение двух
// счётчиков перестало быть теоретическим — дашборд (RPC) 3 889 против страницы
// клейма 3 893 по Highland за июль. Четыре дня вида «Завтрак + Ланч + Ужин, снека
// нет»: клиентское правило считало «всего отметок ≤ 3 → не исключать ничего», а
// норма — максимум ДВА приёма плюс один снек. Клиент завышал заявку.
//
// Правило теперь одно и живёт в базе. Здесь — ЧИСТЫЙ перевод её ответа в поля формы:
// ни одного вычисления над отметками, ни одного обращения к `meal_week_records`.
// Любая арифметика, добавленная сюда, воспроизводит ровно ту болезнь, ради которой
// файл заведён (см. гард-тест `claimSingleCounter.test.ts`).

export interface ClassBreakdownRpc {
  id: string
  name: string
  days_of_op: number
  slots: Record<string, number>
  ada: number
  total: number
}

/** Цифры формы, пришедшие из RPC. Ручные поля (смены, заметки) сюда не входят —
 *  они живут в `monthly_claims` и заполняются человеком. */
export interface ClaimNumbers {
  days_of_operation: number
  total_attendance: number
  ada: number
  breakfast: number
  am_snack: number
  lunch: number
  pm_snack: number
  supper: number
  evening_snack: number
  classrooms: ClassBreakdownRpc[]
  free_category: number
  reduced_category: number
  paid_category: number
  license_capacity: number | null
  reimbursement?: { meal_reimbursement: number; cil_reimbursement: number; total: number }
}

const num = (v: unknown): number => {
  const n = typeof v === 'string' ? Number(v) : (v as number)
  return Number.isFinite(n) ? n : 0
}

/** Перевод ответа `compute_monthly_claim` в поля формы. Отсутствующий блок —
 *  НЕ ноль по умолчанию там, где ноль был бы утверждением: `license_capacity`
 *  остаётся null, и форма показывает пустоту, а не выдуманное число. */
export function claimFromRpc(rpc: any): ClaimNumbers {
  const att = rpc?.attendance ?? {}
  const cat = rpc?.categories ?? {}
  const meals = rpc?.meals ?? {}
  const cls = Array.isArray(rpc?.classrooms) ? rpc.classrooms : []
  return {
    days_of_operation: num(att.days_of_operation),
    total_attendance: num(att.total_attendance),
    ada: num(att.ada),
    breakfast: num(meals.breakfast),
    am_snack: num(meals.am_snack),
    lunch: num(meals.lunch),
    pm_snack: num(meals.pm_snack),
    supper: num(meals.supper),
    evening_snack: num(meals.evening_snack),
    classrooms: cls.map((c: any): ClassBreakdownRpc => ({
      id: String(c?.id ?? ''),
      name: String(c?.name ?? ''),
      days_of_op: num(c?.days_of_op),
      slots: {
        b: num(c?.slots?.b), as: num(c?.slots?.as), l: num(c?.slots?.l),
        ps: num(c?.slots?.ps), su: num(c?.slots?.su), es: num(c?.slots?.es),
      },
      ada: num(c?.ada),
      total: num(c?.total),
    })),
    free_category: num(cat.free),
    reduced_category: num(cat.reduced),
    paid_category: num(cat.paid),
    license_capacity: cat.license_capacity == null ? null : num(cat.license_capacity),
    reimbursement: rpc?.reimbursement
      ? {
          meal_reimbursement: num(rpc.reimbursement.meal_reimbursement),
          cil_reimbursement: num(rpc.reimbursement.cil_reimbursement),
          total: num(rpc.reimbursement.total),
        }
      : undefined,
  }
}

/** Самопроверка формы: сумма по комнатам обязана сойтись с общим итогом приёмов
 *  ДО ЕДИНИЦЫ. Расхождение означает, что комнаты и итог посчитаны по разным
 *  правилам — то есть ровно то, ради чего счётчик сводили в один. */
export function classroomsMatchTotals(c: ClaimNumbers): { ok: boolean; byClass: number; total: number } {
  const byClass = c.classrooms.reduce((n, k) => n + k.total, 0)
  const total = c.breakfast + c.am_snack + c.lunch + c.pm_snack + c.supper + c.evening_snack
  return { ok: byClass === total, byClass, total }
}
