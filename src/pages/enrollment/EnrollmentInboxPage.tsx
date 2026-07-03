// EnrollmentInboxPage.tsx — Director's Inbox (Enrollment Approval Loop, Phase 1).
//
// Slice A (read-only): lists pending enrollment_submissions scoped to the active
// center (or org-wide in Organization view), each graded by a live 🟢/🟡/🔴
// validation badge. Rows expand to show what's missing / warnings. No writes to
// roster yet — diff-view + Approve/Reject land in Slice B/C.

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useOrg } from '@/contexts/OrgContext'
import { useAuth } from '@/hooks/useAuth'
import {
  validateSubmission, submissionTypeLabel,
  type ValidationResult, type ValStatus,
} from '@/lib/enrollmentValidationRules'

const STAFF_ROLES = ['director', 'office_manager', 'admin']

type Submission = {
  id: string
  org_id: string
  center_id: string
  child_id: string | null
  submission_type: string
  form_data: any
  signatures: any
  signature_date: string | null
  status: string
  source: string
  created_at: string
}

const BADGE: Record<ValStatus, { dot: string; bg: string; fg: string; label: string }> = {
  ready:    { dot: '🟢', bg: '#f0fff4', fg: '#0f4c35', label: 'Ready' },
  warnings: { dot: '🟡', bg: '#fffbeb', fg: '#92400e', label: 'Warnings' },
  errors:   { dot: '🔴', bg: '#fef2f2', fg: '#991b1b', label: 'Incomplete' },
  unknown:  { dot: '⚪', bg: '#f4f4f5', fg: '#6b7280', label: 'Unvalidated' },
}

const fmtDate = (iso: string | null) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`
}

function StatusBadge({ v }: { v: ValidationResult }) {
  const b = BADGE[v.status]
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px',
      borderRadius: 999, background: b.bg, color: b.fg, fontSize: 12, fontWeight: 600,
      whiteSpace: 'nowrap',
    }}>
      <span style={{ fontSize: 10 }}>{b.dot}</span>{b.label}
    </span>
  )
}

function SourceTag({ source }: { source: string }) {
  const online = source !== 'paper_entry'
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, color: '#6b7280', background: '#f4f4f5',
      padding: '2px 8px', borderRadius: 6,
    }}>
      {online ? '🌐 Online' : '📷 Paper'}
    </span>
  )
}

export default function EnrollmentInboxPage() {
  const { org, currentCenter, centers, loading: orgLoading } = useOrg()
  const { roles } = useAuth()

  const [rows, setRows] = useState<Submission[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  const isStaff = useMemo(
    () => (roles ?? []).some(r => STAFF_ROLES.includes(r)),
    [roles],
  )
  const centerName = useMemo(() => {
    const map = new Map((centers ?? []).map(c => [c.id, c.name]))
    return (id: string) => map.get(id) ?? '—'
  }, [centers])

  useEffect(() => {
    if (orgLoading || !org?.id || !isStaff) return
    let cancelled = false
    ;(async () => {
      setLoading(true); setErr(null)
      let q = supabase.schema('menumaker').from('enrollment_submissions')
        .select('id,org_id,center_id,child_id,submission_type,form_data,signatures,signature_date,status,source,created_at')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
      // Scope: active center, or org-wide in Organization view.
      q = currentCenter?.id ? q.eq('center_id', currentCenter.id) : q.eq('org_id', org.id)
      const { data, error } = await q
      if (cancelled) return
      if (error) setErr(error.message)
      else setRows((data ?? []) as Submission[])
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [orgLoading, org?.id, currentCenter?.id, isStaff])

  // Live validation per row (Phase 1 computes client-side; no trigger yet).
  const graded = useMemo(
    () => rows.map(r => ({
      row: r,
      v: validateSubmission(r.submission_type, r.form_data, { signatureDate: r.signature_date }),
    })),
    [rows],
  )

  if (!orgLoading && !isStaff) {
    return (
      <div style={{ padding: 40, fontFamily: "'DM Sans', sans-serif", color: '#6b7280' }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#0f4c35', marginBottom: 8 }}>Enrollment Inbox</div>
        Only directors and office managers can review enrollment submissions.
      </div>
    )
  }

  const scopeLabel = currentCenter?.id ? currentCenter.name : `All centers · ${org?.name ?? ''}`

  return (
    <div style={{ padding: '28px 32px', fontFamily: "'DM Sans', sans-serif", maxWidth: 980 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 4 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f4c35', margin: 0 }}>Enrollment Inbox</h1>
        <span style={{ fontSize: 13, color: '#6b7280' }}>{scopeLabel}</span>
      </div>
      <div style={{ fontSize: 13, color: '#888', marginBottom: 20 }}>
        Pending enrollment packet submissions awaiting director review.
      </div>

      {(loading || orgLoading) && <div style={{ color: '#888', fontSize: 14 }}>Loading…</div>}
      {err && <div style={{ color: '#991b1b', fontSize: 14 }}>Error: {err}</div>}

      {!loading && !orgLoading && !err && graded.length === 0 && (
        <div style={{
          padding: '40px 24px', textAlign: 'center', color: '#9ca3af', fontSize: 14,
          background: '#fafafa', borderRadius: 12, border: '1px dashed #e5e7eb',
        }}>
          No pending submissions.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {graded.map(({ row, v }) => {
          const isNew = !row.child_id
          const childName = row.form_data?.child_name || '(no name)'
          const details = [...v.missing.map(m => ({ kind: 'missing', text: m })),
                           ...v.errors.map(m => ({ kind: 'error', text: m })),
                           ...v.warnings.map(m => ({ kind: 'warning', text: m }))]
          const open = expanded === row.id
          return (
            <div key={row.id} style={{
              border: '1px solid #e5e7eb', borderRadius: 12, background: '#fff',
              boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
            }}>
              <div
                onClick={() => setExpanded(open ? null : row.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px',
                  cursor: details.length ? 'pointer' : 'default',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: '#111827', display: 'flex', gap: 8, alignItems: 'center' }}>
                    {childName}
                    {isNew && (
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#0f4c35', background: '#f0fff4', padding: '1px 7px', borderRadius: 6 }}>
                        NEW
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 3, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span>{submissionTypeLabel(row.submission_type)}</span>
                    <span>·</span>
                    <span>{fmtDate(row.created_at)}</span>
                    {!currentCenter?.id && <><span>·</span><span>{centerName(row.center_id)}</span></>}
                  </div>
                </div>
                <SourceTag source={row.source} />
                <StatusBadge v={v} />
                {details.length > 0 && (
                  <span style={{ color: '#9ca3af', fontSize: 12, width: 14, textAlign: 'center' }}>{open ? '▾' : '▸'}</span>
                )}
              </div>

              {open && details.length > 0 && (
                <div style={{ borderTop: '1px solid #f3f4f6', padding: '12px 18px 16px' }}>
                  <ul style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {details.map((d, i) => (
                      <li key={i} style={{
                        fontSize: 13,
                        color: d.kind === 'warning' ? '#92400e' : d.kind === 'error' ? '#991b1b' : '#6b7280',
                      }}>
                        {d.kind === 'warning' ? '⚠︎ ' : d.kind === 'error' ? '✕ ' : '○ '}{d.text}
                      </li>
                    ))}
                  </ul>
                  <div style={{ marginTop: 12, fontSize: 12, color: '#9ca3af', fontStyle: 'italic' }}>
                    Review &amp; Approve (diff-view) coming next — this slice is read-only.
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
