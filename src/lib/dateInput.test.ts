// Tests for normalizeDateInput (platform-standards §6).
// No test runner is configured in this project yet; these assertions are also
// exercised standalone (see the commit's verification run). Runs under vitest/jest
// if one is added: `describe`/`it`/`expect`.
import { describe, it, expect } from 'vitest'
import { normalizeDateInput } from './dateInput'

describe('normalizeDateInput', () => {
  it('accepts the documented formats and expands 2-digit years', () => {
    for (const s of ['7/2/26', '07/02/26', '7-2-26', '070226', '7/2/2026', '07/02/2026', '7.2.26'])
      expect(normalizeDateInput(s)).toMatchObject({ ok: true, display: '07/02/2026', iso: '2026-07-02' })
  })

  it('applies the century window (00–49 → 20xx, 50–99 → 19xx)', () => {
    expect(normalizeDateInput('1/1/49').display).toBe('01/01/2049')
    expect(normalizeDateInput('1/1/50').display).toBe('01/01/1950')
    expect(normalizeDateInput('1/1/00').display).toBe('01/01/2000')
    expect(normalizeDateInput('1/1/99').display).toBe('01/01/1999')
  })

  it('rejects impossible dates', () => {
    expect(normalizeDateInput('13/45/26').ok).toBe(false)  // bad month/day
    expect(normalizeDateInput('4/31/26').ok).toBe(false)   // April has 30 days
    expect(normalizeDateInput('2/29/26').ok).toBe(false)   // 2026 not a leap year
  })

  it('accepts a valid leap day', () => {
    expect(normalizeDateInput('2/29/24')).toMatchObject({ ok: true, display: '02/29/2024' })
  })

  it('treats empty as not-ok but does not throw', () => {
    expect(normalizeDateInput('').ok).toBe(false)
    expect(normalizeDateInput('   ').display).toBe('')
  })
})
