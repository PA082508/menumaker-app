import { describe, it, expect } from 'vitest'
import { toText, changedFields, provenanceProblem, lockRefusal, type Provenance, type FieldLock } from './childFieldWrite'

const F = [
  { key: 'birthday', table: 'roster' as const, column: 'birthday' },
  { key: 'allergies', table: 'child_medical' as const, column: 'allergies' },
  { key: 'emergency_transport_auth', table: 'roster' as const, column: 'emergency_transport_auth' },
]

describe('toText — the card speaks many types, the journal stores one', () => {
  it('booleans become the words the column will cast back', () => {
    expect(toText(true)).toBe('true')
    expect(toText(false)).toBe('false')   // NOT null: "no" is an answer
  })
  it('blank of any shape is absence, not a value', () => {
    expect(toText('')).toBeNull()
    expect(toText('   ')).toBeNull()
    expect(toText(null)).toBeNull()
    expect(toText(undefined)).toBeNull()
  })
  it('everything else is trimmed text', () => {
    expect(toText(' 2021-09-29 ')).toBe('2021-09-29')
    expect(toText(0)).toBe('0')           // a zero is a value
  })
})

describe('changedFields — a field nobody touched is not a change', () => {
  it('returns only what actually differs', () => {
    const base = { birthday: '2021-09-29', allergies: null, emergency_transport_auth: null }
    const now = { birthday: '2021-09-29', allergies: 'peanuts', emergency_transport_auth: false }
    expect(changedFields(F, base, now).map(w => w.fieldKey)).toEqual(['allergies', 'emergency_transport_auth'])
  })

  it('false is a change from unknown — "no" is an answer, not an absence', () => {
    // The whole emergency-transport lesson in one assertion: unknown → "no" must
    // reach the column, or the fix that made 621 rows honest cannot be undone by
    // a director who actually has the paper.
    const w = changedFields(F, { emergency_transport_auth: null }, { emergency_transport_auth: false })
    expect(w).toHaveLength(1)
    expect(w[0].value).toBe('false')
  })

  it('clearing a value is a change, and travels as null', () => {
    const w = changedFields(F, { allergies: 'peanuts' }, { allergies: '' })
    expect(w).toHaveLength(1)
    expect(w[0].value).toBeNull()
  })

  it('an untouched card writes nothing at all', () => {
    const same = { birthday: '2021-09-29', allergies: 'peanuts', emergency_transport_auth: true }
    expect(changedFields(F, same, { ...same })).toEqual([])
  })

  it('carries the table and column the RPC needs to resolve the row', () => {
    const w = changedFields(F, {}, { allergies: 'peanuts' })
    expect(w[0]).toMatchObject({ table: 'child_medical', column: 'allergies' })
  })
})

describe('provenanceProblem — the two dates are not the same date', () => {
  const p = (o: Partial<Provenance>): Provenance =>
    ({ source: 'library_form', documentDate: null, formKey: null, ...o })

  it('a document must carry the date printed on it', () => {
    expect(provenanceProblem(p({ formKey: 'dcy_01234' })))
      .toMatch(/date printed on the document/)
  })

  it('a library form must say which form', () => {
    expect(provenanceProblem(p({ documentDate: '2026-07-15' })))
      .toMatch(/which library form/)
  })

  it('a complete library-form provenance passes', () => {
    expect(provenanceProblem(p({ documentDate: '2026-07-15', formKey: 'dcy_01234' }))).toBeNull()
  })

  it('a free document needs its date but no form key', () => {
    expect(provenanceProblem(p({ source: 'free_document', documentDate: '2026-07-15' }))).toBeNull()
    expect(provenanceProblem(p({ source: 'free_document' }))).toMatch(/date printed/)
  })

  it('a verbal note carries no document date — there is no document', () => {
    expect(provenanceProblem(p({ source: 'verbal' }))).toBeNull()
    expect(provenanceProblem(p({ source: 'verbal', documentDate: '2026-07-15' })))
      .toMatch(/cannot carry a document date/)
  })
})

