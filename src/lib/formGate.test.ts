import { describe, it, expect } from 'vitest'
import { formGate, splitGatedSlots, gatedKeys } from './formGate'

// ПОЛКА: форма есть, витрина её не выдаёт. Признак — в реестре, один на все двери.
const REG = {
  forms: {
    enroll: { current: 'v11' },
    iea: { current: 'v3', gated: true, gate: 'authority_approval' },
    parent_consent: { current: 'v2', gated: false },
  },
}

describe('полка форм', () => {
  it('не помеченная форма выдаётся', () => {
    expect(formGate(REG, 'enroll').gated).toBe(false)
  })

  it('помеченная — закрыта и говорит словами, почему', () => {
    const g = formGate(REG, 'iea')
    expect(g.gated).toBe(true)
    expect(g.reason).toMatch(/authority/i)
  })

  it('неизвестная форма не считается закрытой — молчание не запрет', () => {
    expect(formGate(REG, 'no_such_form').gated).toBe(false)
  })

  it('состав набора делится, и ПОРЯДОК не теряется', () => {
    const slots = [{ key: 'parent_consent' }, { key: 'iea' }, { key: 'enroll' }]
    const { issued, shelved } = splitGatedSlots(REG, slots)
    expect(issued.map(s => s.key)).toEqual(['parent_consent', 'enroll'])
    expect(shelved.map(s => s.slot.key)).toEqual(['iea'])
    expect(shelved[0].reason).toBeTruthy()
  })

  it('ключи для витрины отфильтровываются одним вызовом', () => {
    expect(gatedKeys(REG, ['enroll', 'iea', 'parent_consent'])).toEqual(['iea'])
  })

  it('пустой реестр никого не закрывает — отказ читать не равен запрету выдавать', () => {
    expect(formGate(null, 'enroll').gated).toBe(false)
    expect(splitGatedSlots(null, [{ key: 'enroll' }]).issued).toHaveLength(1)
  })
})
