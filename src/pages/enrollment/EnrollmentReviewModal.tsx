// EnrollmentReviewModal.tsx — diff-view for one pending submission (Phase 1
// slice B). Left = submitted form_data; right = current roster/medical record
// (resolved via childFieldRegistry). Director can fix parent typos in place;
// Save writes back to enrollment_submissions.form_data with an edit-log entry.
// No roster writes here — Approve/Reject land in slice C.

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { type RecordCtx } from '@/lib/childFieldRegistry'
import { buildDiff, getPath, setPath, type DiffRow } from '@/lib/enrollmentFieldMap'
import { validateSubmission, submissionTypeLabel, type ValStatus } from '@/lib/enrollmentValidationRules'

type Submission = {
  id: string; org_id: string; center_id: string; child_id: string | null
  submission_type: string; form_data: any; signature_date: string | null
  status: string; source: string; created_at: string
}

const isUuid = (v: any): v is string =>
  typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)

const BADGE: Record<ValStatus, { dot: string; label: string; fg: string }> = {
  ready:    { dot: '🟢', label: 'Ready', fg: '#0f4c35' },
  warnings: { dot: '🟡', label: 'Warnings', fg: '#92400e' },
  errors:   { dot: '🔴', label: 'Incomplete', fg: '#991b1b' },
  unknown:  { dot: '⚪', label: 'Unvalidated', fg: '#6b7280' },
}