describe('lockRefusal — the screen says what the save path would say', () => {
  const locked: FieldLock = {
    field_key: 'birthday', lock_level: 'document',
    needs_document_text: 'Birthday can only be changed from a signed document — attach the birth certificate or the enrolment form (DCY 01234) and enter the date printed on it.',
  }
  const marked: FieldLock = { field_key: 'allergies', lock_level: 'marked', needs_document_text: null }

  it('a locked field refuses a verbal note, in words that say what is NEEDED', () => {
    const msg = lockRefusal(locked, 'verbal')
    expect(msg).toContain('birth certificate')
    expect(msg).not.toMatch(/cannot|not allowed|forbidden/i)   // what is needed, not what is banned
  })

  it('a locked field accepts a document', () => {
    expect(lockRefusal(locked, 'library_form')).toBeNull()
    expect(lockRefusal(locked, 'free_document')).toBeNull()
  })

  it('a MARKED field takes a verbal note — an allergy learned at 9am belongs in the card at 9am', () => {
    expect(lockRefusal(marked, 'verbal')).toBeNull()
  })

  it('an unknown field is free — the lock list is an allow-list of restrictions, not of fields', () => {
    expect(lockRefusal(undefined, 'verbal')).toBeNull()
  })

  it('falls back to a spoken refusal if the text is ever missing', () => {
    expect(lockRefusal({ field_key: 'x', lock_level: 'document', needs_document_text: null }, 'verbal'))
      .toMatch(/signed document/)
  })
})

// ============================================================================
// НАПРАВЛЕННЫЙ ЗАМОК ВЫГОДЫ (04.08) — обе петли обязаны совпадать.
// Экран, который отказывает там, где сервер пропускает, хуже отсутствия экрана:
// он запрещает снять льготу, которой семья больше не соответствует, и ребёнок
// остаётся Free без основания. Это переклайм.
// ============================================================================

import { benefitDirection } from './childFieldWrite'

const LADDER = ['P', 'R', 'F']
const frpLock = {
  field_key: 'frp', lock_level: 'document' as const,
  needs_document_text: 'Raising a child to Reduced or Free needs a signed document — IEA or USDA waiver.',
  benefit_ladder: LADDER,
  needs_reason_text: 'Lowering a category needs a reason in your own words.',
}

describe('направление по лестнице выгоды', () => {
  it('вверх, вниз и на месте', () => {
    expect(benefitDirection(LADDER, 'P', 'F')).toBe('increase')
    expect(benefitDirection(LADDER, 'F', 'R')).toBe('decrease')
    expect(benefitDirection(LADDER, 'R', 'R')).toBe('same')
  })

  it('пустое старое: назначить Paid — понижение, назначить Free — повышение', () => {
    // Иначе через пустое значение открылся бы обход: стереть и назначить льготу со слов.
    expect(benefitDirection(LADDER, null, 'P')).toBe('decrease')
    expect(benefitDirection(LADDER, null, 'F')).toBe('increase')
  })

  it('регистр и лишние буквы не мешают', () => {
    expect(benefitDirection(LADDER, 'free', 'paid')).toBe('decrease')
  })

  it('без лестницы направления нет', () => {
    expect(benefitDirection(null, 'P', 'F')).toBe('unknown')
  })
})

