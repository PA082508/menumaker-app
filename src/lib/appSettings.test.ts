import { describe, it, expect } from 'vitest'
import { resolveSetting, ATTACH_SCANS_KEY } from './appSettings'

// ============================================================================
// «СВОЁ ПЕРЕКРЫВАЕТ ОБЩЕЕ» — правило, которое иначе читается на глаз в трёх
// местах. Так уже живут федеральные 60 дней против огайских 45; новый ключ
// обязан вести себя ТАК ЖЕ, иначе одна настройка будет считаться иначе другой.
// ============================================================================

const ORG = 'org-1'

describe('разрешение настройки', () => {
  it('строка организации перекрывает платформенную', () => {
    expect(resolveSetting([{ org_id: null, value: false }, { org_id: ORG, value: true }], ORG, false)).toBe(true)
  })

  it('своей строки нет — берётся платформенная', () => {
    expect(resolveSetting([{ org_id: null, value: true }], ORG, false)).toBe(true)
  })

  it('чужая организация своей не считается', () => {
    expect(resolveSetting([{ org_id: 'other', value: true }], ORG, false)).toBe(false)
  })

  it('нет ни одной строки — умолчание вызывающего', () => {
    expect(resolveSetting([], ORG, false)).toBe(false)
    expect(resolveSetting([], ORG, true)).toBe(true)
  })

  it('null в значении не считается ответом — падаем на следующий уровень', () => {
    expect(resolveSetting([{ org_id: null, value: true }, { org_id: ORG, value: null }], ORG, false)).toBe(true)
  })

  it('ключ назван один раз и берётся отсюда', () => {
    expect(ATTACH_SCANS_KEY).toBe('attach_scans_of_paper_forms')
  })
})
