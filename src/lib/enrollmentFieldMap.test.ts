import { describe, it, expect } from 'vitest'
import { buildDiff, RATE_CRITICAL } from './enrollmentFieldMap'

// «Доверять только подписанному документу связанным с возмещением; изменения
//  директором — только не влияющие на определение рейтов» (Николай, 2026-07-16)
describe('rate-critical fields are locked to the signed form', () => {
  const fd = {
    child_name: 'Izabella Rodriguez Texidor ',
    birthdate: '2024-10-05',
    signature_date: '2026-07-06',
    day_phone: '2165550100',
    parent_email: 'parent@example.com',
    mailing: { street: '1 Main St', city: 'Wickliffe', zip: '44092' },
  }
  const rows = buildDiff('cacfp_enrollment', fd, null)

  it('birthdate cannot be edited — age decides the meal pattern and the rate band', () => {
    const r = rows.find(x => x.label.toLowerCase().includes('birth'))!
    expect(r).toBeTruthy()
    expect(r.editPath).toBeUndefined()
    expect(r.rateLocked).toBe(true)
  })

  it('signature_date cannot be edited — it would let a click flip the recency rule', () => {
    const r = rows.find(x => x.label.toLowerCase().includes('signature'))!
    expect(r).toBeTruthy()
    expect(r.editPath).toBeUndefined()
    expect(r.rateLocked).toBe(true)
  })

  it('phone, e-mail and address stay editable — they decide nothing about money', () => {
    for (const p of ['day_phone', 'parent_email', 'mailing.street', 'mailing.city', 'mailing.zip']) {
      const r = rows.find(x => x.editPath === p)
      expect(r, `expected ${p} to be an editable row`).toBeTruthy()
      expect(r!.rateLocked).toBeUndefined()
    }
  })

  it('no rate-critical path survives as editable anywhere in the CACFP diff', () => {
    for (const r of rows) {
      if (r.editPath) expect(RATE_CRITICAL.has(r.editPath)).toBe(false)
    }
  })

  it('the lock holds on the IEA diff too', () => {
    const iea = buildDiff('iea', { signature_date: '2026-07-06', adult: { print_name: 'A', day_phone: '1' } }, null)
    for (const r of iea) {
      if (r.editPath) expect(RATE_CRITICAL.has(r.editPath)).toBe(false)
    }
  })

  it('a locked field that is empty is not silently fillable', () => {
    const bare = buildDiff('cacfp_enrollment', { child_name: 'X Y' }, null)
    const dob = bare.find(x => x.label.toLowerCase().includes('birth'))!
    expect(dob.editPath).toBeUndefined()
    expect(dob.rateLocked).toBe(true)
  })
})
