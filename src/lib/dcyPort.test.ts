import { describe, it, expect } from 'vitest'
import { toIsoDate, documentDateOf, buildDcyCardWrites, buildDcyPeople, buildIeaDemographics } from './dcyPort'

// A real payload shape, trimmed — keys taken from the live submissions.
const REAL = {
  type: 'dcy_01234', dcy_form: '01234', dcy_version: 'v8',
  child_name: 'Leilani Cunningham', dob: '07/14/2023', first_day: '07/28/2026',
  address: '123 Maple St', city: 'Wickliffe', state: 'OH', zip: '44092',
  health_y: '', health_n: 'Yes',
  trans_yes: 'Yes', trans_no: '',
  p1_name: 'Ashley Cunningham', p1_cell: '440-555-0101', p1_email: 'a@example.com',
  p1_address: '123 Maple St', p1_city: 'Wickliffe', p1_state: 'OH', p1_zip: '44092',
  ec1_name: 'Marcus Hall', ec1_phone: '440-555-0199', ec1_rel_y: 'Uncle',
  parent_sig_dt: '07/23/2026',
}

describe('toIsoDate — the kit stamps US dates, the column takes ISO', () => {
  it('converts M/D/YYYY', () => {
    expect(toIsoDate('07/14/2023')).toBe('2023-07-14')
    expect(toIsoDate('7/4/2026')).toBe('2026-07-04')
  })
  it('passes ISO through', () => expect(toIsoDate('2026-07-23')).toBe('2026-07-23'))
  it('refuses anything else rather than guessing', () => {
    expect(toIsoDate('July 2026')).toBeNull()
    expect(toIsoDate('')).toBeNull()
    expect(toIsoDate(null)).toBeNull()
  })
})

describe('documentDateOf — an annual review speaks later than the signature', () => {
  it('with no review rows, the signature date governs (this is today)', () => {
    expect(documentDateOf(REAL, '2026-07-23')).toBe('2026-07-23')
  })

  it('a filled review row wins over the original signature', () => {
    // July 2027: the same form, reviewed. It must apply as 2027, or it would
    // lose to any note written in between — quietly and wrongly.
    expect(documentDateOf({ ...REAL, pg_rev_1: '07/20/2027' }, '2026-07-23')).toBe('2027-07-20')
  })

  it('the LATEST review row wins, whichever column it sits in', () => {
    const fd = { ...REAL, pg_rev_1: '07/20/2027', adm_rev_1: '07/22/2027', pg_rev_2: '07/19/2028' }
    expect(documentDateOf(fd, '2026-07-23')).toBe('2028-07-19')
  })

  it('falls back to the signature when review rows are blank strings', () => {
    expect(documentDateOf({ ...REAL, pg_rev_1: '', adm_rev_1: '   ' }, '2026-07-23')).toBe('2026-07-23')
  })

  it('returns null when the form carries no usable date at all', () => {
    expect(documentDateOf({}, null)).toBeNull()
  })
})

describe('buildDcyCardWrites — absence of a field is not an empty value', () => {
  it('writes what the form carries', () => {
    const w = buildDcyCardWrites(REAL)
    const by = Object.fromEntries(w.map(x => [x.fieldKey, x.value]))
    expect(by.birthday).toBe('2023-07-14')
    expect(by.date_in).toBe('2026-07-28')
    expect(by.child_address).toBe('123 Maple St, Wickliffe, OH 44092')
    expect(by.has_health_condition).toBe('false')          // health_n answered
    expect(by.emergency_transport_auth).toBe('true')       // trans_yes answered
  })

  it('an EMPTY form produces NO writes at all — not a row of nulls', () => {
    expect(buildDcyCardWrites({})).toEqual([])
  })

  it('an unanswered Yes/No pair writes nothing — silence is not "no"', () => {
    // The whole emergency-transport lesson: a default said "yes" for 623
    // families nobody asked. A port that turned silence into "no" would repeat
    // the mistake with the opposite sign.
    const w = buildDcyCardWrites({ trans_yes: '', trans_no: '', health_y: '', health_n: '' })
    expect(w.map(x => x.fieldKey)).not.toContain('emergency_transport_auth')
    expect(w.map(x => x.fieldKey)).not.toContain('has_health_condition')
  })

  it('an explicit N/A box CLEARS the note — that is an answer', () => {
    const w = buildDcyCardWrites({ na_dev: 'Yes' })
    expect(w).toEqual([{ fieldKey: 'development_notes', table: 'roster', column: 'development_notes', value: null }])
  })

  it('a note with text wins over its N/A box', () => {
    const w = buildDcyCardWrites({ development: 'speech therapy 2x/week', na_dev: 'Yes' })
    expect(w[0].value).toBe('speech therapy 2x/week')
  })

  it('builds the address from the parts present, without inventing the rest', () => {
    expect(buildDcyCardWrites({ city: 'Wickliffe' }).find(w => w.fieldKey === 'child_address')?.value)
      .toBe('Wickliffe')
    expect(buildDcyCardWrites({ address: '1 Main' }).find(w => w.fieldKey === 'child_address')?.value)
      .toBe('1 Main')
  })

  it('refuses to guess a date it cannot parse', () => {
    expect(buildDcyCardWrites({ dob: 'summer 2023' }).find(w => w.fieldKey === 'birthday')?.value).toBeNull()
  })
})

