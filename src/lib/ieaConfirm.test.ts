import { describe, it, expect } from 'vitest'
import { bulkAllowed, confirmRefusal, sortFamiliesByWork, childrenCovered, type FamilyRow } from './ieaConfirm'

// ============================================================================
// СПИСОК ТАТЬЯНЫ — правила, на которых стоит запрет массового подтверждения.
// Сто определений, за которыми не стоит ни одной названной бумаги, — это не
// экономия времени, это сто строк, которые нечем обосновать на проверке.
// ============================================================================

const kid = (n: string, onFile = false) => ({ rosterId: n, name: n, room: 'Red', frp: 'P', onFile })
const fam = (id: string, name: string, kids: ReturnType<typeof kid>[]): FamilyRow =>
  ({ guardianId: id, guardianName: name, children: kids })

describe('отказ до записи', () => {
  it('категория не выбрана — отказ', () => {
    expect(confirmRefusal({ frp: '', documentDate: '2026-07-15', paperInSafe: true })).not.toBeNull()
  })

  it('FREE без документной даты — отказ, и он объясняет цену', () => {
    const r = confirmRefusal({ frp: 'F', documentDate: '', paperInSafe: true })!
    expect(r).toContain('income categories')
    expect(r.toLowerCase()).toContain('claim')
  })

  it('REDUCED без даты — тот же отказ: это тоже доходная категория', () => {
    expect(confirmRefusal({ frp: 'R', documentDate: '', paperInSafe: true })).not.toBeNull()
  })

  it('F с датой, но без подтверждения бумаги — отказ', () => {
    expect(confirmRefusal({ frp: 'F', documentDate: '2026-07-15', paperInSafe: false })).not.toBeNull()
  })

  it('F с датой и подтверждением — проходит', () => {
    expect(confirmRefusal({ frp: 'F', documentDate: '2026-07-15', paperInSafe: true })).toBeNull()
  })

  it('PAID без заявления — проходит: на Paid заявления и не бывает', () => {
    expect(confirmRefusal({ frp: 'P', documentDate: '', paperInSafe: false })).toBeNull()
  })
})

describe('массовое подтверждение', () => {
  it('пачка без дат НЕ разрешена', () => {
    expect(bulkAllowed([{ input: { frp: 'F', documentDate: '', paperInSafe: true } }])).toBe(false)
  })

  it('одна строка без даты рушит всю пачку', () => {
    expect(bulkAllowed([
      { input: { frp: 'F', documentDate: '2026-07-15', paperInSafe: true } },
      { input: { frp: 'R', documentDate: '', paperInSafe: true } },
    ])).toBe(false)
  })

  it('пустая пачка — не разрешена (кнопке нечего делать)', () => {
    expect(bulkAllowed([])).toBe(false)
  })

  it('все строки с датами и подтверждением — разрешена', () => {
    expect(bulkAllowed([
      { input: { frp: 'F', documentDate: '2026-07-15', paperInSafe: true } },
      { input: { frp: 'P', documentDate: '', paperInSafe: false } },
    ])).toBe(true)
  })
})

describe('порядок работы', () => {
  it('сначала семьи, где не закрыт НИКТО; закрытые целиком — в конец', () => {
    const rows = [
      fam('c', 'Closed', [kid('a', true), kid('b', true)]),
      fam('a', 'Untouched', [kid('c')]),
      fam('b', 'Partial', [kid('d', true), kid('e')]),
    ]
    expect(sortFamiliesByWork(rows).map(f => f.guardianName)).toEqual(['Untouched', 'Partial', 'Closed'])
  })

  it('один ввод закрывает столько детей, сколько в семье — это и есть смысл списка', () => {
    expect(childrenCovered(fam('x', 'Bates', [kid('1'), kid('2'), kid('3')]))).toBe(3)
  })
})
