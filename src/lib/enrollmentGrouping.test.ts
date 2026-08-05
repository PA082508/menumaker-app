import { describe, it, expect } from 'vitest'
import { COUNTERSIGN_SLOT } from './signatureSamples'
import {
  signatureRequired, groupSubmissionsByChild,
  type GroupableSubmission,
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
      // 22.07 iea ушла в доходную ветку и слота больше не объявляет; её место
      // в списке подписных с 05.08 занимает форма питания.
      sub({ type: 'cacfp_enrollment', name: 'Hazel Broadwater' }),
      sub({ type: 'parent_consent', name: 'Hazel Broadwater' }),
    ])
    expect(groups[0].signatureCount).toBe(2)
  })

  it('does NOT count a filed (received) signature form — filed is a fact, not a task', () => {
    const groups = groupSubmissionsByChild([
      sub({ type: 'dcy_01234', name: 'Hazel Broadwater', status: 'received' }),
      sub({ type: 'cacfp_enrollment', name: 'Hazel Broadwater', status: 'pending' }),
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
