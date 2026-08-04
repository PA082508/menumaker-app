import { describe, it, expect } from 'vitest'
import { paperCoversDay, IEA_DOC_TYPE } from './ieaOnFile'

// ============================================================================
// ДЕЙСТВУЮЩИЙ ПЕРИОД БУМАГИ — там, где ошибка не видна глазами.
// Ошибиться здесь значит погасить жёлтую плашку у ребёнка с ПРОСРОЧЕННОЙ
// бумагой: экран скажет «всё в порядке», а на проверке денег за него не дадут.
// ============================================================================

const doc = (o: Partial<Parameters<typeof paperCoversDay>[0]> = {}) => ({
  roster_id: 'r1', valid_from: '2026-07-15', valid_until: '2027-07-31', ...o,
})

describe('бумага действует на день', () => {
  it('внутри периода — да', () => {
    expect(paperCoversDay(doc(), '2026-08-04')).toBe(true)
  })

  it('границы ВКЛЮЧИТЕЛЬНЫЕ с обеих сторон', () => {
    // Подписанная сегодня действует сегодня; истекающая сегодня — ещё действует.
    expect(paperCoversDay(doc(), '2026-07-15')).toBe(true)
    expect(paperCoversDay(doc(), '2027-07-31')).toBe(true)
  })

  it('до подписи — нет: бумага не действует задним числом', () => {
    expect(paperCoversDay(doc(), '2026-07-14')).toBe(false)
  })

  it('после срока — нет, и это главное, ради чего проба существует', () => {
    expect(paperCoversDay(doc(), '2027-08-01')).toBe(false)
  })

  it('без срока — действует без конца (срок бывает не проставлен)', () => {
    expect(paperCoversDay(doc({ valid_until: null }), '2030-01-01')).toBe(true)
  })

  it('без даты с бумаги — не действует НИКОГДА', () => {
    // База такую строку и не примет (CHECK documents_paper_needs_date), но
    // считать «нет даты» за «действует» нельзя ни при каких обстоятельствах.
    expect(paperCoversDay(doc({ valid_from: null }), '2026-08-04')).toBe(false)
  })

  it('строка без ребёнка не гасит ничью плашку', () => {
    expect(paperCoversDay(doc({ roster_id: null }), '2026-08-04')).toBe(false)
  })
})

describe('тип из реестра', () => {
  it('бумажная IEA несёт тот же код, что и остальные — реестр один', () => {
    expect(IEA_DOC_TYPE).toBe('ieg_application')
  })
})
