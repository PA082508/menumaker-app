import { describe, it, expect } from 'vitest'
import { bulkAllowed, confirmRefusal, sortFamiliesByWork, childrenCovered, searchFamilies, nameMatches, mergeHouseholds, whyNotListed, type FamilyRow } from './ieaConfirm'

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

// ============================================================================
// ПОИСК ПО ИМЕНИ РЕБЁНКА. Родители зачастую носят другую фамилию, чем дети:
// строка подписана опекуном, а в руках у человека бумага с именем РЕБЁНКА.
// ============================================================================

describe('поиск по имени ребёнка', () => {
  // Настоящая пара из базы Highland Heights: опекун Carter, ребёнок Cheeks.
  const carter = fam('g1', 'Thiana Carter', [kid('Cheeks Bella')])
  const mathews = fam('g2', 'Dana Smith', [kid('Mathews Harlei')])
  const brothers = fam('g3', 'Roman Guarnera', [kid('Guarnera Lily'), kid('Guarnera Nico')])
  const all = [carter, mathews, brothers]

  it('семья находится по фамилии РЕБЁНКА, которой нет у опекуна', () => {
    const hits = searchFamilies(all, 'Cheeks')
    expect(hits).toHaveLength(1)
    expect(hits[0].row.guardianId).toBe('g1')
    // Подсветка знает, ПОЧЕМУ строка выпала в результат.
    expect(hits[0].childIds).toEqual(['Cheeks Bella'])
    expect(hits[0].guardianHit).toBe(false)
  })

  it('порядок слов не мешает: Harlei Mathews = Mathews Harlei', () => {
    expect(searchFamilies(all, 'Harlei Mathews').map(h => h.row.guardianId)).toEqual(['g2'])
    expect(searchFamilies(all, 'Mathews Harlei').map(h => h.row.guardianId)).toEqual(['g2'])
  })

  it('регистр не мешает', () => {
    expect(searchFamilies(all, 'cHeEkS').map(h => h.row.guardianId)).toEqual(['g1'])
  })

  it('ищется и по началу слова — человек не дописывает фамилию до конца', () => {
    expect(searchFamilies(all, 'chee').map(h => h.row.guardianId)).toEqual(['g1'])
  })

  it('поиск по имени опекуна тоже работает — строка подписана им', () => {
    const hits = searchFamilies(all, 'Guarnera')
    expect(hits).toHaveLength(1)
    expect(hits[0].guardianHit).toBe(true)
    expect(hits[0].childIds).toEqual(['Guarnera Lily', 'Guarnera Nico'])
  })

  it('в семье подсвечен ТОЛЬКО совпавший ребёнок, а не вся строка', () => {
    const hits = searchFamilies(all, 'Nico')
    expect(hits[0].childIds).toEqual(['Guarnera Nico'])
  })

  it('ничего не найдено — пустой список, а не вся страница', () => {
    expect(searchFamilies(all, 'Zzzz')).toHaveLength(0)
  })

  it('пустой запрос — все семьи и ни одной подсветки', () => {
    const hits = searchFamilies(all, '   ')
    expect(hits).toHaveLength(3)
    expect(hits.every(h => h.childIds.length === 0 && !h.guardianHit)).toBe(true)
  })

  it('дефис — граница слова: Mathews-Smith находится по Smith', () => {
    expect(nameMatches('Mathews-Smith Harlei', 'smith')).toBe(true)
  })

  it('диакритика не мешает: Núñez находится по Nunez', () => {
    expect(nameMatches('Núñez Sofía', 'nunez')).toBe(true)
  })

  it('оба слова обязаны совпасть — «Bella Guarnera» не находит чужую семью', () => {
    expect(searchFamilies(all, 'Bella Guarnera')).toHaveLength(0)
  })
})

// ============================================================================
// СЕМЬЯ — ГРУППА ДЕТЕЙ. Боевой случай Bates (Wickliffe): шесть детей, у каждого
// по два доверенных лица. Строкой-опекуном выходило восемь строк на одну семью.
// ============================================================================

