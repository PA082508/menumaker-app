import { describe, it, expect } from 'vitest'
import { dobGate, formDobOf, usDate } from './dobGate'

// Живая пара из истории Baron (замер 08.08): форма несёт 2020-01-13 (ошибка OCR),
// ребёнок в ростере — 2020-07-13. Гейт обязан загореться ИМЕННО здесь.
const baronForm = { child_name: 'Isaac Baron', birthdate: '2020-01-13',
  _ocr: { lowConfidence: ['day_phone', 'mailing.street', 'child_name'] } }

describe('гейт «DOB differs»', () => {
  it('горит на живой паре Baron — и не спрашивает у OCR разрешения', () => {
    const g = dobGate(baronForm, '2020-07-13')
    expect(g.kind).toBe('differs')
    expect(g.kind === 'differs' && g.line)
      .toBe('DOB differs: form 01/13/2020 vs child 07/13/2020 — is this the right child?')
  })

  it('поле birthdate НЕ помечено lowConfidence — гейт всё равно горит', () => {
    expect((baronForm._ocr.lowConfidence as string[])).not.toContain('birthdate')
    expect(dobGate(baronForm, '2020-07-13').kind).toBe('differs')
  })

  it('совпало — молчит', () => {
    expect(dobGate({ birthdate: '2017-05-13' }, '2017-05-13').kind).toBe('ok')
  })

  it('время в строке не мешает: сравниваются ДНИ, не мгновения', () => {
    expect(dobGate({ birthdate: '2017-05-13T00:00:00Z' }, '2017-05-13').kind).toBe('ok')
  })

  it('сверять нечего — так и говорит, а не «совпало»', () => {
    expect(dobGate({}, '2017-05-13')).toEqual({ kind: 'unknown', missing: 'form' })
    expect(dobGate({ birthdate: '2017-05-13' }, null)).toEqual({ kind: 'unknown', missing: 'child' })
    expect(dobGate({}, null)).toEqual({ kind: 'unknown', missing: 'both' })
  })

  it('ДР ищется во всех четырёх местах, где она встречается по типам', () => {
    expect(formDobOf({ dob: '2020-01-02' })).toBe('2020-01-02')
    expect(formDobOf({ child_dob: '2020-01-03' })).toBe('2020-01-03')
    expect(formDobOf({ birthdate: '2020-01-04' })).toBe('2020-01-04')
    expect(formDobOf({ birthday: '2020-01-05' })).toBe('2020-01-05')
    expect(formDobOf({ nothing: 1 })).toBeNull()
  })

  it('дата показывается как на бумаге', () => {
    expect(usDate('2020-07-13')).toBe('07/13/2020')
  })
})