describe('гейт по НОВОМУ значению — экран и сервер говорят одно', () => {
  // Reduced и Free — доходные категории: определяются шкалой по документу, и
  // «со слов» дохода не бывает. Поэтому направление тут ни при чём — важно, КУДА
  // пришли. F→R со слов отказывается наравне с P→F.
  it('со слов к Free — отказ с названием документа', () => {
    expect(lockRefusal(frpLock, 'verbal', { oldValue: 'P', newValue: 'F' })!).toContain('IEA')
  })

  it('со слов к Reduced — отказ ДАЖЕ ВНИЗ, с F', () => {
    const r = lockRefusal(frpLock, 'verbal', { oldValue: 'F', newValue: 'R', note: 'they said' })!
    expect(r).toContain('IEA')
  })

  it('со слов к Paid БЕЗ причины — отказ про причину', () => {
    expect(lockRefusal(frpLock, 'verbal', { oldValue: 'F', newValue: 'P' })!.toLowerCase()).toContain('reason')
  })

  it('со слов к Paid С ПРИЧИНОЙ — проходит, хоть с F, хоть с R', () => {
    expect(lockRefusal(frpLock, 'verbal', { oldValue: 'F', newValue: 'P', note: 'income went up' })).toBeNull()
    expect(lockRefusal(frpLock, 'verbal', { oldValue: 'R', newValue: 'P', note: 'stopped claiming' })).toBeNull()
  })

  it('пустое старое: к Paid со слов можно, к Free — нет', () => {
    expect(lockRefusal(frpLock, 'verbal', { oldValue: null, newValue: 'P', note: 'no application' })).toBeNull()
    expect(lockRefusal(frpLock, 'verbal', { oldValue: null, newValue: 'F', note: 'x' })!).toContain('IEA')
  })

  it('повышение С ДОКУМЕНТОМ — проходит', () => {
    expect(lockRefusal(frpLock, 'library_form', { oldValue: 'P', newValue: 'F' })).toBeNull()
  })

  it('соседний замок НЕ ослаблен: день рождения со слов по-прежнему отбит', () => {
    const bday = { field_key: 'birthday', lock_level: 'document' as const,
      needs_document_text: 'Birthday can only be changed from a signed document.',
      benefit_ladder: null, needs_reason_text: null }
    expect(lockRefusal(bday, 'verbal', { oldValue: '2023-01-01', newValue: '2020-01-01' }))
      .toContain('signed document')
  })
})

// ============================================================================
// ДАТЫ ЗАЧИСЛЕНИЯ И УХОДА (заход F): причина обязательна, денежный гейт слышен
// до сети. Числа в отказе — те же, что назовёт сервер: он их и считает.
// ============================================================================

import { endDateRefusal } from './childFieldWrite'

const dateLock = {
  field_key: 'date_out', lock_level: 'marked' as const,
  needs_document_text: null, benefit_ladder: null,
  needs_reason: true,
  needs_reason_text: 'Say in your own words why this date changed.',
}

describe('причина у даты', () => {
  it('со слов без причины — отказ', () => {
    expect(lockRefusal(dateLock, 'verbal', { oldValue: null, newValue: '2026-08-01' })!)
      .toContain('why this date changed')
  })
  it('со слов с причиной — проходит', () => {
    expect(lockRefusal(dateLock, 'verbal',
      { oldValue: null, newValue: '2026-08-01', note: 'family gave notice' })).toBeNull()
  })
  it('marked без требования причины остаётся свободным', () => {
    expect(lockRefusal({ ...dateLock, needs_reason: false }, 'verbal', { newValue: '2026-08-01' })).toBeNull()
  })
})

describe('денежный гейт даты ухода', () => {
  it('дата ПОЗЖЕ последней отметки — проходит', () => {
    expect(endDateRefusal('2026-08-03', 0, '2026-08-10', false)).toBeNull()
  })
  it('дата РАНЬШЕ последней отметки — отказ С ЧИСЛАМИ', () => {
    const r = endDateRefusal('2026-08-03', 4, '2026-07-31', false)!
    expect(r).toContain('2026-08-03')
    expect(r).toContain('2026-07-31')
    expect(r).toContain('4 mark(s)')
  })
  it('подтверждено явно — проходит', () => {
    expect(endDateRefusal('2026-08-03', 4, '2026-07-31', true)).toBeNull()
  })
  it('ровно в день последней отметки — проходит: этот день ребёнок ещё был', () => {
    expect(endDateRefusal('2026-08-03', 0, '2026-08-03', false)).toBeNull()
  })
  it('отметок нет вовсе — гейту нечего защищать', () => {
    expect(endDateRefusal(null, 0, '2026-07-31', false)).toBeNull()
  })
})
