import { describe, it, expect } from 'vitest'
import { COUNTERSIGN_SLOT } from './signatureSamples'
import {
  signatureRequired, groupSubmissionsByChild,
  type GroupableSubmission, duplicateMarks,
} from './enrollmentGrouping'

let seq = 0
const sub = (o: Partial<GroupableSubmission> & { type: string; name?: any; at?: string }): GroupableSubmission => ({
  id: o.id ?? `s${seq++}`,
  submission_type: o.type,
  form_data: { child_name: o.name },
  child_id: o.child_id ?? null,
  status: o.status ?? 'pending',
  created_at: o.at ?? '2026-07-17T10:00:00Z',
})

describe('signatureRequired — то, что объявляет слот подписи (карта COUNTERSIGN_SLOT)', () => {
  it('истина для форм, объявивших слот — карта, а не второй список', () => {
    // Карта живёт в signatureSamples и МЕНЯЕТСЯ: 05.08 в неё вошла cacfp_enrollment
    // (подпись программного администратора), а iea ушла в свою доходную ветку.
    // Тест сверяется С КАРТОЙ, а не с датой её состояния — иначе он падал бы
    // каждый раз, когда владелец переставляет подписи, и его чинили бы «по факту».
    for (const t of Object.keys(COUNTERSIGN_SLOT)) expect(signatureRequired(t)).toBe(true)
  })
  it('ложь для всего, чего в карте нет', () => {
    for (const t of ['consent', 'parents_book_ack', 'unknown_form', 'iea'])
      expect(signatureRequired(t)).toBe(Object.keys(COUNTERSIGN_SLOT).includes(t))
  })
})

describe('groupSubmissionsByChild', () => {
  it('folds all forms of one child into a single group', () => {
    const groups = groupSubmissionsByChild([
      sub({ type: 'cacfp_enrollment', name: 'Hazel Broadwater' }),
      sub({ type: 'parent_consent', name: 'Hazel Broadwater' }),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].submissions).toHaveLength(2)
    expect(groups[0].childName).toBe('Hazel Broadwater')
  })

  it('groups regardless of token order and case (typed-name robustness)', () => {
    const groups = groupSubmissionsByChild([
      sub({ type: 'cacfp_enrollment', name: 'Hazel Broadwater' }),
      sub({ type: 'parent_consent', name: 'broadwater  hazel' }),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].submissions).toHaveLength(2)
  })

  it('keeps different children in different groups', () => {
    const groups = groupSubmissionsByChild([
      sub({ type: 'cacfp_enrollment', name: 'Hazel Broadwater' }),
      sub({ type: 'cacfp_enrollment', name: 'Aaron Broadwater' }),
    ])
    expect(groups).toHaveLength(2)
  })

  it('counts the signature forms in the group', () => {
    const groups = groupSubmissionsByChild([
      sub({ type: 'dcy_01234', name: 'Hazel Broadwater' }),
      // Список подписных менялся дважды за день: 22.07 из него ушла iea, 05.08
      // вошла и в тот же день вышла форма питания (поворот канона — она
      // контрподписи не требует). Поэтому вторая подписная здесь — start_form,
      // а тест сверяется с картой, а не с её состоянием на час написания.
      sub({ type: 'start_form', name: 'Hazel Broadwater' }),
      sub({ type: 'parent_consent', name: 'Hazel Broadwater' }),
    ])
    expect(groups[0].signatureCount).toBe(2)
  })

  it('does NOT count a filed (received) signature form — filed is a fact, not a task', () => {
    const groups = groupSubmissionsByChild([
      sub({ type: 'dcy_01234', name: 'Hazel Broadwater', status: 'received' }),
      sub({ type: 'start_form', name: 'Hazel Broadwater', status: 'pending' }),
    ])
    // Two signature-required forms, but the received one is filed → only the
    // pending one is still awaiting a signature.
    expect(groups[0].submissions).toHaveLength(2)
    expect(groups[0].signatureCount).toBe(1)
  })

  it('buckets a blank name into a single (no name) group rather than dropping it', () => {
    const groups = groupSubmissionsByChild([
      sub({ type: 'parent_consent', name: '' }),
      sub({ type: 'parent_consent', name: undefined }),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].childName).toBe('(no name)')
    expect(groups[0].submissions).toHaveLength(2)
  })

  it('orders groups by newest submission first', () => {
    const groups = groupSubmissionsByChild([
      sub({ type: 'parent_consent', name: 'Old Child', at: '2026-07-10T09:00:00Z' }),
      sub({ type: 'parent_consent', name: 'New Child', at: '2026-07-17T09:00:00Z' }),
    ])
    expect(groups.map(g => g.childName)).toEqual(['New Child', 'Old Child'])
  })
})

