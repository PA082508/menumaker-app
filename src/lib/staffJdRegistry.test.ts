import { describe, it, expect } from 'vitest'
import {
  STAFF_JD_BY_ROLE,
  ROLES_WITH_JD,
  jdForRole,
  signSetForRole,
  BYOD_ACK,
} from './staffJdRegistry'

describe('staffJdRegistry — §2 role → JD (1:1)', () => {
  it('maps the three delivered roles to their own single JD', () => {
    expect(jdForRole('teacher assistant')?.policyKey).toBe('Staff_JD_TeacherAssistant')
    expect(jdForRole('floater')?.policyKey).toBe('Staff_Floater_Takeover')
    expect(jdForRole('teacher')?.policyKey).toBe('Staff_JD_Teacher')
  })

  it('is 1:1 — every role maps to a distinct policy key', () => {
    const keys = ROLES_WITH_JD.map(r => STAFF_JD_BY_ROLE[r]!.policyKey)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('reconstitutes Nikolay’s identifiers as key + "_" + version', () => {
    expect(`${jdForRole('teacher')!.policyKey}_${jdForRole('teacher')!.version}`).toBe('Staff_JD_Teacher_v1')
    expect(`${jdForRole('floater')!.policyKey}_${jdForRole('floater')!.version}`).toBe('Staff_Floater_Takeover_v1')
  })

  it('normalizes case/whitespace on lookup', () => {
    expect(jdForRole('  Floater ')?.policyKey).toBe('Staff_Floater_Takeover')
    expect(jdForRole('TEACHER ASSISTANT')?.policyKey).toBe('Staff_JD_TeacherAssistant')
  })

  it('returns null for roles whose JD text has not arrived yet', () => {
    for (const r of ['cook', 'driver', 'office', 'director']) {
      expect(jdForRole(r)).toBeNull()
    }
  })

  it('returns null for empty/unknown roles', () => {
    expect(jdForRole(null)).toBeNull()
    expect(jdForRole(undefined)).toBeNull()
    expect(jdForRole('')).toBeNull()
    expect(jdForRole('nurse')).toBeNull()
  })

  it('every JD carries an ack line and the standard e-version field tail', () => {
    for (const r of ROLES_WITH_JD) {
      const jd = STAFF_JD_BY_ROLE[r]!
      expect(jd.ackLine.length).toBeGreaterThan(0)
      expect(jd.fields).toEqual(['namePrint', 'signature', 'date'])
    }
  })
})

describe('staffJdRegistry — sign-set', () => {
  it('a role with a JD signs its JD then §6 BYOD', () => {
    const set = signSetForRole('teacher assistant')
    expect(set.map(d => d.policyKey)).toEqual(['Staff_JD_TeacherAssistant', 'byod'])
  })

  it('a role without a JD yet still signs §6 BYOD', () => {
    expect(signSetForRole('cook')).toEqual([BYOD_ACK])
  })
})
