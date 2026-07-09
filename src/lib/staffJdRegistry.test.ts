import { describe, it, expect } from 'vitest'
import {
  STAFF_JD_BY_ROLE,
  ROLES_WITH_JD,
  jdForRole,
  signSetForRole,
  BYOD_ACK,
} from './staffJdRegistry'

describe('staffJdRegistry — §2 role → JD (1:1)', () => {
  it('maps every role to its own per-age-group / position doc', () => {
    expect(jdForRole('director')?.policyKey).toBe('Staff_JD_Director')
    expect(jdForRole('director helper')?.policyKey).toBe('Staff_JD_DirectorHelper')
    expect(jdForRole('infant-toddler lead')?.policyKey).toBe('Staff_JD_InfantToddlerLead')
    expect(jdForRole('infant-toddler assistant')?.policyKey).toBe('Staff_JD_InfantToddlerAssistant')
    expect(jdForRole('preschool lead')?.policyKey).toBe('Staff_JD_PreschoolLead')
    expect(jdForRole('preschool assistant')?.policyKey).toBe('Staff_JD_PreschoolAssistant')
    expect(jdForRole('school-age lead')?.policyKey).toBe('Staff_JD_SchoolAgeLead')
    expect(jdForRole('school-age assistant')?.policyKey).toBe('Staff_JD_SchoolAgeAssistant')
    expect(jdForRole('floater')?.policyKey).toBe('Staff_Floater_Takeover')
  })

  it('is 1:1 — every role maps to a distinct policy key', () => {
    const keys = ROLES_WITH_JD.map(r => STAFF_JD_BY_ROLE[r]!.policyKey)
    expect(new Set(keys).size).toBe(keys.length)
    expect(keys.length).toBe(9) // 8 role contracts + floater
  })

  it('reconstitutes identifiers as key + "_" + version', () => {
    expect(`${jdForRole('director')!.policyKey}_${jdForRole('director')!.version}`).toBe('Staff_JD_Director_v1')
    expect(`${jdForRole('school-age assistant')!.policyKey}_${jdForRole('school-age assistant')!.version}`).toBe('Staff_JD_SchoolAgeAssistant_v1')
  })

  it('normalizes case/whitespace on lookup', () => {
    expect(jdForRole('  Preschool Lead ')?.policyKey).toBe('Staff_JD_PreschoolLead')
    expect(jdForRole('DIRECTOR')?.policyKey).toBe('Staff_JD_Director')
  })

  it('retires the generic teaching JDs from Increment 1', () => {
    expect(jdForRole('teacher')).toBeNull()
    expect(jdForRole('teacher assistant')).toBeNull()
  })

  it('returns null for roles whose JD text has not arrived yet', () => {
    for (const r of ['cook', 'driver', 'office']) {
      expect(jdForRole(r)).toBeNull()
    }
  })

  it('returns null for empty/unknown roles', () => {
    expect(jdForRole(null)).toBeNull()
    expect(jdForRole(undefined)).toBeNull()
    expect(jdForRole('')).toBeNull()
    expect(jdForRole('nurse')).toBeNull()
  })

  it('every JD carries a native ack line and the standard e-version field tail', () => {
    for (const r of ROLES_WITH_JD) {
      const jd = STAFF_JD_BY_ROLE[r]!
      expect(jd.ackLine.length).toBeGreaterThan(0)
      expect(jd.fields).toEqual(['namePrint', 'signature', 'date'])
    }
  })

  it('assistant ack lines use correct grammar ("as an Assistant")', () => {
    expect(jdForRole('preschool assistant')!.ackLine).toContain('as an Assistant')
    expect(jdForRole('school-age assistant')!.ackLine).toContain('as an Assistant')
    expect(jdForRole('infant-toddler assistant')!.ackLine).toContain('as an Assistant')
  })
})

describe('staffJdRegistry — sign-set', () => {
  it('a role with a JD signs its JD then §6 BYOD', () => {
    const set = signSetForRole('director')
    expect(set.map(d => d.policyKey)).toEqual(['Staff_JD_Director', 'byod'])
  })

  it('a role without a JD yet still signs §6 BYOD', () => {
    expect(signSetForRole('cook')).toEqual([BYOD_ACK])
  })
})