// ── Семейные заявки (08.08) ─────────────────────────────────────────────────
// Две болезни одной строкой: титул «(no name)» И слипание разных семей в одну
// корзину. Вторая опаснее: она прячет чужую заявку внутри чужой семьи.
describe('семейные заявки без child_name', () => {
  const iea = (id: string, names: string[], at: string) => ({
    id, submission_type: 'iea', child_id: null, status: 'pending', created_at: at,
    form_data: { children: names.map(n => ({ name: n })) },
  })

  it('разные семьи — разные строки, и каждая названа своей фамилией', () => {
    const gs = groupSubmissionsByChild([
      iea('a', ['Isaac Rife', 'Amari Rife'], '2026-08-05T00:24:00Z'),
      iea('b', ['Teighan Graves', 'Jaxon Graves', 'Nova Graves'], '2026-08-04T00:00:00Z'),
    ])
    expect(gs).toHaveLength(2)
    expect(gs.map(g => g.childName).sort()).toEqual([
      'Graves household · 3 children', 'Rife household · 2 children',
    ])
  })

  it('две заявки ОДНОЙ семьи — одна строка', () => {
    const gs = groupSubmissionsByChild([
      iea('a', ['Isaac Rife', 'Amari Rife'], '2026-08-05T00:24:00Z'),
      iea('b', ['Amari Rife', 'Isaac Rife'], '2026-08-05T00:29:00Z'),
    ])
    expect(gs).toHaveLength(1)
    expect(gs[0].submissions).toHaveLength(2)
  })

  it('строка без имени И без списка детей остаётся честным «(no name)»', () => {
    const gs = groupSubmissionsByChild([
      { id: 'x', submission_type: 'other', child_id: null, status: 'rejected',
        created_at: '2026-07-06T15:11:00Z', form_data: { _ocr: {}, scan_ref: 'p.jpg' } },
    ])
    expect(gs[0].childName).toBe('(no name)')
  })
})

// ── Двойники одной формы (08.08, случай Rife) ───────────────────────────────
describe('двойники: свежая побеждает, старая остаётся историей', () => {
  const sub = (id: string, at: string, child = 'c1', type = 'cacfp_enrollment') => ({
    id, submission_type: type, child_id: child, status: 'approved', created_at: at,
    form_data: { child_name: 'Isaac Rife' },
  })

  it('пара Rife: свежая — действующая, старая помечена, но не спрятана', () => {
    const m = duplicateMarks([sub('777aa03c', '2026-08-05T00:24:27Z'), sub('0d9e5db9', '2026-08-05T00:29:57Z')])
    expect(m.get('0d9e5db9')).toEqual({ total: 2, rank: 1, current: true })
    expect(m.get('777aa03c')).toEqual({ total: 2, rank: 2, current: false })
    expect(m.size).toBe(2)                     // обе видимы, ни одна не выброшена
  })

  it('одиночная форма отметки НЕ получает — «1 of 1» это шум', () => {
    expect(duplicateMarks([sub('a', '2026-08-05T00:24:27Z')]).size).toBe(0)
  })

  it('разные ТИПЫ форм одного ребёнка двойниками не считаются', () => {
    const m = duplicateMarks([
      sub('a', '2026-08-05T00:24:27Z', 'c1', 'cacfp_enrollment'),
      sub('b', '2026-08-05T00:26:52Z', 'c1', 'child_release_authorization'),
    ])
    expect(m.size).toBe(0)
  })

  it('разные дети двойниками не считаются', () => {
    const m = duplicateMarks([sub('a', '2026-08-05T00:24:27Z', 'c1'), sub('b', '2026-08-05T00:29:57Z', 'c2')])
    expect(m.size).toBe(0)
  })

  it('без привязки ребёнок опознаётся по имени', () => {
    const noLink = (id: string, at: string) => ({
      id, submission_type: 'iea', child_id: null, status: 'pending', created_at: at,
      form_data: { child_name: 'Isaac Rife' },
    })
    expect(duplicateMarks([noLink('a', '2026-08-01T00:00:00Z'), noLink('b', '2026-08-02T00:00:00Z')]).size).toBe(2)
  })
})
