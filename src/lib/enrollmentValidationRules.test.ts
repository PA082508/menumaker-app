import { describe, it, expect } from 'vitest'
import { validateSubmission } from './enrollmentValidationRules'

// Minimal well-formed CACFP submission; `meals` uses the packet form's short
// codes (b/as/l/ps/su/es). Override `mealsByDay` to exercise the slot rules.
function cacfp(mealsByDay: Record<string, Record<string, boolean>>) {
  const schedule: any = {}
  for (const [day, meals] of Object.entries(mealsByDay)) {
    schedule[day] = { in_care: true, arr1: '08:00', dep1: '17:00', meals }
  }
  return {
    child_name: 'Doe, Jane',
    birthdate: '2022-04-01',
    day_phone: '2165551212',
    mailing: { street: '1 Main', city: 'Parma', zip: '44129' },
    signature_date: '2026-07-01',
    schedule,
  }
}
const ALL_SLOTS = ['breakfast', 'am_snack', 'lunch', 'pm_snack', 'supper', 'evening_snack']
const val = (fd: any, activeMealSlots?: string[] | null) =>
  validateSubmission('cacfp_enrollment', fd, { activeMealSlots })

describe('CACFP meal-slot validation', () => {
  it('warns when a checked meal is outside the center active slots', () => {
    // Center serves breakfast/am_snack/lunch/supper — NOT pm_snack.
    const fd = cacfp({ mon: { b: true, ps: true } })
    const r = val(fd, ['breakfast', 'am_snack', 'lunch', 'supper'])
    expect(r.warnings.some(w => /doesn't serve/.test(w) && /PM Snack/.test(w))).toBe(true)
    expect(r.status).toBe('warnings') // advisory, not a hard error
  })

  it('does NOT warn about slots when active slots are unknown (fail open)', () => {
    const fd = cacfp({ mon: { b: true, ps: true } })
    const r = val(fd, null)
    expect(r.warnings.some(w => /doesn't serve/.test(w))).toBe(false)
  })

  it('does not warn when every checked meal is served', () => {
    const fd = cacfp({ mon: { b: true, l: true, su: true } })
    const r = val(fd, ['breakfast', 'am_snack', 'lunch', 'supper'])
    expect(r.warnings.some(w => /doesn't serve/.test(w))).toBe(false)
  })

  it('warns when a day exceeds the CACFP cap of 2 snacks', () => {
    // All 3 snacks in one day, center serves them all → cap, not off-slot.
    const fd = cacfp({ mon: { as: true, ps: true, es: true } })
    const r = val(fd, ALL_SLOTS)
    expect(r.warnings.some(w => /Exceeds CACFP daily maximum/.test(w))).toBe(true)
    expect(r.warnings.some(w => /doesn't serve/.test(w))).toBe(false)
  })

  it('does not flag the cap for a normal 3 meals + 2 snacks day', () => {
    const fd = cacfp({ mon: { b: true, as: true, l: true, ps: true, su: true } })
    const r = val(fd, ALL_SLOTS)
    expect(r.warnings.some(w => /Exceeds CACFP daily maximum/.test(w))).toBe(false)
  })

  it('counts the cap only over served meals', () => {
    // Parent over-checks 3 snacks but the center serves only am_snack → 1 snack.
    const fd = cacfp({ mon: { as: true, ps: true, es: true } })
    const r = val(fd, ['breakfast', 'am_snack', 'lunch', 'supper'])
    expect(r.warnings.some(w => /Exceeds CACFP daily maximum/.test(w))).toBe(false)
  })
})

describe('CACFP manual_entry softening', () => {
  // A manual entry the director typed: Care & meals present, classroom/FRP/Date In
  // present, but no phone / address / signature date (docs catch up later).
  const manualMinimal = (): any => ({
    child_name: 'Manualov, Test',
    birthdate: '2022-04-01',
    classroom_id: 'c-123', frp: 'F', date_in: '2026-07-09',
    schedule: { Mon: { in_care: true, arr1: '08:00', dep1: '17:00', meals: { b: true, l: true } } },
  })
  const manual = (fd: any) => validateSubmission('cacfp_enrollment', fd, { source: 'manual_entry' })
  const online = (fd: any) => validateSubmission('cacfp_enrollment', fd, { source: 'app' })

  it('does NOT block Approve when only phone/address/sig-date are missing (manual)', () => {
    const r = manual(manualMinimal())
    expect(r.missing).toEqual([])          // no hard blockers
    expect(r.status).not.toBe('errors')    // Approve allowed (warnings at most)
    expect(r.warnings.some(w => /docs pending/.test(w))).toBe(true)
  })

  it('still blocks the SAME record on the online/paper path (unchanged)', () => {
    const r = online(manualMinimal())
    expect(r.missing).toEqual(expect.arrayContaining(['Daytime phone', 'Mailing address (street, city, ZIP)', 'Signature date']))
    expect(r.status).toBe('errors')
  })

  it('keeps Care & meals a HARD requirement even for manual (not softened)', () => {
    const fd = manualMinimal(); fd.schedule = {}
    const r = manual(fd)
    expect(r.missing).toContain('At least one day with care hours and a meal')
    expect(r.status).toBe('errors')
  })

  it('requires classroom / FRP / Date In for manual', () => {
    const fd = manualMinimal(); delete fd.classroom_id; delete fd.frp; delete fd.date_in
    const r = manual(fd)
    expect(r.missing).toEqual(expect.arrayContaining(['Classroom', 'Meal status (FRP)', 'Date In']))
  })
})
