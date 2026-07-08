// ============================================================
// ReturnWindow.tsx — the "found → return window" body, shared by:
//   • ADD CHILD 2.0 router (AddChildRouter) — director finds a returning child.
//   • Enrollment Review (EnrollmentReviewModal) — a scanned form matched an
//     inactive record; reactivate & admit before Approve attaches the scan.
//
// Renders the registry document checklist (honest empty-state) + admission date
// + MANDATORY paper-folder attestation → Reactivate & admit (admission_log).
// Content-only (no overlay) so each caller frames it in its own modal.
// ============================================================

import { useEffect, useState } from 'react'
import {
  buildReturnChecklist, admitChild,
  type ChecklistRow, type DocStatus, type PendingScan,
} from '@/lib/childReadmission'

const inp: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #c0d8c0', fontSize: 14, fontFamily: 'inherit', background: '#fff', boxSizing: 'border-box', outline: 'none' }
const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }
const fmt = (d: string | null) => { if (!d) return '—'; const [y, m, day] = d.slice(0, 10).split('-'); return `${Number(m)}/${Number(day)}/${y}` }

const STATUS_ICON: Record<DocStatus, string> = { ok: '✓', warn: '⚠', missing: '✗', untracked: '○' }
const STATUS_COLOR: Record<DocStatus, string> = { ok: '#0f4c35', warn: '#b45309', missing: '#b91c1c', untracked: '#9ca3af' }

export interface ReturnWindowChild {
  id: string
  name?: string
  is_active?: boolean | null
  date_out?: string | null
}

export default function ReturnWindow({
  child, reviewerId, reviewerName, pendingScan, admitLabel, onDone,
}: {
  child: ReturnWindowChild
  reviewerId: string
  reviewerName: string
  pendingScan?: PendingScan
  admitLabel?: string
  onDone: () => void
}) {
  const [rows, setRows] = useState<ChecklistRow[] | null>(null)
  const endDate = child.date_out ? child.date_out.slice(0, 10) : ''
  const [dateIn, setDateIn] = useState(new Date().toISOString().slice(0, 10))
  const [attested, setAttested] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const tooEarly = !!endDate && dateIn <= endDate

  useEffect(() => {
    let cancelled = false
    buildReturnChecklist(child.id, { pendingScan })
      .then(r => { if (!cancelled) setRows(r.rows) })
      .catch(e => { if (!cancelled) { setError(e.message); setRows([]) } })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [child.id])

  const needRequest = (rows ?? []).filter(r => r.status === 'warn' || r.status === 'missing')

  async function admit() {
    setError('')
    if (!attested) { setError('Confirm the paper folder before admitting.'); return }
    if (tooEarly) { setError(`Admission date must be after the end date (${fmt(endDate)}).`); return }
    setSaving(true)
    try {
      await admitChild({ rosterId: child.id, dateIn, by: reviewerId, byName: reviewerName, attested, checklist: rows ?? [] })
      onDone()
    } catch (e: any) { setError(e.message); setSaving(false) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontSize: 13, color: '#555', lineHeight: 1.5 }}>
        {child.is_active
          ? <>This child is <strong>already active</strong> at this center. Review their documents below.</>
          : <>Returning child{endDate ? <> — left <strong>{fmt(endDate)}</strong></> : ''}. Review documents, then set the admission date.</>}
      </div>

      {/* Document checklist */}
      <div>
        <div style={lbl}>Document checklist</div>
        {rows === null ? (
          <div style={{ fontSize: 13, color: '#9ca3af', padding: '10px 0' }}>Loading…</div>
        ) : (
          <div style={{ border: '1.5px solid #eef2ee', borderRadius: 10, overflow: 'hidden' }}>
            {rows.map((r, i) => (
              <div key={r.slug} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderTop: i ? '1px solid #f3f6f3' : 'none' }}>
                <span title={r.status} style={{ fontSize: 15, fontWeight: 700, color: STATUS_COLOR[r.status], width: 16, textAlign: 'center', flexShrink: 0 }}>{STATUS_ICON[r.status]}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#1f2937', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</div>
                  <div style={{ fontSize: 11, color: r.note ? '#0f4c35' : '#9ca3af' }}>
                    {r.note
                      ? r.note
                      : <>{r.requiringOrg} · {r.signer}{r.status === 'untracked' && ' · not tracked yet'}</>}
                  </div>
                </div>
                <div style={{ fontSize: 11, color: '#6b7280', textAlign: 'right', flexShrink: 0 }}>
                  {r.onFileDate ? <>on file {fmt(r.onFileDate)}<br />{r.validUntil ? `valid to ${fmt(r.validUntil)}` : 'no expiry'}</> : '—'}
                </div>
              </div>
            ))}
          </div>
        )}
        <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 6 }}>
          ○ = no digital record yet — verify in the paper folder. Marks fill in automatically once forms are approved online.
        </div>
      </div>

      {/* Request from parent (list only — bundle-send is Stage 3) */}
      {needRequest.length > 0 && (
        <div style={{ background: '#fffbeb', border: '1.5px solid #fde68a', borderRadius: 10, padding: '12px 14px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#b45309', marginBottom: 8 }}>Request from parent</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {needRequest.map(r => (
              <div key={r.slug} style={{ fontSize: 13, color: '#78350f', display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <span>{STATUS_ICON[r.status]} {r.title}</span>
                {r.fallbackUrl && <a href={r.fallbackUrl} target="_blank" rel="noreferrer" style={{ color: '#b45309', fontWeight: 600, whiteSpace: 'nowrap' }}>open form ↗</a>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Admission */}
      {!child.is_active && (
        <>
          <div>
            <label style={lbl}>Admission date *</label>
            <input type="date" style={{ ...inp, border: `1.5px solid ${tooEarly ? '#dc2626' : '#c0d8c0'}` }}
              value={dateIn} min={endDate || undefined} onChange={e => setDateIn(e.target.value)} />
            {tooEarly && <div style={{ color: '#dc2626', fontSize: 12, marginTop: 6 }}>Must be after the end date ({fmt(endDate)}).</div>}
          </div>
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer', background: attested ? '#f0fff4' : '#fafafa', border: `1.5px solid ${attested ? '#bbf7d0' : '#e5e7eb'}`, borderRadius: 10, padding: '11px 13px' }}>
            <input type="checkbox" checked={attested} onChange={e => setAttested(e.target.checked)} style={{ marginTop: 2, width: 16, height: 16, flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: '#1f2937', lineHeight: 1.45 }}>
              I confirm the child's required enrollment forms are <strong>in the paper folder and valid</strong>. This attestation is recorded as the basis for admission.
            </span>
          </label>
        </>
      )}

      {error && <div style={{ color: '#dc2626', fontSize: 13 }}>{error}</div>}

      {!child.is_active && (
        <button onClick={admit} disabled={saving || !attested || tooEarly}
          style={{ padding: '12px', borderRadius: 9, background: '#16a34a', color: '#fff', border: 'none', cursor: (saving || !attested || tooEarly) ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 14, fontFamily: 'inherit', opacity: (saving || !attested || tooEarly) ? 0.55 : 1 }}>
          {saving ? 'Admitting…' : (admitLabel ?? '↩ Reactivate & admit')}
        </button>
      )}
    </div>
  )
}