export default function EnrollmentReviewModal({
  submission, onClose, onSaved,
}: { submission: Submission; onClose: () => void; onSaved: () => void }) {
  const [fd, setFd] = useState<any>(submission.form_data ?? {})
  const [ctx, setCtx] = useState<RecordCtx | null>(null)
  const [ctxLoading, setCtxLoading] = useState(true)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Resolve the existing child (matched by child_id column, or a uuid inside
  // form_data). New applicants have neither → right column stays empty.
  const resolvedChildId = useMemo(() => {
    if (isUuid(submission.child_id)) return submission.child_id
    if (isUuid(submission.form_data?.child_id)) return submission.form_data.child_id
    return null
  }, [submission])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setCtxLoading(true)
      if (!resolvedChildId) { setCtx(null); setCtxLoading(false); return }
      const s = supabase.schema('menumaker')
      const [{ data: roster }, { data: medical }, { data: view }] = await Promise.all([
        s.from('roster').select('*').eq('id', resolvedChildId).maybeSingle(),
        s.from('child_medical').select('*').eq('child_id', resolvedChildId).maybeSingle(),
        s.from('v_child_age_profile').select('*').eq('id', resolvedChildId).maybeSingle(),
      ])
      if (cancelled) return
      setCtx({ roster: roster ?? null, medical: medical ?? null, view: view ?? null })
      setCtxLoading(false)
    })()
    return () => { cancelled = true }
  }, [resolvedChildId])

  const rows = useMemo(() => buildDiff(submission.submission_type, fd, ctx), [submission.submission_type, fd, ctx])
  const v = useMemo(
    () => validateSubmission(submission.submission_type, fd, { signatureDate: submission.signature_date }),
    [submission.submission_type, fd, submission.signature_date],
  )
  const badge = BADGE[v.status]

  const sections = useMemo(() => {
    const order: string[] = []
    const map = new Map<string, DiffRow[]>()
    for (const r of rows) {
      if (!map.has(r.section)) { map.set(r.section, []); order.push(r.section) }
      map.get(r.section)!.push(r)
    }
    return order.map(s => ({ section: s, rows: map.get(s)! }))
  }, [rows])

  const editField = (path: string, value: string) => {
    setFd((prev: any) => setPath(prev, path, value))
    setDirty(true)
  }

  async function save() {
    setSaving(true); setErr(null)
    // Record which mapped fields changed vs the original submission.
    const orig = submission.form_data ?? {}
    const changes = rows
      .filter(r => r.editPath)
      .map(r => ({ path: r.editPath!, from: getPath(orig, r.editPath!) ?? '', to: getPath(fd, r.editPath!) ?? '' }))
      .filter(c => String(c.from) !== String(c.to))
    const log = Array.isArray(fd._edit_log) ? fd._edit_log : []
    const nextFd = changes.length
      ? { ...fd, _edit_log: [...log, { at: new Date().toISOString(), changes }] }
      : fd
    const { error } = await supabase.schema('menumaker').from('enrollment_submissions')
      .update({ form_data: nextFd }).eq('id', submission.id)
    setSaving(false)
    if (error) { setErr(error.message); return }
    setDirty(false)
    onSaved()
  }

  const childName = fd?.child_name || rows.find(r => r.key.startsWith('child_'))?.formValue || '(no name)'

  return (
    <div onClick={() => (dirty ? null : onClose())} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      fontFamily: "'DM Sans', sans-serif",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: 16, width: '100%', maxWidth: 720,
        maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
      }}>
        {/* header */}
        <div style={{ background: '#0f4c35', padding: '18px 22px', borderRadius: '16px 16px 0 0', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 17 }}>{childName}</div>
            <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 2 }}>
              {submissionTypeLabel(submission.submission_type)} · {resolvedChildId ? 'existing record' : 'new applicant'}
            </div>
          </div>
          <span style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>{badge.dot} {badge.label}</span>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        {/* body */}
        <div style={{ padding: '16px 22px', overflowY: 'auto', flex: 1 }}>
          {(v.missing.length > 0 || v.warnings.length > 0) && (
            <div style={{ marginBottom: 14, padding: '10px 14px', background: v.status === 'errors' ? '#fef2f2' : '#fffbeb', borderRadius: 10, fontSize: 12.5 }}>
              {[...v.missing.map(m => ({ t: m, c: '#991b1b', s: '✕' })), ...v.warnings.map(w => ({ t: w, c: '#92400e', s: '⚠︎' }))].map((d, i) => (
                <div key={i} style={{ color: d.c }}>{d.s} {d.t}</div>
              ))}
            </div>
          )}

          {ctxLoading && <div style={{ color: '#888', fontSize: 13, marginBottom: 8 }}>Loading current record…</div>}

          {/* column headers */}
          <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr 1fr', gap: 10, fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.4, padding: '0 0 6px' }}>
            <div />
            <div>Submitted</div>
            <div>Current record</div>
          </div>

          {sections.map(({ section, rows }) => (
            <div key={section} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#0f4c35', margin: '8px 0 4px' }}>{section}</div>
              {rows.map(r => (
                <div key={r.key} style={{
                  display: 'grid', gridTemplateColumns: '150px 1fr 1fr', gap: 10, alignItems: 'center',
                  padding: '6px 8px', borderRadius: 8,
                  background: r.changed ? '#fffbeb' : 'transparent',
                }}>
                  <div style={{ fontSize: 12.5, color: '#6b7280' }}>{r.label}</div>
                  <div style={{ fontSize: 13 }}>
                    {r.editPath ? (
                      <input
                        value={getPath(fd, r.editPath) ?? ''}
                        onChange={e => editField(r.editPath!, e.target.value)}
                        style={{ width: '100%', padding: '4px 8px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 13, fontFamily: 'inherit' }}
                      />
                    ) : (
                      <span style={{ color: r.formValue ? '#111827' : '#d1d5db' }}>{r.formValue || '—'}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 13, color: r.currentValue ? '#111827' : '#d1d5db' }}>
                    {r.currentValue || (resolvedChildId ? '—' : 'new')}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* footer */}
        <div style={{ padding: '12px 22px', borderTop: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', gap: 10 }}>
          {err && <span style={{ color: '#991b1b', fontSize: 12.5, flex: 1 }}>{err}</span>}
          {!err && <span style={{ flex: 1, fontSize: 12, color: '#9ca3af', fontStyle: 'italic' }}>Approve / Reject coming next — edits save to the submission only.</span>}
          <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Close</button>
          <button onClick={save} disabled={!dirty || saving} style={{
            padding: '8px 18px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 700,
            background: dirty && !saving ? '#0f4c35' : '#d1d5db', color: '#fff',
            cursor: dirty && !saving ? 'pointer' : 'default',
          }}>{saving ? 'Saving…' : 'Save edits'}</button>
        </div>
      </div>
    </div>
  )
}
