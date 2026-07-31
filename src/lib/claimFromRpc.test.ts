import { describe, it, expect } from 'vitest'
import { claimFromRpc, classroomsMatchTotals } from './claimFromRpc'

// Ответ RPC в том виде, в каком его отдаёт compute_monthly_claim (числа — Highland,
// июль 2026, замер 31.07: итог приёмов 3889).
const rpc = {
  center_id: 'c1',
  claim_month: '2026-07',
  attendance: { days_of_operation: 23, ada: 98, total_attendance: 2254, number_of_shifts: 1 },
  categories: { free: 40, reduced: 8, paid: 50, total_enrolled: 98, license_capacity: 106 },
  meals: { breakfast: 800, am_snack: 700, lunch: 900, pm_snack: 0, supper: 789, evening_snack: 700,
           total_reimbursable: 3889 },
  classrooms: [
    { id: 'r1', name: 'Blue Room', days_of_op: 23, ada: 12,
      slots: { b: 400, as: 350, l: 450, ps: 0, su: 389, es: 350 }, total: 1939 },
    { id: 'r2', name: 'Green Room', days_of_op: 23, ada: 11,
      slots: { b: 400, as: 350, l: 450, ps: 0, su: 400, es: 350 }, total: 1950 },
  ],
  reimbursement: { meal_reimbursement: 9000.5, cil_reimbursement: 500.25, total: 9500.75 },
}

describe('claimFromRpc — перевод ответа базы в поля формы', () => {
  it('берёт приёмы, посещаемость и категории из RPC без единого пересчёта', () => {
    const n = claimFromRpc(rpc)
    expect(n.breakfast).toBe(800)
    expect(n.supper).toBe(789)
    expect(n.days_of_operation).toBe(23)
    expect(n.ada).toBe(98)
    expect(n.free_category).toBe(40)
    expect(n.license_capacity).toBe(106)
    expect(n.reimbursement?.total).toBe(9500.75)
  })

  it('поклассовая разбивка приходит из RPC целиком', () => {
    const n = claimFromRpc(rpc)
    expect(n.classrooms).toHaveLength(2)
    expect(n.classrooms[0].name).toBe('Blue Room')
    expect(n.classrooms[0].slots.su).toBe(389)
  })

  it('отсутствующая ёмкость остаётся ПУСТОЙ, а не нулём — ноль был бы утверждением', () => {
    const n = claimFromRpc({ ...rpc, categories: { ...rpc.categories, license_capacity: null } })
    expect(n.license_capacity).toBeNull()
  })

  it('пустой/битый ответ не роняет форму и не рисует выдуманных чисел', () => {
    const n = claimFromRpc(null)
    expect(n.breakfast).toBe(0)
    expect(n.classrooms).toEqual([])
    expect(n.license_capacity).toBeNull()
    expect(n.reimbursement).toBeUndefined()
  })

  it('самопроверка: сумма по комнатам сходится с итогом приёмов', () => {
    const n = claimFromRpc(rpc)
    const c = classroomsMatchTotals(n)
    expect(c.byClass).toBe(3889)
    expect(c.total).toBe(3889)
    expect(c.ok).toBe(true)
  })

  it('НЕГАТИВНАЯ ПРОБА самопроверки: расхождение комнат и итога ловится', () => {
    const broken = { ...rpc, classrooms: [rpc.classrooms[0]] }   // потеряли комнату
    const c = classroomsMatchTotals(claimFromRpc(broken))
    expect(c.ok).toBe(false)
    expect(c.total - c.byClass).toBe(1950)
  })
})
