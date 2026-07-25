import { describe, it, expect } from 'vitest'
import { fmtDateOnly } from './dateOnly'

describe('fmtDateOnly', () => {
  it('renders a date-only string on its own day regardless of timezone (no off-by-one)', () => {
    // The bug: new Date('2024-04-03').toLocaleDateString() → "4/2/2024" in NY. Slice must not.
    expect(fmtDateOnly('2024-04-03')).toBe('4/3/2024')
  })
  it('drops leading zeros (en-US style) and ignores any time part', () => {
    expect(fmtDateOnly('2024-10-05')).toBe('10/5/2024')
    expect(fmtDateOnly('2024-04-03T00:00:00Z')).toBe('4/3/2024')
  })
  it('returns an em dash for empty values', () => {
    expect(fmtDateOnly(null)).toBe('—')
    expect(fmtDateOnly(undefined)).toBe('—')
    expect(fmtDateOnly('')).toBe('—')
  })
  it('passes through a non-ISO string unchanged', () => {
    expect(fmtDateOnly('n/a')).toBe('n/a')
  })
})
