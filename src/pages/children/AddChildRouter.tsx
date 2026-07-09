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
import ReturnWindow from './ReturnWindow'

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
  centerId, orgId, classrooms, reviewerId, reviewerName, isOrgAdmin,
  onClose, onReactivated, onNewEnrollment, onScan, onRawInsert,
}: {
  centerId: string
  orgId: string
  classrooms: { id: string; name: string }[]
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
  const [showManual, setShowManual] = useState(false)

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
            {showManual ? '✍️ Manual entry — no scan' : selected ? `↩ ${candName(selected)}` : '🔎 Add Child'}
          </div>
          <button onClick={showManual ? () => setShowManual(false) : selected ? () => setSelected(null) : onClose}
            style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', width: 30, height: 30, borderRadius: '50%', cursor: 'pointer', fontSize: (showManual || selected) ? 15 : 18 }}>
            {(showManual || selected) ? '‹' : '×'}
          </button>
        </div>

        <div style={{ padding: 22, overflowY: 'auto' }}>
          {showManual ? (
            <ManualEntryModal
              centerId={centerId} orgId={orgId} classrooms={classrooms} reviewerName={reviewerName}
              onDone={() => { onClose(); onNewEnrollment() }}
            />
          ) : selected ? (
            <ReturnWindow
              child={{ id: selected.id, name: candName(selected), is_active: selected.is_active, date_out: selected.date_out }}
              reviewerId={reviewerId} reviewerName={reviewerName}
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
                  onScan={onScan} onNewEnrollment={onNewEnrollment} onRawInsert={onRawInsert}
                  onManual={() => setShowManual(true)} />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── not-found choices ────────────────────────────────────────────────────────
function NotFoundBlock({ name, isOrgAdmin, onScan, onNewEnrollment, onRawInsert, onManual }: {
  name: string; isOrgAdmin: boolean; onScan: () => void; onNewEnrollment: () => void; onRawInsert: () => void; onManual: () => void
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
        <button style={big} onClick={onManual}>✍️ <span>Manual entry <span style={{ fontWeight: 400, color: '#6b7280' }}>— no scan (paper unusable)</span></span></button>
        {isOrgAdmin && (
          <button style={{ ...big, borderColor: '#e5e7eb', color: '#6b7280', fontWeight: 600 }} onClick={onRawInsert}>
            ⚙️ <span>Create record directly <span style={{ fontWeight: 400 }}>— admin only</span></span>
          </button>
        )}
      </div>
    </div>
  )
}

// ─── manual entry (no scan) ───────────────────────────────────────────────────
// Director types an enrollment when the paper form is unusable/unscannable. Files
// a pending CACFP submission with source='manual_entry' (audit note in form_data)
// → standard Inbox Review/Approve → roster child in a classroom → meal grid.
function ManualEntryModal({ centerId, orgId, classrooms, reviewerName, onDone }: {
  centerId: string; orgId: string; classrooms: { id: string; name: string }[]; reviewerName: string; onDone: () => void
}) {
  const [form, setForm] = useState({ first_name: '', last_name: '', birthday: '', classroom_id: '', date_in: new Date().toISOString().slice(0, 10), frp: 'F' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }))

  async function submit() {
    if (!form.first_name || !form.last_name || !form.birthday || !form.classroom_id) { setError('Enter first & last name, birthday, and classroom'); return }
    setSaving(true); setError('')
    try {
      const child_name = `${form.last_name} ${form.first_name}`
      const form_data = {
        type: 'cacfp_enrollment', child_name, first_name: form.first_name, last_name: form.last_name,
        birthdate: form.birthday, classroom_id: form.classroom_id, date_in: form.date_in, frp: form.frp,
        _manual: true, _source_note: 'manual (no scan / paper unusable)', _entered_by: reviewerName,
      }
      const { error: err } = await (supabase.schema('menumaker').rpc as any)('submit_enrollment_form', {
        p_org: orgId, p_center: centerId, p_submission_type: 'cacfp_enrollment',
        p_form_data: form_data, p_signatures: {}, p_signature_date: null, p_source: 'manual_entry',
      })
      if (err) throw err
      onDone()
    } catch (e: any) { setError(e.message); setSaving(false) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontSize: 13, color: '#555', lineHeight: 1.5 }}>
        Paper form unusable? Type the essentials — this files a pending enrollment (marked
        <strong> manual, no scan</strong>) for you to Review &amp; Approve in the Inbox. The child then
        appears in this center's meal grid.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div><label style={lbl}>First name *</label><input style={inp} value={form.first_name} onChange={e => set('first_name', e.target.value)} /></div>
        <div><label style={lbl}>Last name *</label><input style={inp} value={form.last_name} onChange={e => set('last_name', e.target.value)} /></div>
      </div>
      <div><label style={lbl}>Birthday *</label><input type="date" style={inp} value={form.birthday} onChange={e => set('birthday', e.target.value)} /></div>
      <div>
        <label style={lbl}>Classroom *</label>
        <select style={inp} value={form.classroom_id} onChange={e => set('classroom_id', e.target.value)}>
          <option value="">Select classroom…</option>
          {classrooms.filter(c => !c.name.toLowerCase().includes('staff')).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div><label style={lbl}>Date In</label><input type="date" style={inp} value={form.date_in} onChange={e => set('date_in', e.target.value)} /></div>
        <div>
          <label style={lbl}>Meal Status (FRP)</label>
          <select style={inp} value={form.frp} onChange={e => set('frp', e.target.value)}>
            <option value="F">Free</option><option value="R">Reduced</option><option value="P">Paid</option>
          </select>
        </div>
      </div>
      {error && <div style={{ color: '#dc2626', fontSize: 13 }}>{error}</div>}
      <button onClick={submit} disabled={saving}
        style={{ padding: '12px', borderRadius: 9, background: GREEN, color: '#fff', border: 'none', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 14, fontFamily: 'inherit', opacity: saving ? 0.6 : 1 }}>
        {saving ? 'Filing…' : '✍️ File for review (no scan)'}
      </button>
    </div>
  )
}