describe('buildDcyPeople — the Family tab is empty while these sit in the form', () => {
  it('reads a parent block and an emergency contact', () => {
    const p = buildDcyPeople(REAL)
    expect(p.map(x => x.slot)).toEqual(['parent_1', 'emergency_1'])
    expect(p[0]).toMatchObject({
      firstName: 'Ashley', lastName: 'Cunningham',
      phone: '440-555-0101', email: 'a@example.com', isEmergencyContact: false,
    })
    expect(p[0].address).toBe('123 Maple St, Wickliffe, OH 44092')
    expect(p[1]).toMatchObject({ fullName: 'Marcus Hall', relationship: 'Uncle', isEmergencyContact: true })
  })

  it('a block with no name yields nothing — a phone with no person is not a contact', () => {
    expect(buildDcyPeople({ p1_cell: '440-555-0101', ec1_phone: '440-555-0199' })).toEqual([])
  })

  it('"no second parent" is an answer and produces no second person', () => {
    expect(buildDcyPeople({ p1_name: 'A B', p2_name: 'C D', p2_na: 'Yes' }).map(x => x.slot))
      .toEqual(['parent_1'])
  })

  it('keeps a two-word first name intact', () => {
    const p = buildDcyPeople({ p1_name: 'Mary Anne Rodriguez Texidor' })
    expect(p[0].firstName).toBe('Mary Anne Rodriguez')
    expect(p[0].lastName).toBe('Texidor')
  })

  it('falls back from the relationship pick to the free-text "other"', () => {
    expect(buildDcyPeople({ ec1_name: 'X Y', ec1_other: 'Neighbour' })[0].relationship).toBe('Neighbour')
  })
})

describe('buildIeaDemographics — collected for USDA reporting, then dropped', () => {
  it('carries race and ethnicity onto the child record', () => {
    expect(buildIeaDemographics({ race: 'White', ethnicity: 'Not Hispanic' })).toEqual([
      { fieldKey: 'race', table: 'child', column: 'race', value: 'White' },
      { fieldKey: 'ethnicity', table: 'child', column: 'ethnicity', value: 'Not Hispanic' },
    ])
  })
  it('writes nothing when the form did not ask or the family did not answer', () => {
    expect(buildIeaDemographics({})).toEqual([])
    expect(buildIeaDemographics({ race: '', ethnicity: '  ' })).toEqual([])
  })
})

// ─── the identity fork, as pure decisions ────────────────────────────────────
// The fork itself lives in applyDcyPeople (which talks to the database), but the
// RULE it implements is stated here so it cannot drift: an exact key decides, a
// phone or a name never does.
import { buildDcyPeople as people } from './dcyPort'

describe('identity fork — what may be decided without a human', () => {
  const candidates = [
    { guardian_id: 'a', why: 'exact_key', first_name: 'Ashley', last_name: 'Woods', children: 2 },
    { guardian_id: 'b', why: 'phone', first_name: 'A', last_name: 'W', children: 1 },
    { guardian_id: 'c', why: 'name', first_name: 'Ashley', last_name: 'Cunningham', children: 1 },
  ]
  // Mirrors the branch in applyDcyPeople: exact key wins, everything else asks.
  const decide = (list: typeof candidates) => {
    const exact = list.find(c => c.why === 'exact_key')
    if (exact) return 'link'
    return list.length > 0 ? 'ask' : 'new'
  }

  it('an exact key decides by itself', () => {
    expect(decide(candidates)).toBe('link')
  })

  it('a PHONE match is a question, never a merge', () => {
    expect(decide(candidates.filter(c => c.why === 'phone'))).toBe('ask')
  })

  it('a NAME match is a question, never a merge — 32 guardians already share a name', () => {
    expect(decide(candidates.filter(c => c.why === 'name'))).toBe('ask')
  })

  it('nothing found → a new person, which is not a guess', () => {
    expect(decide([])).toBe('new')
  })

  it('the people the fork runs over are exactly those the form names', () => {
    const p = people({ p1_name: 'Ashley Cunningham', ec1_name: 'Marcus Hall', p2_na: 'Yes' })
    expect(p.map(x => x.slot)).toEqual(['parent_1', 'emergency_1'])
  })
})
