import { describe, it, expect } from 'vitest'
import { countersignSlot, COUNTERSIGN_SLOT } from './signatureSamples'
import { isProspect } from './enrollmentApprove'

// Slots are MEASURED from the live submissions, never invented.
describe('countersignSlot — fill the slot the form declares, mint none', () => {
  it('knows the two slots that exist in live data', () => {
    expect(countersignSlot('dcy_01234')).toBe('program_sig')
    expect(countersignSlot('iea')).toBe('sponsor_sig')
  })

  it('refuses to invent a slot for a form that has none', () => {
    // The registry marks child_release_authorization requires_countersign:director,
    // but its submissions carry only parent_sig — the form has no director slot.
    // Flagged for Nikolay; inventing a key here would write a signature into a
    // field the printed form does not have.
    expect(countersignSlot('child_release_authorization')).toBeNull()
    expect(countersignSlot('transition_into_program')).toBeNull()
    expect(countersignSlot('parent_consent')).toBeNull()
    expect(countersignSlot('anything_else')).toBeNull()
  })

  it('the map holds only measured slots', () => {
    expect(Object.keys(COUNTERSIGN_SLOT).sort()).toEqual(['dcy_01234', 'iea'])
  })
})

describe('isProspect — signed packet #1, fee never recorded', () => {
  const base = { submission_type: 'start_form', status: 'pending', fee_received_at: null }

  it('packet #1 pending with no fee is a prospect', () => {
    expect(isProspect(base)).toBe(true)
    expect(isProspect({ ...base, submission_type: 'parent_consent' })).toBe(true)
  })

  it('a recorded fee ends it', () => {
    expect(isProspect({ ...base, fee_received_at: '2026-07-16T10:00:00Z' })).toBe(false)
  })

  it('an approved family is not a prospect', () => {
    expect(isProspect({ ...base, status: 'approved' })).toBe(false)
  })

  it('a CACFP or IEA form is never a prospect — those are not packet #1', () => {
    expect(isProspect({ ...base, submission_type: 'cacfp_enrollment' })).toBe(false)
    expect(isProspect({ ...base, submission_type: 'iea' })).toBe(false)
  })

  it('Izabella’s live consent reads as a prospect today', () => {
    // fcc8547d… — parent_consent, pending, child_id null, no fee.
    expect(isProspect({ submission_type: 'parent_consent', status: 'pending', fee_received_at: undefined })).toBe(true)
  })
})
