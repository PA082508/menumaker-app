// ============================================================
// AddChildRouter.tsx — ADD CHILD 2.0 (П.0, Nikolay). Search-first "Add Child":
//   1. Name field → search norm_name across the WHOLE center (active + inactive
//      + fiscal stubs).
//   2. FOUND → return window: registry document checklist (honest empty-state)
//      + "Reactivate & admit" (mandatory paper-folder attestation, audit
//      snapshot) + "Request from parent" list of ⚠/✗ forms.
//   3. NOT FOUND → Scan paper form · ＋ New enrollment · (admin) raw insert.
//
// Bare roster insert stays admin-only (f1faad9) — surfaced here only inside the
// not-found branch for org admins. See src/lib/childReadmission.ts for the
// checklist + admit writes.
// ============================================================

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { normName } from '@/lib/enrollmentApprove'
import { classifyChild, type MatchKind } from '@/lib/childSearch'
import {
  buildReturnChecklist, admitChild,
  type ChecklistRow, type DocStatus,
} from '@/lib/childReadmission'

const GREEN = '#0f4c35'
const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: 20 }
const card: React.CSSProperties = { background: '#fff', borderRadius: 16, width: '100%', maxWidth: 560, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', fontFamily: "'DM Sans',sans-serif", overflow: 'hidden' }
const inp: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #c0d8c0', fontSize: 14, fontFamily: 'inherit', background: '#fff', boxSizing: 'border-box', outline: 'none' }
const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }

const fmt = (d: string | null) => { if (!d) return '—'; const [y, m, day] = d.slice(0, 10).split('-'); return `${Number(m)}/${Number(day)}/${y}` }
const nrm = (s: string) => normName(s)

type Candidate = {
  id: string; first_name: string | null; last_name: string | null
  child_name: string | null; birthday: string | null
  is_active: boolean | null; date_out: string | null; source: string | null
}

const STATUS_ICON: Record<DocStatus, string> = { ok: '✓', warn: '⚠', missing: '✗', untracked: '○' }
const STATUS_COLOR: Record<DocStatus, string> = { ok: '#0f4c35', warn: '#b45309', missing: '#b91c1c', untracked: '#9ca3af' }

function candName(c: Candidate): string {
  const ln = c.last_name ?? '', fn = c.first_name ?? ''
  return (ln || fn) ? `${ln} ${fn}`.trim() : (c.child_name ?? '—')
}
function candBadge(c: Candidate): { text: string; bg: string; fg: string } {
  if (c.is_active) return { text: 'Active', bg: '#f0fff4', fg: '#0f4c35' }
  if (c.source === 'masterlist_fiscal' || !c.birthday) return { text: 'Fiscal stub', bg: '#fffbeb', fg: '#b45309' }
  return { text: c.date_out ? `Left ${fmt(c.date_out)}` : 'Inactive', bg: '#f4f4f5', fg: '#6b7280' }
}

