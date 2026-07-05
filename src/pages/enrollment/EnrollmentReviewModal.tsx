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
import { resolveScanUrl, lowConfidenceSet, ocrMeta, hasScan } from '@/lib/enrollmentScan'
import {
  buildCacfpPatch, buildIeaFrp, loadCenterRoster, matchRoster,
  approveCacfpInsert, approveCacfpUpdate, approveIea, rejectSubmission,
  type RosterLite, type ApproveResult,
} from '@/lib/enrollmentApprove'

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
  submission, reviewerId, onClose, onSaved, onDone,
}: {
  submission: Submission
  reviewerId: string
  onClose: () => void
  onSaved: () => void
  onDone: (result: ApproveResult) => void
}) {
  const [fd, setFd] = useState<any>(submission.form_data ?? {})
  const [ctx, setCtx] = useState<RecordCtx | null>(null)
  const [ctxLoading, setCtxLoading] = useState(true)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const isCacfp = submission.submission_type === 'cacfp_enrollment'
  const isIea = submission.submission_type === 'iea'
  const [dateIn, setDateIn] = useState('')
  const [paperSigned, setPaperSigned] = useState(false)
  const [busy, setBusy] = useState(false)
  const [candidates, setCandidates] = useState<RosterLite[]>([])
  const [chosenMatch, setChosenMatch] = useState<string | 'new' | null>(null)
  const [rejecting, setRejecting] = useState(false)
  const [rejectReason, setRejectReason] = useState('')

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

  // Phase 1.5 — photographed paper form. Resolve the scan for side-by-side review,
  // and collect the OCR low-confidence field set so those rows read "verify".
  const [scanUrl, setScanUrl] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const url = hasScan(fd) ? await resolveScanUrl(fd.scan_ref) : null
      if (!cancelled) setScanUrl(url)
    })()
    return () => { cancelled = true }
  }, [fd?.scan_ref])
  const lowConf = useMemo(() => lowConfidenceSet(fd), [fd])
  const scanDocType = ocrMeta(fd).docType

  const rows = useMemo(() => buildDiff(submission.submission_type, fd, ctx), [submission.submission_type, fd, ctx])
  const v = useMemo(
    () => validateSubmission(submission.submission_type, fd, { signatureDate: submission.signature_date }),
    [submission.submission_type, fd, submission.signature_date],
  )
  const badge = BADGE[v.status]

  // Load center roster for duplicate / child matching (new CACFP applicant, or IEA).
  useEffect(() => {
    const need = isIea || (isCacfp && !resolvedChildId)
    if (!need) return
    let cancelled = false
    ;(async () => {
      const list = await loadCenterRoster(submission.center_id)
      if (!cancelled) setCandidates(list)
    })()
    return () => { cancelled = true }
  }, [submission.center_id, resolvedChildId, isCacfp, isIea])

  // CACFP new-applicant duplicate matches (name + DOB).
  const cacfpMatches = useMemo(
    () => (isCacfp && !resolvedChildId ? matchRoster(candidates, fd?.child_name, fd?.birthdate) : []),
    [isCacfp, resolvedChildId, candidates, fd?.child_name, fd?.birthdate],
  )

  // IEA: FRP determination + per-child roster matches.
  const frpInfo = useMemo(() => (isIea ? buildIeaFrp(fd) : null), [isIea, fd])
  const ieaChildren = useMemo<{ name: string; matches: RosterLite[] }[]>(() => {
    if (!isIea) return []
    const kids = Array.isArray(fd?.children) ? fd.children : []
    return kids.filter((c: any) => c?.name).map((c: any) => ({
      name: String(c.name), matches: matchRoster(candidates, c.name, c.dob),
    }))
  }, [isIea, fd, candidates])
  const ieaMatchedIds = useMemo(
    () => Array.from(new Set(ieaChildren.flatMap(c => c.matches.slice(0, 1).map(m => m.id)))),
    [ieaChildren],
  )

  // Approve gating: 🔴 blocks; unresolved CACFP duplicate blocks.
  const dupUnresolved = isCacfp && !resolvedChildId && cacfpMatches.length > 0 && !chosenMatch
  const approveBlocked = v.status === 'errors' || dupUnresolved || busy
    || (isIea && (!frpInfo?.frp || ieaMatchedIds.length === 0))

  async function doApprove() {
    if (v.status === 'errors') return
    if (v.status === 'warnings' && !window.confirm('This submission has warnings. Approve anyway?')) return
    // Anti-misclick: if the reviewer never edited the diff, confirm the roster
    // write first. Editing (dirty) already signals a deliberate review.
    if (!dirty && !window.confirm(`Approve ${childName}? This creates or updates the roster.`)) return
    setBusy(true); setErr(null)
    try {
      let result: ApproveResult
      if (isCacfp) {
        const patch = buildCacfpPatch(fd, dateIn)
        const target = resolvedChildId ?? (chosenMatch && chosenMatch !== 'new' ? chosenMatch : null)
        result = target
          ? await approveCacfpUpdate(submission, target, patch, reviewerId, paperSigned)
          : await approveCacfpInsert(submission, patch, reviewerId, paperSigned)
      } else if (isIea) {
        if (!frpInfo?.frp) throw new Error('No FRP determination on the form (Sponsor section empty)')
        if (ieaMatchedIds.length === 0) throw new Error('No roster children matched — add them via CACFP enrollment first')
        result = await approveIea(submission, { frp: frpInfo.frp, frp_expires: frpInfo.frp_expires }, ieaMatchedIds, reviewerId, paperSigned)
      } else {
        throw new Error('This submission type cannot be approved yet')
      }
      onDone(result)
    } catch (e: any) { setErr(e?.message ?? String(e)); setBusy(false) }
  }

  async function doReject() {
    if (!rejectReason.trim()) return
    setBusy(true); setErr(null)
    try {
      onDone(await rejectSubmission(submission, rejectReason.trim(), reviewerId))
    } catch (e: any) { setErr(e?.message ?? String(e)); setBusy(false) }
  }

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
      ? { ...fd, _edit_log: [...log, { at: new Date().toISOString(), by: reviewerId, changes }] }
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
        background: '#fff', borderRadius: 16, width: '100%', maxWidth: scanUrl ? 980 : 720,
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

        {/* body — scan (Phase 1.5) alongside the diff */}
        <div style={{ display: 'flex', overflow: 'hidden', flex: 1 }}>
          {scanUrl && (
            <div style={{ width: 300, flexShrink: 0, borderRight: '1px solid #f3f4f6', background: '#0b1f17', display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.1)', color: '#e5e7eb', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span>📷 Scanned form{scanDocType ? ` · ${scanDocType}` : ''}</span>
                <a href={scanUrl} target="_blank" rel="noreferrer" style={{ color: '#7ee8b0', fontSize: 11, fontWeight: 600, textDecoration: 'none' }}>Open ↗</a>
              </div>
              <div style={{ flex: 1, overflow: 'auto', padding: 8 }}>
                <img src={scanUrl} alt="Scanned enrollment form" style={{ width: '100%', borderRadius: 8, display: 'block' }} />
              </div>
              {lowConf.size > 0 && (
                <div style={{ padding: '8px 12px', borderTop: '1px solid rgba(255,255,255,0.1)', color: '#fcd34d', fontSize: 11 }}>
                  🔍 {lowConf.size} field{lowConf.size === 1 ? '' : 's'} marked <strong>verify</strong> — check against the scan.
                </div>
              )}
            </div>
          )}
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
              {rows.map(r => {
                // OCR flagged this field low-confidence → "verify" against the scan.
                const verify = !r.missing && (lowConf.has(r.key) || (!!r.editPath && lowConf.has(r.editPath)))
                return (
                <div key={r.key} style={{
                  display: 'grid', gridTemplateColumns: '150px 1fr 1fr', gap: 10, alignItems: 'center',
                  padding: '6px 8px', borderRadius: 8,
                  background: r.missing ? '#fef2f2' : verify ? '#fff7ed' : r.changed ? '#fffbeb' : 'transparent',
                  boxShadow: r.missing ? 'inset 3px 0 0 #ef4444' : verify ? 'inset 3px 0 0 #f59e0b' : undefined,
                }}>
                  <div style={{ fontSize: 12.5, color: r.missing ? '#991b1b' : '#6b7280', display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                    <span>{r.label}{r.required && <span title="Required" style={{ color: '#ef4444', fontWeight: 700 }}> ★</span>}</span>
                    {verify && <span title="OCR was unsure — check this value against the scan" style={{ fontSize: 9, fontWeight: 700, color: '#92400e', background: '#fef3c7', padding: '1px 5px', borderRadius: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>🔍 verify</span>}
                  </div>
                  <div style={{ fontSize: 13 }}>
                    {r.editPath ? (
                      <input
                        value={getPath(fd, r.editPath) ?? ''}
                        onChange={e => editField(r.editPath!, e.target.value)}
                        placeholder={r.missing ? 'required — fill in' : ''}
                        style={{
                          width: '100%', padding: '4px 8px', borderRadius: 6, fontSize: 13, fontFamily: 'inherit',
                          border: `1px solid ${r.missing ? '#fca5a5' : '#e5e7eb'}`,
                        }}
                      />
                    ) : (
                      <span style={{ color: r.formValue ? '#111827' : r.missing ? '#ef4444' : '#d1d5db' }}>
                        {r.formValue || (r.missing ? 'required — edit on original form' : '—')}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 13, color: r.currentValue ? '#111827' : '#d1d5db' }}>
                    {r.currentValue || (resolvedChildId ? '—' : 'new')}
                  </div>
                </div>
              )})}
            </div>
          ))}
          </div>
        </div>

        {/* approve action panel */}
        <div style={{ padding: '12px 22px', borderTop: '1px solid #f3f4f6', background: '#fafafa', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {isCacfp && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5, color: '#374151' }}>
              <span style={{ width: 130, color: '#6b7280' }}>Date In (start date)</span>
              <input type="date" value={dateIn} onChange={e => setDateIn(e.target.value)}
                style={{ padding: '4px 8px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 13, fontFamily: 'inherit' }} />
              <span style={{ color: '#9ca3af', fontSize: 11 }}>optional — director sets the enrollment start</span>
            </label>
          )}

          {isCacfp && !resolvedChildId && cacfpMatches.length > 0 && (
            <div style={{ fontSize: 12.5 }}>
              <div style={{ color: '#92400e', fontWeight: 600, marginBottom: 4 }}>
                ⚠︎ Possible existing {cacfpMatches.length === 1 ? 'match' : 'matches'} — choose one:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {cacfpMatches.map(m => (
                  <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input type="radio" name="dupmatch" checked={chosenMatch === m.id} onChange={() => setChosenMatch(m.id)} />
                    Update <strong>{m.child_name || `${m.last_name ?? ''} ${m.first_name ?? ''}`}</strong>
                    {m.birthday ? <span style={{ color: '#9ca3af' }}>· {String(m.birthday).slice(0, 10)}</span> : null}
                  </label>
                ))}
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="radio" name="dupmatch" checked={chosenMatch === 'new'} onChange={() => setChosenMatch('new')} />
                  Create a new child
                </label>
              </div>
            </div>
          )}

          {isIea && (
            <div style={{ fontSize: 12.5, color: '#374151' }}>
              {frpInfo?.frp ? (
                <>
                  <div>FRP determination: <strong>{frpInfo.frp}</strong>{frpInfo.frp_expires ? ` · expires ${frpInfo.frp_expires}` : ''}
                    {frpInfo.source === 'helper' && <span style={{ color: '#92400e' }}> (⚠︎ from calculator fallback — Sponsor section empty)</span>}
                  </div>
                  <div style={{ color: ieaMatchedIds.length ? '#0f4c35' : '#991b1b', marginTop: 2 }}>
                    Applies to {ieaMatchedIds.length} matched child{ieaMatchedIds.length === 1 ? '' : 'ren'}
                    {ieaChildren.some(c => c.matches.length === 0) &&
                      ` · skipped (no roster match): ${ieaChildren.filter(c => !c.matches.length).map(c => c.name).join(', ')}`}
                  </div>
                </>
              ) : (
                <div style={{ color: '#991b1b' }}>No FRP determination on the form (Sponsor section empty) — cannot approve.</div>
              )}
            </div>
          )}

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: '#374151' }}>
            <input type="checkbox" checked={paperSigned} onChange={e => setPaperSigned(e.target.checked)} />
            Paper form signed &amp; filed
          </label>

          {rejecting && (
            <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Reason for rejection (sent context for follow-up)…"
              style={{ padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', minHeight: 56, resize: 'vertical' }} />
          )}
        </div>

        {/* footer */}
        <div style={{ padding: '12px 22px', borderTop: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', gap: 8 }}>
          {err && <span style={{ color: '#991b1b', fontSize: 12.5, flex: 1 }}>{err}</span>}
          {!err && <span style={{ flex: 1, fontSize: 11.5, color: '#9ca3af' }}>
            {v.status === 'errors' ? 'Resolve required fields before approving.' : dupUnresolved ? 'Choose a duplicate resolution above.' : 'Nothing is written to the roster until you Approve.'}
          </span>}
          <button onClick={onClose} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Close</button>
          <button onClick={save} disabled={!dirty || saving} style={{
            padding: '8px 14px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13, fontWeight: 600,
            background: '#fff', color: dirty && !saving ? '#0f4c35' : '#d1d5db',
            cursor: dirty && !saving ? 'pointer' : 'default',
          }}>{saving ? 'Saving…' : 'Save edits'}</button>
          <button disabled title="Phase 3 — sends the parent a pre-filled link to complete their own submission"
            style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', color: '#d1d5db', fontSize: 13, fontWeight: 600, cursor: 'not-allowed' }}>
            Request completion
          </button>
          {rejecting ? (
            <button onClick={doReject} disabled={!rejectReason.trim() || busy} style={{
              padding: '8px 16px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 700,
              background: rejectReason.trim() && !busy ? '#991b1b' : '#d1d5db', color: '#fff',
              cursor: rejectReason.trim() && !busy ? 'pointer' : 'default',
            }}>Confirm reject</button>
          ) : (
            // Solid red — an equal-weight destructive action opposite green Approve.
            <button onClick={() => setRejecting(true)} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#991b1b', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>✕ Reject</button>
          )}
          {/* Deliberate gap so Approve is never mistaken for / adjacent to Reject. */}
          <div style={{ width: 22 }} />
          <button onClick={doApprove} disabled={approveBlocked} style={{
            padding: '8px 20px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 700,
            background: approveBlocked ? '#d1d5db' : '#0f4c35', color: '#fff',
            cursor: approveBlocked ? 'default' : 'pointer',
          }}>{busy ? 'Working…' : '✓ Approve'}</button>
        </div>
      </div>
    </div>
  )
}
