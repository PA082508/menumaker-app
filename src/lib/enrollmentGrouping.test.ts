import { describe, it, expect } from 'vitest'
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

describe('signatureRequired — list A only (dcy_01234, iea, start_form)', () => {
  it('is true for the three countersign forms', () => {
    expect(signatureRequired('dcy_01234')).toBe(true)
    expect(signatureRequired('iea')).toBe(true)
    expect(signatureRequired('start_form')).toBe(true)
  })
  it('is false for consent, cacfp and unknown forms', () => {
    expect(signatureRequired('parent_consent')).toBe(false)
    expect(signatureRequired('cacfp_enrollment')).toBe(false)
    expect(signatureRequired('parents_book_ack')).toBe(false)
    expect(signatureRequired('anything')).toBe(false)
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
      sub({ type: 'iea', name: 'Hazel Broadwater' }),
      sub({ type: 'parent_consent', name: 'Hazel Broadwater' }),
    ])
    expect(groups[0].signatureCount).toBe(2)
  })

  it('does NOT count a filed (received) signature form — filed is a fact, not a task', () => {
    const groups = groupSubmissionsByChild([
      sub({ type: 'dcy_01234', name: 'Hazel Broadwater', status: 'received' }),
      sub({ type: 'iea', name: 'Hazel Broadwater', status: 'pending' }),
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
