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
import EnrollmentReviewModal from './EnrollmentReviewModal'
import EmbedEnrollHost from './EmbedEnrollHost'
import { ocrFailed as isOcrFailed, reRunOcr } from '@/lib/enrollmentScan'

// Backup approvers: when the director is absent, office managers, admins and the
// owner can also review/approve enrollment submissions.
const STAFF_ROLES = ['director', 'office_manager', 'admin', 'owner']

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
  const { roles, user } = useAuth()

  const [rows, setRows] = useState<Submission[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [reviewing, setReviewing] = useState<Submission | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [toast, setToast] = useState<{ msg: string; undo?: () => Promise<void> } | null>(null)
  const [rerunning, setRerunning] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)
  // Center for the in-app embedded form: active center, else pick one (org view).
  const [newCenter, setNewCenter] = useState('')
  // Enrollment-enabled center_ids, from the embed registry's `centers` map. Null
  // until loaded — the "＋ New enrollment" picker offers only these (intersection),
  // so Kitchen / future non-enrollment centers never appear. Adding a center to
  // the registry surfaces it here automatically — no hardcoded list.
  const [enrollCenterIds, setEnrollCenterIds] = useState<Set<string> | null>(null)

  const isStaff = useMemo(
    () => (roles ?? []).some(r => STAFF_ROLES.includes(r)),
    [roles],
  )
  const centerName = useMemo(() => {
    const map = new Map((centers ?? []).map(c => [c.id, c.name]))
    return (id: string) => map.get(id) ?? '—'
  }, [centers])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const r = await fetch('/enroll-registry.json', { cache: 'no-cache' })
        if (!r.ok) return
        const reg = await r.json()
        const ids = Object.values(reg?.centers ?? {})
          .map((c: any) => c?.center_id)
          .filter(Boolean) as string[]
        if (!cancelled) setEnrollCenterIds(new Set(ids))
      } catch { /* registry unreachable → picker stays empty, no leak */ }
    })()
    return () => { cancelled = true }
  }, [])

  // Picker options: app centers ∩ registry enrollment centers (by center_id).
  const enrollmentCenters = useMemo(
    () => (centers ?? []).filter(c => enrollCenterIds?.has(c.id)),
    [centers, enrollCenterIds],
  )

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
  }, [orgLoading, org?.id, currentCenter?.id, isStaff, reloadKey])

  // "Approved · Undo" toast auto-dismisses after 10s.
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 10000)
    return () => clearTimeout(t)
  }, [toast])

  async function handleUndo() {
    const u = toast?.undo
    setToast(null)
    if (u) { await u(); setReloadKey(k => k + 1) }
  }

  async function handleReRun(row: Submission) {
    if (rerunning) return
    setRerunning(row.id)
    try {
      const r = await reRunOcr(row)
      setToast({
        msg: r.ocrFailed
          ? 'Re-run OCR failed again — the scan may be unreadable. Try re-shooting.'
          : `Re-run OCR: recognized as ${submissionTypeLabel(r.submissionType)}.`,
      })
      setReloadKey(k => k + 1)
    } catch (e: any) {
      setToast({ msg: `Re-run OCR error: ${e?.message ?? e}` })
    } finally {
      setRerunning(null)
    }
  }

  // Live validation per row (Phase 1 computes client-side; no trigger yet).
  const graded = useMemo(
    () => rows.map(r => ({
      row: r,
      v: validateSubmission(r.submission_type, r.form_data, { signatureDate: r.signature_date, source: r.source }),
    })),
    [rows],
  )

  if (!orgLoading && !isStaff) {
    return (
      <div style={{ padding: 40, fontFamily: "'DM Sans', sans-serif", color: '#6b7280' }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#0f4c35', marginBottom: 8 }}>Enrollment Inbox</div>
        Only directors, office managers, admins and the owner can review enrollment submissions.
      </div>
    )
  }

  const scopeLabel = currentCenter?.id ? currentCenter.name : `All centers · ${org?.name ?? ''}`

  return (
    <div style={{ padding: '28px 32px', fontFamily: "'DM Sans', sans-serif", maxWidth: 980 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 4 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f4c35', margin: 0 }}>Enrollment Inbox</h1>
          <span style={{ fontSize: 13, color: '#6b7280' }}>{scopeLabel}</span>
        </div>
        <button
          onClick={() => { setNewCenter(currentCenter?.id ?? ''); setShowNew(true) }}
          style={{
            padding: '8px 16px', borderRadius: 9, border: 'none', background: '#0f4c35',
            color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
          }}>
          ＋ New enrollment
        </button>
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
                {row.form_data?.scan_ref && (
                  <span title="A scanned form is attached" style={{
                    fontSize: 11, fontWeight: 600, color: '#0f4c35', background: '#f0fff4',
                    padding: '2px 8px', borderRadius: 6,
                  }}>📎 Scan</span>
                )}
                {isOcrFailed(row.form_data) && (
                  <span title="OCR could not read this scan — re-run or re-shoot" style={{
                    fontSize: 11, fontWeight: 700, color: '#991b1b', background: '#fef2f2',
                    padding: '2px 8px', borderRadius: 6,
                  }}>⚠️ OCR failed</span>
                )}
                {row.form_data?.scan_ref && (
                  <button
                    onClick={e => { e.stopPropagation(); handleReRun(row) }}
                    disabled={rerunning === row.id}
                    title="Re-run OCR on the stored scan"
                    style={{
                      padding: '6px 12px', borderRadius: 8, border: '1px solid #e5e7eb',
                      background: rerunning === row.id ? '#f3f4f6' : '#fff', color: '#374151',
                      fontSize: 12, fontWeight: 600, cursor: rerunning === row.id ? 'default' : 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {rerunning === row.id ? '↻ Running…' : '↻ Re-run OCR'}
                  </button>
                )}
                <SourceTag source={row.source} />
                <StatusBadge v={v} />
                <button
                  onClick={e => { e.stopPropagation(); setReviewing(row) }}
                  style={{
                    padding: '6px 14px', borderRadius: 8, border: 'none', background: '#0f4c35',
                    color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                  }}
                >
                  Review
                </button>
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
                    Open <strong>Review</strong> to see the full submission side-by-side with the current record.
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {reviewing && (
        <EnrollmentReviewModal
          submission={reviewing}
          reviewerId={user?.id ?? ''}
          reviewerName={(user?.user_metadata?.full_name as string) || (user?.email?.split('@')[0]) || 'Director'}
          onClose={() => setReviewing(null)}
          onSaved={() => { setReviewing(null); setReloadKey(k => k + 1) }}
          onDone={(result) => {
            setReviewing(null)
            setReloadKey(k => k + 1)
            setToast({ msg: result.message, undo: result.undo })
          }}
        />
      )}

      {showNew && (
        <div onClick={() => setShowNew(false)} style={{
          position: 'fixed', inset: 0, background: 'rgba(10,30,20,0.45)', zIndex: 1090,
          display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 24, overflow: 'auto',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            // Wide enough for the paper-replica form (scaled-to-fit by the loader).
            background: '#fff', borderRadius: 16, width: newCenter ? 'min(1000px, 100%)' : 'min(560px, 100%)', padding: 20,
            boxShadow: '0 20px 60px rgba(0,0,0,0.25)', fontFamily: "'DM Sans', sans-serif",
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#0f4c35' }}>New enrollment</div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>Fill the form; it files into this Inbox for review.</div>
              </div>
              <button onClick={() => setShowNew(false)} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Close</button>
            </div>
            {!newCenter ? (
              <div style={{ padding: '8px 0 6px' }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Choose a center</label>
                <select value={newCenter} onChange={e => setNewCenter(e.target.value)}
                  style={{ padding: '8px 10px', border: '1.5px solid #e5e7eb', borderRadius: 8, fontSize: 13, fontFamily: 'inherit' }}>
                  <option value="">Select…</option>
                  {enrollmentCenters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            ) : (
              <EmbedEnrollHost
                center={newCenter}
                form="enroll"
                onSaved={() => { setReloadKey(k => k + 1); setToast({ msg: 'Enrollment submitted — filed to the Inbox.' }) }}
                onClose={() => { setShowNew(false); setNewCenter('') }}
              />
            )}
          </div>
        </div>
      )}

      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: '#111827', color: '#fff', padding: '12px 16px 12px 18px', borderRadius: 12,
          display: 'flex', alignItems: 'center', gap: 16, fontSize: 13.5, fontFamily: "'DM Sans', sans-serif",
          boxShadow: '0 10px 30px rgba(0,0,0,0.25)', zIndex: 1100,
        }}>
          <span>{toast.msg}</span>
          {toast.undo && (
            <button onClick={handleUndo} style={{
              background: 'transparent', border: 'none', color: '#7ee8b0', fontWeight: 700,
              fontSize: 13.5, cursor: 'pointer', padding: 0,
            }}>Undo</button>
          )}
        </div>
      )}
    </div>
  )
}
