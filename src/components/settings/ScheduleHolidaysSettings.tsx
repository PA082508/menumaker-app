// Schedule & Holidays settings (admin/director). Two sections:
//   1. Meal Schedule — per classroom Start/End times per active slot (meal_schedule table)
//   2. Holidays & Short Days — CRUD over the holidays table (one row per center)
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useOrg } from '@/contexts/OrgContext'

const SLOTS: [string, string][] = [['breakfast', 'Breakfast'], ['am_snack', 'AM Snack'], ['lunch', 'Lunch'], ['supper', 'Supper']]
const short = (n?: string | null) => (n ?? '').replace(/^Play Academy\s+/i, '').trim()

const card: React.CSSProperties = { background: '#fff', border: '1px solid #e8e8e8', borderRadius: 12, padding: 18, marginBottom: 20 }
const h3: React.CSSProperties = { margin: '0 0 14px', fontSize: 16, fontWeight: 700, color: '#0a3320' }
const lbl: React.CSSProperties = { display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#999', marginBottom: 4 }
const inp: React.CSSProperties = { padding: '8px 10px', borderRadius: 8, border: '1.5px solid #e0e0e0', fontSize: 14, fontFamily: 'inherit', outline: 'none' }
const selStyle: React.CSSProperties = {
  appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none',
  background: "#fff url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6'><path d='M1 1l4 4 4-4' fill='none' stroke='%230f4c35' stroke-width='1.5'/></svg>\") no-repeat right 12px center",
  border: '1.5px solid #0f4c35', borderRadius: 8, padding: '6px 30px 6px 12px',
  fontSize: 13, fontFamily: 'inherit', color: '#0f4c35', fontWeight: 600, cursor: 'pointer', outline: 'none',
}
const btnPri: React.CSSProperties = { padding: '8px 16px', borderRadius: 9, border: 'none', background: '#0f4c35', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }
const btnSec: React.CSSProperties = { padding: '8px 14px', borderRadius: 9, border: '1.5px solid #0f4c35', background: '#fff', color: '#0f4c35', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }

// ── AM/PM time helpers ────────────────────────────────────────
// Stored as "HH:MM" (24h). Displayed as h:MM + AM/PM picker.
const to24 = (h: string, m: string, ap: string) => {
  let hh = parseInt(h) || 0
  if (ap === 'PM' && hh !== 12) hh += 12
  if (ap === 'AM' && hh === 12) hh = 0
  return `${String(hh).padStart(2,'0')}:${String(parseInt(m)||0).padStart(2,'0')}`
}
const from24 = (val: string): { h: string; m: string; ap: string } => {
  if (!val) return { h: '', m: '', ap: 'AM' }
  const [hStr, mStr] = val.slice(0,5).split(':')
  let hh = parseInt(hStr) || 0
  const mm = String(parseInt(mStr)||0).padStart(2,'0')
  const ap = hh >= 12 ? 'PM' : 'AM'
  if (hh === 0) hh = 12
  else if (hh > 12) hh -= 12
  return { h: String(hh), m: mm, ap }
}

// ── TimeAmPm component ────────────────────────────────────────
function TimeAmPm({ value, onChange, compact }: {
  value: string
  onChange: (v: string) => void
  compact?: boolean
}) {
  const { h, m, ap } = from24(value)
  const hours = Array.from({length:12}, (_,i) => String(i+1))
  const mins  = ['00','05','10','15','20','25','30','35','40','45','50','55']
  const sz = compact ? 11 : 13
  const pd = compact ? '4px 5px' : '6px 8px'
  const sel: React.CSSProperties = {
    padding: pd, borderRadius: 6, border: '1.5px solid #e0e0e0',
    fontSize: sz, fontFamily: 'inherit', outline: 'none', background: '#fff',
    cursor: 'pointer', appearance: 'none', WebkitAppearance: 'none',
  }
  const update = (nh: string, nm: string, nap: string) => onChange(to24(nh||h||'12', nm||m||'00', nap||ap))

  return (
    <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
      <select value={h} onChange={e => update(e.target.value, m, ap)} style={{ ...sel, width: compact ? 46 : 52 }}>
        <option value="">--</option>
        {hours.map(v => <option key={v} value={v}>{v}</option>)}
      </select>
      <span style={{ fontSize: sz, color: '#888' }}>:</span>
      <select value={m} onChange={e => update(h, e.target.value, ap)} style={{ ...sel, width: compact ? 46 : 52 }}>
        <option value="">--</option>
        {mins.map(v => <option key={v} value={v}>{v}</option>)}
      </select>
      <select value={ap} onChange={e => update(h, m, e.target.value)} style={{ ...sel, width: compact ? 46 : 52, color: ap === 'AM' ? '#0f4c35' : '#7c4f4f', fontWeight: 700 }}>
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </div>
  )
}

export default function ScheduleHolidaysSettings() {
  return (
    <div style={{ maxWidth: 900 }}>
      <MealScheduleSection />
      <HolidaysSection />
    </div>
  )
}

// ─── PART 1: per-classroom meal schedule ──────────────────────────────────────
interface Classroom { id: string; name: string }
type Sched = Record<string, Record<string, { start: string; end: string }>>

const SLOT_LABELS: Record<string, string> = {
  breakfast: 'Breakfast', am_snack: 'AM Snack', lunch: 'Lunch',
  pm_snack: 'PM Snack', supper: 'Supper', eve_snack: 'Eve Snack',
}

function MealScheduleSection() {
  const { org, centers, currentCenter } = useOrg()
  const [centerId, setCenterId] = useState(currentCenter?.id ?? '')
  const [classrooms, setClassrooms] = useState<Classroom[]>([])
  const [activeSlots, setActiveSlots] = useState<string[]>(['breakfast', 'am_snack', 'lunch', 'supper'])
  const [sched, setSched] = useState<Sched>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  const [savedId, setSavedId]   = useState<string | null>(null)

  // Quick Apply state
  const [qaSlot,  setQaSlot]    = useState('')
  const [qaStart, setQaStart]   = useState('')
  const [qaEnd,   setQaEnd]     = useState('')
  const [qaSelected, setQaSelected] = useState<Set<string>>(new Set())
  const [qaApplied, setQaApplied]   = useState(false)

  useEffect(() => { setCenterId(currentCenter?.id ?? '') }, [currentCenter?.id])

  useEffect(() => {
    if (!centerId) return
    let cancelled = false
    ;(async () => {
      const [{ data: cls }, { data: mcs }] = await Promise.all([
        supabase.schema('menumaker').from('classrooms').select('id, name').eq('center_id', centerId).eq('is_active', true).order('sort_order'),
        supabase.schema('menumaker').from('meal_count_settings').select('active_slots').eq('center_id', centerId).maybeSingle(),
      ])
      if (cancelled) return
      const rooms = (cls ?? []) as Classroom[]
      setClassrooms(rooms)
      const slots = (mcs?.active_slots as string[] | undefined)?.filter(s => s in SLOT_LABELS) ?? ['breakfast', 'am_snack', 'lunch', 'supper']
      setActiveSlots(slots.length ? slots : ['breakfast', 'am_snack', 'lunch', 'supper'])
      const ids = rooms.map(r => r.id)
      const { data: ms } = ids.length
        ? await supabase.schema('menumaker').from('meal_schedule').select('classroom_id, slot, start_time, end_time').in('classroom_id', ids)
        : { data: [] as any[] }
      const m: Sched = {}
      for (const r of rooms) m[r.id] = {}
      for (const row of (ms ?? []) as any[]) {
        ;(m[row.classroom_id] ??= {})[row.slot] = { start: (row.start_time ?? '').slice(0, 5), end: (row.end_time ?? '').slice(0, 5) }
      }
      setSched(m)
    })()
    return () => { cancelled = true }
  }, [centerId])

  const setTime = (cid: string, slot: string, field: 'start' | 'end', v: string) =>
    setSched(prev => {
      const cur = prev[cid]?.[slot] ?? { start: '', end: '' }
      return { ...prev, [cid]: { ...prev[cid], [slot]: { ...cur, [field]: v } } }
    })

  const clearTime = (cid: string, slot: string) =>
    setSched(prev => ({ ...prev, [cid]: { ...prev[cid], [slot]: { start: '', end: '' } } }))

  const saveRow = async (cid: string) => {
    if (!org?.id) return
    setSavingId(cid); setSavedId(null)
    const rows = activeSlots.map(slot => ({
      classroom_id: cid, slot, center_id: centerId, org_id: org.id,
      start_time: sched[cid]?.[slot]?.start || null,
      end_time:   sched[cid]?.[slot]?.end   || null,
    }))
    await supabase.schema('menumaker').from('meal_schedule').upsert(rows, { onConflict: 'classroom_id,slot' })
    setSavingId(null); setSavedId(cid)
    setTimeout(() => setSavedId(s => s === cid ? null : s), 2000)
  }

  const saveAll = async () => {
    if (!org?.id) return
    setSavingId('all')
    const rows = classrooms.flatMap(c => activeSlots.map(slot => ({
      classroom_id: c.id, slot, center_id: centerId, org_id: org.id,
      start_time: sched[c.id]?.[slot]?.start || null,
      end_time:   sched[c.id]?.[slot]?.end   || null,
    })))
    await supabase.schema('menumaker').from('meal_schedule').upsert(rows, { onConflict: 'classroom_id,slot' })
    setSavingId(null); setSavedId('all')
    setTimeout(() => setSavedId(s => s === 'all' ? null : s), 2500)
  }

  // Quick Apply: apply time to selected classrooms
  const applyQuick = () => {
    if (!qaSlot || !qaStart || !qaEnd || qaSelected.size === 0) return
    const s = qaStart.slice(0, 5)
    const e = qaEnd.slice(0, 5)
    setSched(prev => {
      const next = { ...prev }
      for (const cid of qaSelected) {
        next[cid] = { ...next[cid], [qaSlot]: { start: s, end: e } }
      }
      return next
    })
    setQaApplied(true)
    setTimeout(() => {
      setQaApplied(false)
      setQaSelected(new Set())
      setQaStart('')
      setQaEnd('')
      setQaSlot('')
    }, 1200)
  }

  const toggleQaClass = (cid: string) =>
    setQaSelected(prev => { const s = new Set(prev); s.has(cid) ? s.delete(cid) : s.add(cid); return s })

  const selectAllQa = () => setQaSelected(new Set(classrooms.map(c => c.id)))
  const clearQaSelection = () => setQaSelected(new Set())

  return (
    <div style={card}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 6 }}>
        <h3 style={{ ...h3, marginBottom: 0 }}>🕐 Meal Schedule</h3>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <select value={centerId} onChange={e => setCenterId(e.target.value)} style={selStyle}>
            <option value="">🏢 Organization</option>
            {centers.map(c => <option key={c.id} value={c.id}>{short(c.name)}</option>)}
          </select>
          <button
            style={savedId === 'all' ? { ...btnSec, borderColor: '#0f7a4a', color: '#0f7a4a' } : btnPri}
            disabled={savingId === 'all' || classrooms.length === 0}
            onClick={saveAll}
          >
            {savingId === 'all' ? '…' : savedId === 'all' ? 'Saved ✓' : 'Save All'}
          </button>
        </div>
      </div>

      {/* ── Quick Apply Panel ── */}
      {classrooms.length > 0 && (
        <div style={{
          background: '#f0f7f2', border: '1.5px solid #b8dfc8', borderRadius: 12,
          padding: '14px 16px', marginBottom: 18,
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#0f4c35', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
            ⚡ Quick Apply — set one time slot for multiple classrooms
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            {/* Slot picker */}
            <div>
              <label style={lbl}>Meal slot</label>
              <select value={qaSlot} onChange={e => setQaSlot(e.target.value)} style={{ ...inp, minWidth: 130 }}>
                <option value="">— choose —</option>
                {activeSlots.map(s => <option key={s} value={s}>{SLOT_LABELS[s] ?? s}</option>)}
              </select>
            </div>
            {/* Start */}
            <div>
              <label style={lbl}>Start</label>
              <TimeAmPm value={qaStart} onChange={setQaStart} />
            </div>
            {/* End */}
            <div>
              <label style={lbl}>End</label>
              <TimeAmPm value={qaEnd} onChange={setQaEnd} />
            </div>
            {/* Apply button */}
            <button
              onClick={applyQuick}
              disabled={!qaSlot || qaStart.length < 4 || qaEnd.length < 4 || qaSelected.size === 0}
              style={{
                ...btnPri,
                opacity: (!qaSlot || !qaStart || !qaEnd || qaSelected.size === 0) ? 0.5 : 1,
                background: qaApplied ? '#0f7a4a' : '#0f4c35',
              }}
            >
              {qaApplied ? 'Applied ✓' : `Apply to ${qaSelected.size} class${qaSelected.size !== 1 ? 'es' : ''}`}
            </button>
          </div>

          {/* Classroom multiselect */}
          <div style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: '#666' }}>Select classrooms:</span>
              <button onClick={selectAllQa} style={{ ...btnSec, padding: '3px 10px', fontSize: 11 }}>All</button>
              <button onClick={clearQaSelection} style={{ ...btnSec, padding: '3px 10px', fontSize: 11 }}>None</button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {classrooms.map(c => {
                const selected = qaSelected.has(c.id)
                const hasTime = qaSlot && sched[c.id]?.[qaSlot]?.start
                return (
                  <button
                    key={c.id}
                    onClick={() => toggleQaClass(c.id)}
                    style={{
                      padding: '5px 12px', borderRadius: 8, fontSize: 12, fontFamily: 'inherit',
                      cursor: 'pointer', fontWeight: selected ? 700 : 400,
                      border: `1.5px solid ${selected ? '#0f4c35' : '#ccc'}`,
                      background: selected ? '#0f4c35' : '#fff',
                      color: selected ? '#fff' : '#333',
                      position: 'relative',
                    }}
                  >
                    {c.name}
                    {hasTime && !selected && (
                      <span style={{ marginLeft: 4, fontSize: 9, color: '#aaa' }}>✓</span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Classroom Management ── */}
      {centerId && (
        <ClassroomManager
          centerId={centerId}
          orgId={org?.id ?? ''}
          classrooms={classrooms}
          onReload={async () => {
            const { data: cls } = await supabase.schema('menumaker').from('classrooms')
              .select('id, name').eq('center_id', centerId).eq('is_active', true).order('sort_order')
            setClassrooms((cls ?? []) as Classroom[])
          }}
        />
      )}

      {/* ── Per-classroom table ── */}
      {classrooms.length === 0
        ? <div style={{ color: '#aaa', fontSize: 13 }}>No active classrooms for this center.</div>
        : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '6px 8px', color: '#888', fontSize: 11, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Classroom</th>
                {activeSlots.map(s => (
                  <th key={s} style={{ padding: '6px 8px', color: '#888', fontSize: 11, textTransform: 'uppercase', whiteSpace: 'nowrap', textAlign: 'center' }}>
                    {SLOT_LABELS[s] ?? s}
                  </th>
                ))}
                <th></th>
              </tr>
            </thead>
            <tbody>
              {classrooms.map((c, ri) => (
                <tr key={c.id} style={{ borderTop: '1px solid #f0f0f0', background: ri % 2 === 0 ? '#fff' : '#fafbfa' }}>
                  <td style={{ padding: '8px', fontWeight: 600, color: '#0a3320', whiteSpace: 'nowrap' }}>{c.name}</td>
                  {activeSlots.map(s => {
                    const t = sched[c.id]?.[s]
                    const hasTime = t?.start || t?.end
                    return (
                      <td key={s} style={{ padding: '6px 8px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <div style={{ fontSize: 9, color: '#aaa', textTransform: 'uppercase' }}>Start</div>
                          <TimeAmPm value={t?.start ?? ''} onChange={v => setTime(c.id, s, 'start', v)} compact />
                          <div style={{ fontSize: 9, color: '#aaa', textTransform: 'uppercase' }}>End</div>
                          <TimeAmPm value={t?.end ?? ''} onChange={v => setTime(c.id, s, 'end', v)} compact />
                          {hasTime && (
                            <button onClick={() => clearTime(c.id, s)} style={{ fontSize: 9, color: '#aaa', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                              clear
                            </button>
                          )}
                        </div>
                      </td>
                    )
                  })}
                  <td style={{ padding: '6px 8px' }}>
                    <button
                      style={savedId === c.id ? { ...btnSec, borderColor: '#0f7a4a', color: '#0f7a4a' } : btnSec}
                      disabled={savingId === c.id}
                      onClick={() => saveRow(c.id)}
                    >
                      {savingId === c.id ? '…' : savedId === c.id ? '✓' : 'Save'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── ClassroomManager ────────────────────────────────────────
function ClassroomManager({ centerId, orgId, classrooms, onReload }: {
  centerId: string; orgId: string
  classrooms: Classroom[]; onReload: () => void
}) {
  const [newName, setNewName]   = useState('')
  const [adding, setAdding]     = useState(false)
  const [busy, setBusy]         = useState(false)
  const [dragIdx, setDragIdx]   = useState<number | null>(null)
  const [overIdx, setOverIdx]   = useState<number | null>(null)

  const add = async () => {
    const name = newName.trim()
    if (!name || !centerId || !orgId) return
    setAdding(true)
    await supabase.schema('menumaker').from('classrooms').insert({
      org_id: orgId, center_id: centerId, name, sort_order: classrooms.length, is_active: true,
    })
    setNewName(''); setAdding(false); onReload()
  }

  const remove = async (c: Classroom) => {
    if (!confirm(`Deactivate "${c.name}"? This hides it from all views.`)) return
    setBusy(true)
    await supabase.schema('menumaker').from('classrooms').update({ is_active: false }).eq('id', c.id)
    setBusy(false); onReload()
  }

  const rename = async (c: Classroom, newN: string) => {
    if (!newN.trim() || newN === c.name) return
    await supabase.schema('menumaker').from('classrooms').update({ name: newN.trim() }).eq('id', c.id)
    onReload()
  }

  const onDrop = async (toIdx: number) => {
    if (dragIdx === null || dragIdx === toIdx) { setDragIdx(null); setOverIdx(null); return }
    // Reorder locally then save all sort_orders
    const reordered = [...classrooms]
    const [moved] = reordered.splice(dragIdx, 1)
    reordered.splice(toIdx, 0, moved)
    setBusy(true)
    await Promise.all(
      reordered.map((c, i) =>
        supabase.schema('menumaker').from('classrooms').update({ sort_order: i }).eq('id', c.id)
      )
    )
    setDragIdx(null); setOverIdx(null)
    setBusy(false); onReload()
  }

  return (
    <div style={{ marginBottom: 18, padding: '12px 16px', background: '#fafbfa', borderRadius: 10, border: '1px solid #e8ede8' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#0f4c35', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
        📋 Manage Classrooms
        <span style={{ fontSize: 10, color: '#aaa', fontWeight: 400, marginLeft: 8, textTransform: 'none' }}>drag to reorder</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
        {classrooms.map((c, i) => (
          <div
            key={c.id}
            draggable
            onDragStart={() => setDragIdx(i)}
            onDragOver={e => { e.preventDefault(); setOverIdx(i) }}
            onDragLeave={() => setOverIdx(null)}
            onDrop={() => onDrop(i)}
            onDragEnd={() => { setDragIdx(null); setOverIdx(null) }}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '4px 8px', borderRadius: 8,
              border: `1.5px solid ${overIdx === i ? '#0f4c35' : '#e8e8e8'}`,
              background: dragIdx === i ? '#f0f7f2' : overIdx === i ? '#e8f4ee' : '#fff',
              cursor: 'grab', transition: 'border-color 0.1s, background 0.1s',
              opacity: dragIdx === i ? 0.5 : 1,
            }}
          >
            {/* Drag handle */}
            <span style={{ fontSize: 14, color: '#ccc', cursor: 'grab', userSelect: 'none', flexShrink: 0 }}>⠿</span>

            {/* Name (editable) */}
            <input
              defaultValue={c.name}
              onBlur={e => rename(c, e.target.value)}
              onClick={e => e.stopPropagation()}
              onMouseDown={e => e.stopPropagation()}
              style={{ ...inp, flex: 1, padding: '4px 8px', fontSize: 13, cursor: 'text' }}
            />

            {/* Delete */}
            <button
              onClick={() => remove(c)}
              disabled={busy}
              style={{ background: 'none', border: '1px solid #fca5a5', borderRadius: 6, color: '#dc2626', cursor: 'pointer', padding: '3px 9px', fontSize: 12, fontFamily: 'inherit', flexShrink: 0 }}
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {/* Add new */}
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && add()}
          placeholder="New classroom name…"
          style={{ ...inp, flex: 1, padding: '6px 10px', fontSize: 13 }}
        />
        <button onClick={add} disabled={!newName.trim() || adding} style={btnPri}>
          {adding ? '…' : '+ Add'}
        </button>
      </div>
    </div>
  )
}

// ─── PART 2: holidays & short days ────────────────────────────────────────────
interface HolRow { id: string; center_id: string; year: number; month: number; day: number; name: string; type: string; close_time: string | null }
interface HolGroup { key: string; name: string; year: number; month: number; day: number; type: string; close_time: string | null; centerIds: string[] }

const pad = (n: number) => String(n).padStart(2, '0')

function HolidaysSection() {
  const { org, centers } = useOrg()
  const [rows, setRows] = useState<HolRow[]>([])
  const [editing, setEditing] = useState<HolGroup | 'new' | null>(null)
  const [busy, setBusy] = useState(false)

  const load = async () => {
    if (!org?.id) return
    const { data } = await supabase.schema('menumaker').from('holidays')
      .select('id, center_id, year, month, day, name, type, close_time').eq('org_id', org.id)
      .order('year').order('month').order('day')
    setRows((data ?? []) as HolRow[])
  }
  useEffect(() => { load() }, [org?.id])

  // group per-center rows into one holiday
  const groups: HolGroup[] = []
  const byKey: Record<string, HolGroup> = {}
  for (const r of rows) {
    const key = `${r.year}-${r.month}-${r.day}-${r.name}-${r.type}`
    if (!byKey[key]) { byKey[key] = { key, name: r.name, year: r.year, month: r.month, day: r.day, type: r.type, close_time: r.close_time, centerIds: [] }; groups.push(byKey[key]) }
    byKey[key].centerIds.push(r.center_id)
  }

  const remove = async (g: HolGroup) => {
    if (!org?.id || !confirm(`Delete "${g.name}" (${g.month}/${g.day}/${g.year}) for all centers?`)) return
    setBusy(true)
    await supabase.schema('menumaker').from('holidays').delete()
      .eq('org_id', org.id).eq('year', g.year).eq('month', g.month).eq('day', g.day).eq('name', g.name)
    setBusy(false); load()
  }

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ ...h3, marginBottom: 0 }}>📅 Holidays & Short Days</h3>
        {!editing && <button style={btnPri} onClick={() => setEditing('new')}>+ Add</button>}
      </div>
      <div style={{ fontSize: 12, color: '#888', margin: '6px 0 14px' }}>Holiday = closed all day. Short Day = closed after the set time.</div>

      {editing
        ? <HolidayForm group={editing === 'new' ? null : editing} centers={centers} orgId={org?.id ?? ''} busy={busy} setBusy={setBusy}
            onDone={() => { setEditing(null); load() }} onCancel={() => setEditing(null)} />
        : groups.length === 0
          ? <div style={{ color: '#aaa', fontSize: 13 }}>No holidays yet.</div>
          : groups.map(g => (
            <div key={g.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderTop: '1px solid #f0f0f0' }}>
              <div>
                <div style={{ fontWeight: 600, color: '#0a3320' }}>{g.name}</div>
                <div style={{ fontSize: 12, color: '#888' }}>
                  {g.month}/{g.day}/{g.year} ·{' '}
                  <span style={{ color: g.type === 'short_day' ? '#e67e22' : '#c0392b', fontWeight: 600 }}>
                    {g.type === 'short_day' ? `Short Day${g.close_time ? ` (close ${g.close_time.slice(0, 5)})` : ''}` : 'Closed'}
                  </span>
                  {' · '}{g.centerIds.length === centers.length ? 'All centers' : g.centerIds.map(id => short(centers.find(c => c.id === id)?.name)).join(', ')}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={btnSec} onClick={() => setEditing(g)}>Edit</button>
                <button style={{ ...btnSec, borderColor: '#c0392b', color: '#c0392b' }} disabled={busy} onClick={() => remove(g)}>Delete</button>
              </div>
            </div>
          ))}
    </div>
  )
}

function HolidayForm({ group, centers, orgId, busy, setBusy, onDone, onCancel }: {
  group: HolGroup | null; centers: { id: string; name: string }[]; orgId: string; busy: boolean
  setBusy: (b: boolean) => void; onDone: () => void; onCancel: () => void
}) {
  const [name, setName] = useState(group?.name ?? '')
  const [date, setDate] = useState(group ? `${group.year}-${pad(group.month)}-${pad(group.day)}` : '')
  const [type, setType] = useState(group?.type ?? 'holiday')
  const [closeTime, setCloseTime] = useState(group?.close_time?.slice(0, 5) ?? '')
  const [centerIds, setCenterIds] = useState<string[]>(group?.centerIds ?? centers.map(c => c.id))
  const [err, setErr] = useState('')

  const toggleCenter = (id: string) => setCenterIds(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id])
  const allChecked = centerIds.length === centers.length

  const save = async () => {
    setErr('')
    if (!name.trim()) return setErr('Enter a name.')
    if (!date) return setErr('Pick a date.')
    if (!centerIds.length) return setErr('Select at least one center.')
    if (type === 'short_day' && !closeTime) return setErr('Set a close time for a short day.')
    const [y, m, d] = date.split('-').map(Number)
    setBusy(true)
    try {
      // Replace strategy: delete the old holiday (if editing) then insert per selected center.
      if (group) {
        await supabase.schema('menumaker').from('holidays').delete()
          .eq('org_id', orgId).eq('year', group.year).eq('month', group.month).eq('day', group.day).eq('name', group.name)
      }
      const rows = centerIds.map(cid => ({
        org_id: orgId, center_id: cid, year: y, month: m, day: d, name: name.trim(),
        type, close_time: type === 'short_day' ? closeTime : null,
      }))
      // unique(center_id, year, month, day) — one holiday per center per date, so upsert.
      const { error } = await supabase.schema('menumaker').from('holidays')
        .upsert(rows, { onConflict: 'center_id,year,month,day' })
      if (error) throw new Error(error.message)
      onDone()
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); setBusy(false) }
  }

  return (
    <div style={{ background: '#fafafa', border: '1px solid #eee', borderRadius: 10, padding: 16 }}>
      {err && <div style={{ background: '#fff0f0', border: '1px solid #fcc', color: '#b02a37', borderRadius: 8, padding: '8px 10px', fontSize: 13, marginBottom: 12 }}>⚠️ {err}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <div><label style={lbl}>Name</label><input style={{ ...inp, width: '100%', boxSizing: 'border-box' }} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Independence Day" /></div>
        <div><label style={lbl}>Date</label><input type="date" style={{ ...inp, width: '100%', boxSizing: 'border-box' }} value={date} onChange={e => setDate(e.target.value)} /></div>
        <div><label style={lbl}>Type</label>
          <select style={{ ...inp, width: '100%', boxSizing: 'border-box' }} value={type} onChange={e => setType(e.target.value)}>
            <option value="holiday">Holiday (closed all day)</option>
            <option value="short_day">Short Day</option>
          </select>
        </div>
        {type === 'short_day' && <div><label style={lbl}>Close time</label><input type="time" style={{ ...inp, width: '100%', boxSizing: 'border-box' }} value={closeTime} onChange={e => setCloseTime(e.target.value)} /></div>}
      </div>
      <label style={lbl}>Centers</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
        <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 5 }}>
          <input type="checkbox" checked={allChecked} onChange={() => setCenterIds(allChecked ? [] : centers.map(c => c.id))} /> All centers
        </label>
        {centers.map(c => (
          <label key={c.id} style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 5 }}>
            <input type="checkbox" checked={centerIds.includes(c.id)} onChange={() => toggleCenter(c.id)} /> {short(c.name)}
          </label>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button style={btnPri} disabled={busy} onClick={save}>{busy ? 'Saving…' : group ? 'Save changes' : 'Add holiday'}</button>
        <button style={btnSec} disabled={busy} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}
