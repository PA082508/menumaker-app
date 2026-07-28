import { describe, it, expect } from 'vitest'
import { stripStoredKey, STORED_KEY_COLUMNS } from './rosterKey'

// The stored key is never rebuilt (Nikolay, 2026-07-28). roster.child_name is
// the identity key into meal_week_records; rewriting it on an existing child
// desyncs that child's already-written meal marks. Display order is a RENDER
// rule, not a write rule — which is exactly how two save paths had it wrong.
describe('stripStoredKey — a stored key is never rebuilt', () => {
  it('removes child_name from an update patch', () => {
    const out = stripStoredKey({
      first_name: 'Izabella', last_name: 'Rodriguez Texidor',
      child_name: 'Rodriguez Texidor Izabella',   // the shape both save paths used to send
      birthday: '2021-09-29',
    })
    expect('child_name' in out).toBe(false)
    // everything else survives untouched — this is a guard, not a filter
    expect(out).toEqual({
      first_name: 'Izabella', last_name: 'Rodriguez Texidor', birthday: '2021-09-29',
    })
  })

  it('is a no-op on a patch that never carried the key', () => {
    const patch = { frp: 'F', frp_expires: '2027-07-31', milk_kind: '1%' }
    expect(stripStoredKey(patch)).toEqual(patch)
  })

  it('keeps falsy values that are NOT the key (null must reach the column)', () => {
    // date_out: null is how a child is un-departed; dropping it would break that.
    const out = stripStoredKey({ date_out: null, frp: '', milk_kind: undefined, child_name: 'X Y' })
    expect(out).toEqual({ date_out: null, frp: '', milk_kind: undefined })
    expect('date_out' in out).toBe(true)
  })

  it('re-adding child_name to a patch cannot bring the bug back', () => {
    // The point of a guard over a deleted line: a future edit that puts the
    // field back into the literal still cannot write it.
    const regressed = { first_name: 'A', child_name: `${'B'} ${'A'}` }
    expect(stripStoredKey(regressed)).toEqual({ first_name: 'A' })
  })

  it('the key list is exactly child_name — widening it is a deliberate act', () => {
    expect([...STORED_KEY_COLUMNS]).toEqual(['child_name'])
  })
})