export default function AddChildRouterModal({
  centerId, reviewerId, reviewerName, isOrgAdmin,
  onClose, onReactivated, onNewEnrollment, onScan, onRawInsert,
}: {
  centerId: string
  reviewerId: string
  reviewerName: string
  isOrgAdmin: boolean
  onClose: () => void
  onReactivated: () => void
  onNewEnrollment: () => void
  onScan: () => void
  onRawInsert: () => void
}) {
  const [roster, setRoster] = useState<Candidate[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Candidate | null>(null)

  // Load the WHOLE center once (active + inactive + stubs) — same corpus as the
  // enrollment dup gate, plus source/date_out for the badges.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data } = await supabase.schema('menumaker').from('roster')
        .select('id,first_name,last_name,child_name,birthday,is_active,date_out,source')
        .eq('center_id', centerId)
        .order('is_active', { ascending: false })
      if (!cancelled) { setRoster((data ?? []) as Candidate[]); setLoading(false) }
    })()
    return () => { cancelled = true }
  }, [centerId])

  // Token match (any order) first, then fuzzy 'similar' suggestions so typo
  // records (Rackmanov ↔ Rakhmanov) stay findable. Exact above similar, active
  // above inactive, then by name.
  const results = useMemo(() => {
    if (nrm(query).length < 2) return []
    const scored = roster
      .map(c => ({ c, kind: classifyChild(c, query) as MatchKind }))
      .filter(x => x.kind !== null)
    scored.sort((a, b) =>
      ((a.kind === 'exact' ? 0 : 1) - (b.kind === 'exact' ? 0 : 1))
      || (Number(!!b.c.is_active) - Number(!!a.c.is_active))
      || candName(a.c).localeCompare(candName(b.c)))
    return scored.slice(0, 40)
  }, [query, roster])

  const searched = nrm(query).length >= 2
  const noMatch = searched && results.length === 0 && !loading

  return (
    <div onClick={onClose} style={overlay}>
      <div onClick={e => e.stopPropagation()} style={card}>
        <div style={{ background: GREEN, padding: '18px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div style={{ color: '#fff', fontWeight: 700, fontSize: 17 }}>
            {selected ? `↩ ${candName(selected)}` : '🔎 Add Child'}
          </div>
          <button onClick={selected ? () => setSelected(null) : onClose}
            style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', width: 30, height: 30, borderRadius: '50%', cursor: 'pointer', fontSize: selected ? 15 : 18 }}>
            {selected ? '‹' : '×'}
          </button>
        </div>

        <div style={{ padding: 22, overflowY: 'auto' }}>
          {selected ? (
            <ReturnWindow
              child={selected} reviewerId={reviewerId} reviewerName={reviewerName}
              onDone={() => { onReactivated(); onClose() }}
            />
          ) : (
            <>
              <label style={lbl}>Search this center by name</label>
              <input autoFocus style={inp} placeholder="Start typing a name…"
                value={query} onChange={e => setQuery(e.target.value)} />
              <div style={{ fontSize: 12, color: '#9ca3af', margin: '6px 2px 0' }}>
                Searches everyone — active, departed, and fiscal stubs.
              </div>

              {searched && results.length > 0 && (
                <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {results.map(({ c, kind }) => {
                    const b = candBadge(c)
                    return (
                      <button key={c.id} onClick={() => setSelected(c)}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 12px', borderRadius: 10, border: '1.5px solid #e5efe5', background: '#fff', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: '#1f2937' }}>
                          {candName(c)}
                          {kind === 'similar' && <span style={{ color: '#92400e', fontWeight: 700, marginLeft: 8, fontSize: 11, background: '#fef3c7', padding: '1px 7px', borderRadius: 20 }}>similar</span>}
                          {c.birthday && <span style={{ color: '#9ca3af', fontWeight: 400, marginLeft: 8, fontSize: 12 }}>DOB {fmt(c.birthday)}</span>}
                        </span>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: b.bg, color: b.fg, whiteSpace: 'nowrap' }}>{b.text}</span>
                      </button>
                    )
                  })}
                </div>
              )}

              {noMatch && (
                <NotFoundBlock name={query} isOrgAdmin={isOrgAdmin}
                  onScan={onScan} onNewEnrollment={onNewEnrollment} onRawInsert={onRawInsert} />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── not-found choices ────────────────────────────────────────────────────────
function NotFoundBlock({ name, isOrgAdmin, onScan, onNewEnrollment, onRawInsert }: {
  name: string; isOrgAdmin: boolean; onScan: () => void; onNewEnrollment: () => void; onRawInsert: () => void
}) {
  const big: React.CSSProperties = { width: '100%', padding: '13px', borderRadius: 11, border: `1.5px solid ${GREEN}`, background: '#fff', color: GREEN, cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, fontWeight: 700, textAlign: 'left', display: 'flex', gap: 10, alignItems: 'center' }
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 12 }}>
        No one named <strong>“{name}”</strong> is on file at this center. Start a new enrollment:
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <button style={big} onClick={onScan}>📷 <span>Scan paper form <span style={{ fontWeight: 400, color: '#6b7280' }}>— photo → Inbox</span></span></button>
        <button style={{ ...big, background: GREEN, color: '#fff', border: 'none' }} onClick={onNewEnrollment}>＋ <span>New enrollment</span></button>
        {isOrgAdmin && (
          <button style={{ ...big, borderColor: '#e5e7eb', color: '#6b7280', fontWeight: 600 }} onClick={onRawInsert}>
            ⚙️ <span>Create record directly <span style={{ fontWeight: 400 }}>— admin only</span></span>
          </button>
        )}
      </div>
    </div>
  )
}

// ─── found → return window ────────────────────────────────────────────────────
function ReturnWindow({ child, reviewerId, reviewerName, onDone }: {
  child: Candidate; reviewerId: string; reviewerName: string; onDone: () => void
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
    buildReturnChecklist(child.id)
      .then(r => { if (!cancelled) setRows(r.rows) })
      .catch(e => { if (!cancelled) { setError(e.message); setRows([]) } })
    return () => { cancelled = true }
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
                  <div style={{ fontSize: 11, color: '#9ca3af' }}>
                    {r.requiringOrg} · {r.signer}
                    {r.status === 'untracked' && ' · not tracked yet'}
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
          {saving ? 'Admitting…' : '↩ Reactivate & admit'}
        </button>
      )}
    </div>
  )
}
