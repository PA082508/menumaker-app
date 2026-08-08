import { describe, it, expect } from 'vitest'
import { householdOf, householdTitle, householdKey } from './enrollmentTitle'

// Форма замерена по боевой базе 08.08: `children: [{ name, dob, case_no, … }]`,
// имя одной строкой — «Isaac Rife».
const rife = { children: [{ name: 'Isaac Rife', dob: '2017-05-13' }, { name: 'Amari Rife', dob: '2019-02-01' }] }
const graves = { children: [{ name: 'Teighan Graves' }, { name: 'Jaxon Graves' }, { name: 'Nova Graves' }] }

describe('титул семейной заявки', () => {
  it('пример со скрина владельца: «Rife household · 2 children»', () => {
    expect(householdTitle(rife)).toBe('Rife household · 2 children')
  })

  it('один ребёнок — единственное число', () => {
    expect(householdTitle({ children: [{ name: 'Isaac Rife' }] })).toBe('Rife household · 1 child')
  })

  it('фамилия — САМАЯ ЧАСТАЯ: сводную семью нельзя звать по младшему роду', () => {
    const blended = { children: [{ name: 'Ann Smith' }, { name: 'Bo Smith' }, { name: 'Cy Jones' }] }
    expect(householdTitle(blended)).toBe('Smith household · 3 children')
  })

  it('фамилии не видно — «Household», без выдуманного имени', () => {
    expect(householdTitle({ children: [{ name: 'Isaac' }, { name: 'Amari' }] }))
      .toBe('Household · 2 children')
  })

  it('нет списка детей — титула НЕТ (строка останется честным «(no name)»)', () => {
    expect(householdTitle({})).toBeNull()
    expect(householdTitle({ children: [] })).toBeNull()
    expect(householdTitle({ children: [{ dob: '2020-01-01' }] })).toBeNull()   // имён нет
    expect(householdTitle(null)).toBeNull()
    // Тип `other` (13 строк, все — сфотографированные НЕ заявки): титула нет.
    expect(householdTitle({ _ocr: {}, scan_ref: 'x' })).toBeNull()
  })

  it('счёт детей берётся из ДЛИНЫ списка, а не из числа читаемых имён', () => {
    const h = householdOf({ children: [{ name: 'Isaac Rife' }, { dob: '2019-02-01' }] })
    expect(h?.count).toBe(2)
    expect(h?.names).toEqual(['Isaac Rife'])
  })
})

describe('ключ группировки семьи', () => {
  it('РАЗНЫЕ семьи больше не слипаются в общую корзину «(no name)»', () => {
    expect(householdKey(rife)).not.toBe(householdKey(graves))
    expect(householdKey(rife)).toBeTruthy()
  })

  it('ОДНА семья сходится в одну строку, даже если порядок детей и слов другой', () => {
    const same = { children: [{ name: 'Rife Amari' }, { name: 'Rife Isaac' }] }
    expect(householdKey(same)).toBe(householdKey(rife))
  })

  it('нет списка детей — ключа нет, и группировка ведёт себя как прежде', () => {
    expect(householdKey({ _ocr: {} })).toBeNull()
  })
})
