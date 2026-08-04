import { describe, it, expect } from 'vitest'
import { transferRefusal } from './roomTransfer'

// ============================================================================
// ПЕРЕВОД БЕЗ ДАТЫ ДЕЙСТВИЯ — это перевод, о котором нельзя сказать, с какого
// дня он действует. Ратио и недельные счёты читаются именно от этого дня.
// ============================================================================

describe('отказ перевода без даты', () => {
  it('комната меняется, даты нет — отказ, и он объясняет зачем дата', () => {
    const r = transferRefusal('room-2', null)!
    expect(r).toContain('transfer date')
    expect(r.toLowerCase()).toContain('ratio')
  })

  it('пробелы датой не считаются', () => {
    expect(transferRefusal('room-2', '   ')).not.toBeNull()
  })

  it('дата есть — проходит', () => {
    expect(transferRefusal('room-2', '2026-09-01')).toBeNull()
  })

  it('комнату не меняли — переводить нечего, отказа нет', () => {
    expect(transferRefusal(null, null)).toBeNull()
  })
})