describe('слияние домохозяйств', () => {
  const m = (rosterId: string, ...guardianIds: string[]) => ({ rosterId, guardianIds })

  it('общий опекун склеивает детей в один дом', () => {
    const hh = mergeHouseholds([m('a', 'g1'), m('b', 'g1'), m('c', 'g2')])
    expect(hh).toHaveLength(2)
    expect(hh.find(h => h.rosterIds.includes('a'))!.rosterIds).toEqual(['a', 'b'])
  })

  it('склейка идёт ПО ЦЕПОЧКЕ, а не по первому опекуну', () => {
    // A:{X,Y} · B:{Y} · C:{X} — один дом, хотя у B и C общих опекунов нет.
    const hh = mergeHouseholds([m('A', 'X', 'Y'), m('B', 'Y'), m('C', 'X')])
    expect(hh).toHaveLength(1)
    expect(hh[0].rosterIds).toEqual(['A', 'B', 'C'])
    expect(hh[0].guardianIds).toEqual(['X', 'Y'])
  })

  it('Bates: шесть детей и два опекуна — ОДНА строка', () => {
    const kids = ['armani', 'bella', 'khaza', 'kylie', 'yomii', 'carmella']
    const hh = mergeHouseholds(kids.map(k => m(k, 'jackson', 'booker')))
    expect(hh).toHaveLength(1)
    expect(hh[0].rosterIds).toHaveLength(6)
    expect(hh[0].guardianIds).toEqual(['booker', 'jackson'])
  })

  it('дубль связи не удваивает опекуна', () => {
    const hh = mergeHouseholds([m('a', 'g1', 'g1', 'g2')])
    expect(hh[0].guardianIds).toEqual(['g1', 'g2'])
  })

  it('ребёнок без опекуна — свой дом, ключ по нему самому', () => {
    const hh = mergeHouseholds([m('lonely')])
    expect(hh).toHaveLength(1)
    expect(hh[0].guardianIds).toEqual([])
    expect(hh[0].key).toBe('c:lonely')
  })

  it('ключ дома устойчив к порядку опекунов', () => {
    const a = mergeHouseholds([m('x', 'g2', 'g1')])[0].key
    const b = mergeHouseholds([m('x', 'g1', 'g2')])[0].key
    expect(a).toBe(b)
  })

  it('два независимых дома не сливаются', () => {
    const hh = mergeHouseholds([m('a', 'g1'), m('b', 'g2')])
    expect(hh).toHaveLength(2)
  })
})

describe('поиск находит и тех, кого строка не показывает', () => {
  const row: FamilyRow = {
    guardianId: 'h:booker+jackson', guardianName: 'Bryant Jackson · Deidra Booker',
    children: [{ rosterId: 'carmella', name: 'Carmella Sims', room: 'SA', frp: 'F', onFile: false, active: true }],
    others: [
      { rosterId: 'kylie', name: 'Bates Kylie', room: 'SA', frp: 'F', onFile: true, active: true },
      { rosterId: 'brinx', name: 'Sims Brinx', room: 'SA', frp: 'F', onFile: false, active: false, dateOut: '2026-06-12' },
    ],
  }

  it('«Bates Kylie» находит дом, хотя строкой этот ребёнок не идёт', () => {
    const hits = searchFamilies([row], 'Bates Kylie')
    expect(hits).toHaveLength(1)
    expect(hits[0].childIds).toEqual([])
    expect(hits[0].otherIds).toEqual(['kylie'])
  })

  it('причина названа словами, а не молчанием', () => {
    expect(whyNotListed(row.others![0])).toBe('application already on file')
    expect(whyNotListed(row.others![1])).toBe('left 06/12')
    expect(whyNotListed({ rosterId: 'p', name: 'X', room: 'A', frp: 'P', onFile: false, active: true }))
      .toContain('Paid')
  })

  it('дата ухода режется СТРОКОЙ, без new Date — иначе Нью-Йорк отдаст вчера', () => {
    expect(whyNotListed({ rosterId: 'z', name: 'Z', room: 'A', frp: 'F', onFile: false, active: false, dateOut: '2026-01-01' }))
      .toBe('left 01/01')
  })
})
