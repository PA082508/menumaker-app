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
import { classifyChild, scoreChild, type MatchKind } from '@/lib/childSearch'
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
      .map(c => ({ c, kind: classifyChild(c, query) as MatchKind, score: scoreChild(c, query) }))
      .filter(x => x.kind !== null)
    scored.sort((a, b) =>
      ((a.kind === 'exact' ? 0 : 1) - (b.kind === 'exact' ? 0 : 1))   // exact before similar
      || (b.score - a.score)                                          // then by relevance (search-v2)
      || (Number(!!b.c.is_active) - Number(!!a.c.is_active))          // active before inactive
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
// Care & meals is in the MINIMAL set: without a schedule the child never passes
// Review (anyValidDay) and never reaches the grid. Meals derive from the center's
// slots + classroom slot windows (same «≤» arrival-inclusive rule as the form-kit).
const MANUAL_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as const
type ManualDay = typeof MANUAL_DAYS[number]
const SLOT_TO_CODE: Record<string, string> = { breakfast: 'b', am_snack: 'as', lunch: 'l', pm_snack: 'ps', supper: 'su', evening_snack: 'es' }
const CODE_LABEL: Record<string, string> = { b: 'Bkfst', as: 'AM', l: 'Lunch', ps: 'PM', su: 'Supper', es: 'Eve' }
const toMin = (t: string): number | null => { const m = /^(\d{1,2}):(\d{2})/.exec(t || ''); return m ? (+m[1]) * 60 + (+m[2]) : null }
type DaySched = { in_care: boolean; arr1: string; dep1: string; meals: Record<string, boolean> }
const emptyDay = (): DaySched => ({ in_care: false, arr1: '', dep1: '', meals: {} })

function ManualEntryModal({ centerId, orgId, classrooms, reviewerName, onDone }: {
  centerId: string; orgId: string; classrooms: { id: string; name: string }[]; reviewerName: string; onDone: () => void
}) {
  // FRP defaults to 'P' (Paid) — the actual category is set by the determining
  // official after IEA review; 'P' is the safe pre-determination default.
  const [form, setForm] = useState({ first_name: '', last_name: '', birthday: '', classroom_id: '', date_in: new Date().toISOString().slice(0, 10), frp: 'P' })
  const [sched, setSched] = useState<Record<ManualDay, DaySched>>(() => Object.fromEntries(MANUAL_DAYS.map(d => [d, emptyDay()])) as Record<ManualDay, DaySched>)
  const [slotCodes, setSlotCodes] = useState<string[]>([])                 // meal codes the center serves (order preserved)
  const [slotWin, setSlotWin] = useState<Record<string, { s: number; e: number }>>({})  // code → window (mins) for derive
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }))

  // Center's active meal slots → which meal columns to show.
  useEffect(() => {
    let off = false
    supabase.schema('menumaker').from('meal_count_settings').select('active_slots').eq('center_id', centerId).maybeSingle()
      .then(({ data }) => {
        if (off) return
        const active: string[] = Array.isArray(data?.active_slots) ? data!.active_slots : ['breakfast', 'am_snack', 'lunch', 'supper']
        setSlotCodes(active.map(s => SLOT_TO_CODE[s]).filter(Boolean))
      })
    return () => { off = true }
  }, [centerId])

  // Selected classroom's slot windows → auto-derive meals from hours (like the kit).
  useEffect(() => {
    if (!form.classroom_id) { setSlotWin({}); return }
    let off = false
    supabase.schema('menumaker').from('meal_schedule').select('slot, start_time, end_time').eq('classroom_id', form.classroom_id)
      .then(({ data }) => {
        if (off) return
        const win: Record<string, { s: number; e: number }> = {}
        for (const r of (data ?? []) as any[]) {
          const code = SLOT_TO_CODE[r.slot]; const s = toMin(String(r.start_time ?? '')); const e = toMin(String(r.end_time ?? ''))
          if (code && s != null && e != null) win[code] = { s, e }
        }
        setSlotWin(win)
      })
    return () => { off = true }
  }, [form.classroom_id])

  // «≤» arrival-inclusive overlap: arrive exactly at a slot's end still counts.
  function derive(arr1: string, dep1: string): Record<string, boolean> {
    const a = toMin(arr1), d = toMin(dep1); const meals: Record<string, boolean> = {}
    if (a == null || d == null || d <= a) return meals
    for (const code of slotCodes) { const w = slotWin[code]; if (w && a <= w.e && w.s < d) meals[code] = true }
    return meals
  }
  const setDay = (day: ManualDay, patch: Partial<DaySched>) => setSched(p => {
    const next = { ...p[day], ...patch }
    if (('arr1' in patch || 'dep1' in patch) && Object.keys(slotWin).length) next.meals = derive(next.arr1, next.dep1)  // re-derive on hours change
    return { ...p, [day]: next }
  })
  const toggleMeal = (day: ManualDay, code: string) => setSched(p => ({ ...p, [day]: { ...p[day], meals: { ...p[day].meals, [code]: !p[day].meals[code] } } }))
  const applyMonToWeek = () => setSched(p => {
    const mon = p.Mon; const next = { ...p }
    for (const d of MANUAL_DAYS) if (d !== 'Mon') next[d] = { in_care: mon.in_care, arr1: mon.arr1, dep1: mon.dep1, meals: { ...mon.meals } }
    return next
  })

  const dayValid = (d: DaySched) => d.in_care && !!d.arr1 && !!d.dep1 && Object.values(d.meals).some(Boolean)
  const anyValidDay = MANUAL_DAYS.some(d => dayValid(sched[d]))

  async function submit() {
    if (!form.first_name || !form.last_name || !form.birthday || !form.classroom_id) { setError('Enter first & last name, birthday, and classroom'); return }
    if (!anyValidDay) { setError('Add at least one care day with arrival, departure, and a meal (Care & meals).'); return }
    setSaving(true); setError('')
    try {
      const child_name = `${form.last_name} ${form.first_name}`
      const schedule = Object.fromEntries(MANUAL_DAYS.map(d => [d, { in_care: sched[d].in_care, arr1: sched[d].arr1, dep1: sched[d].dep1, arr2: '', dep2: '', meals: sched[d].meals }]))
      const form_data = {
        type: 'cacfp_enrollment', child_name, first_name: form.first_name, last_name: form.last_name,
        birthdate: form.birthday, classroom_id: form.classroom_id, date_in: form.date_in, frp: form.frp,
        schedule,
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

  const th: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', padding: '2px 4px', textAlign: 'center' }
  const timeInp: React.CSSProperties = { width: '100%', padding: '4px 6px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12, fontFamily: 'inherit' }

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
          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 3, lineHeight: 1.4 }}>
            P until income determination; category is set by the determining official after IEA review.
          </div>
        </div>
      </div>

      {/* Care & meals — minimal set. Meals auto-check from the classroom's slot windows. */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <label style={lbl}>Care &amp; meals * <span style={{ fontWeight: 400, color: '#9ca3af' }}>— at least one day</span></label>
          <button type="button" onClick={applyMonToWeek} style={{ fontSize: 11, background: 'none', border: 'none', color: GREEN, cursor: 'pointer', fontWeight: 600 }}>Apply Mon → Tue–Fri</button>
        </div>
        {!Object.keys(slotWin).length && form.classroom_id && (
          <div style={{ fontSize: 11, color: '#92400e', margin: '2px 0 6px' }}>No slot times set for this classroom — check meals manually.</div>
        )}
        <div style={{ border: '1px solid #eee', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: `70px 1fr 1fr ${slotCodes.map(() => 'auto').join(' ')}`, alignItems: 'center', background: '#f8faf8', borderBottom: '1px solid #eee' }}>
            <div style={th}>Day</div><div style={th}>Arrive</div><div style={th}>Depart</div>
            {slotCodes.map(c => <div key={c} style={th}>{CODE_LABEL[c] ?? c}</div>)}
          </div>
          {MANUAL_DAYS.map(day => {
            const d = sched[day]
            return (
              <div key={day} style={{ display: 'grid', gridTemplateColumns: `70px 1fr 1fr ${slotCodes.map(() => 'auto').join(' ')}`, alignItems: 'center', padding: '4px 4px', borderBottom: '1px solid #f4f4f4', opacity: d.in_care ? 1 : 0.55 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, padding: '0 4px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={d.in_care} onChange={e => setDay(day, { in_care: e.target.checked })} style={{ accentColor: GREEN }} />{day}
                </label>
                <div style={{ padding: '0 3px' }}><input type="time" disabled={!d.in_care} value={d.arr1} onChange={e => setDay(day, { arr1: e.target.value })} style={timeInp} /></div>
                <div style={{ padding: '0 3px' }}><input type="time" disabled={!d.in_care} value={d.dep1} onChange={e => setDay(day, { dep1: e.target.value })} style={timeInp} /></div>
                {slotCodes.map(c => (
                  <div key={c} style={{ textAlign: 'center' }}>
                    <input type="checkbox" disabled={!d.in_care} checked={!!d.meals[c]} onChange={() => toggleMeal(day, c)} style={{ accentColor: GREEN }} />
                  </div>
                ))}
              </div>
            )
          })}
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
