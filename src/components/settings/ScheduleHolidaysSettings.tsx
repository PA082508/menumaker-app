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
const btnPri: React.CSSProperties = { padding: '8px 16px', borderRadius: 9, border: 'none', background: '#0f4c35', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }
const btnSec: React.CSSProperties = { padding: '8px 14px', borderRadius: 9, border: '1.5px solid #0f4c35', background: '#fff', color: '#0f4c35', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }

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
type Sched = Record<string, Record<string, { start: string; end: string }>> // classroom → slot → times

function MealScheduleSection() {
  const { org, centers, currentCenter } = useOrg()
  const [centerId, setCenterId] = useState(currentCenter?.id ?? centers[0]?.id ?? '')
  const [classrooms, setClassrooms] = useState<Classroom[]>([])
  const [activeSlots, setActiveSlots] = useState<string[]>(['breakfast', 'am_snack', 'lunch', 'supper'])
  const [sched, setSched] = useState<Sched>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  const [savedId, setSavedId] = useState<string | null>(null)

  useEffect(() => { if (!centerId && (currentCenter?.id ?? centers[0]?.id)) setCenterId(currentCenter?.id ?? centers[0]?.id ?? '') }, [currentCenter, centers])

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
      const slots = (mcs?.active_slots as string[] | undefined)?.filter(s => SLOTS.some(([k]) => k === s)) ?? ['breakfast', 'am_snack', 'lunch', 'supper']
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

  const saveRow = async (cid: string) => {
    if (!org?.id) return
    setSavingId(cid); setSavedId(null)
    const rows = activeSlots.map(slot => ({
      classroom_id: cid, slot, center_id: centerId, org_id: org.id,
      start_time: sched[cid]?.[slot]?.start || null,
      end_time: sched[cid]?.[slot]?.end || null,
    }))
    await supabase.schema('menumaker').from('meal_schedule').upsert(rows, { onConflict: 'classroom_id,slot' })
    setSavingId(null); setSavedId(cid)
    setTimeout(() => setSavedId(s => s === cid ? null : s), 2000)
  }

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <h3 style={{ ...h3, marginBottom: 0 }}>🕐 Meal Schedule</h3>
        <select value={centerId} onChange={e => setCenterId(e.target.value)} style={inp}>
          {centers.map(c => <option key={c.id} value={c.id}>{short(c.name)}</option>)}
        </select>
      </div>
      <div style={{ fontSize: 12, color: '#888', margin: '6px 0 14px' }}>Start / End time per active slot, per classroom.</div>

      {classrooms.length === 0 ? <div style={{ color: '#aaa', fontSize: 13 }}>No active classrooms for this center.</div> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: 8, color: '#888', fontSize: 11, textTransform: 'uppercase' }}>Classroom</th>
                {activeSlots.map(s => <th key={s} style={{ padding: 8, color: '#888', fontSize: 11, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{SLOTS.find(([k]) => k === s)?.[1] ?? s}</th>)}
                <th></th>
              </tr>
            </thead>
            <tbody>
              {classrooms.map(c => (
                <tr key={c.id} style={{ borderTop: '1px solid #f0f0f0' }}>
                  <td style={{ padding: 8, fontWeight: 600, color: '#0a3320', whiteSpace: 'nowrap' }}>{c.name}</td>
                  {activeSlots.map(s => (
                    <td key={s} style={{ padding: 8 }}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <input type="time" value={sched[c.id]?.[s]?.start ?? ''} onChange={e => setTime(c.id, s, 'start', e.target.value)} style={{ ...inp, padding: '6px 6px', width: 96 }} />
                        <input type="time" value={sched[c.id]?.[s]?.end ?? ''} onChange={e => setTime(c.id, s, 'end', e.target.value)} style={{ ...inp, padding: '6px 6px', width: 96 }} />
                      </div>
                    </td>
                  ))}
                  <td style={{ padding: 8 }}>
                    <button style={savedId === c.id ? { ...btnSec, borderColor: '#0f7a4a', color: '#0f7a4a' } : btnPri} disabled={savingId === c.id} onClick={() => saveRow(c.id)}>
                      {savingId === c.id ? '…' : savedId === c.id ? 'Saved ✓' : 'Save'}
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
