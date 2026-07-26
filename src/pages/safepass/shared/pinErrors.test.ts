// A database sentence must never reach the tablet. Pinned by the exact string that did on 27.07.
import { describe, it, expect } from 'vitest'
import { humanPinError } from './PinPad'

describe('humanPinError', () => {
  it('never returns the raw Postgres check-constraint text', () => {
    const raw = 'new row for relation "staff_time_events" violates check constraint "staff_time_events_event_type_check"'
    const shown = humanPinError(raw)
    expect(shown).not.toContain('staff_time_events')
    expect(shown).not.toContain('constraint')
    expect(shown).toBe('The system could not record this yet — tell the office; nothing was saved.')
  })
  it('names the fixer for a device problem', () => {
    expect(humanPinError('device not registered')).toContain('director')
    expect(humanPinError('no classroom')).toContain('director')
  })
  it('offers the paper panel when the network is gone', () => {
    expect(humanPinError('Failed to fetch')).toContain('paper panel')
  })
  it('is honest, not silent, on an empty or unknown error', () => {
    expect(humanPinError('')).toContain('connection')
    expect(humanPinError('something nobody predicted')).toContain('nothing was saved')
  })
})
