// AttendanceBlankReport — the Weekly Attendance Report blank, printed for hand-filling.
//
// Canon is the OWNER'S form (the one inspectors passed without remark), not DCY 01208 —
// 01208 is a compliance reference, not a template. See docs/specs/attendance-module-spec.md.
//
// v1 prints a blank: #, Child's Name and DOB come from the roster; in/out are empty
// boxes; Schedule Hours is an EMPTY column until schedule data exists (menumaker.roster
// carries no hours/schedule column at all today — only `birthday`). That is deliberate,
// not a stub: the owner's sheet was hand-filled anyway, so a blank Hours column costs
// nothing and unblocks paper this week.
//
// Paper-on-demand pattern (2-reports): build the document in a new window rather than
// hiding the app with print CSS — same as SkeletonReconciliationReport.printSheet.
// Everything interpolated from the DB goes through esc().
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useOrg } from '@/contexts/OrgContext'
import { displayChildName, byEnrollmentName } from '@/lib/childName'

const S = () => supabase.schema('menumaker')
const GREEN = '#0f4c35'

// The sample sheet spells two weekdays wrong (Wen, The). Structure is canon; spelling
// is not — we keep the five-day grid and print the words correctly.
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as const

type Kid = { id: string; first_name: string | null; last_name: string | null; child_name: string | null; birthday: string | null }
type Room = { id: string; name: string }

/** Monday of the week containing `d`, as yyyy-mm-dd. Local date — no UTC rollover. */
function mondayOf(d: Date): string {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const dow = (x.getDay() + 6) % 7          // Mon=0 … Sun=6
  x.setDate(x.getDate() - dow)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}
/** yyyy-mm-dd + n days → Date, built from parts so the local day never shifts. */
function addDays(iso: string, n: number): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d + n)
}
function usDate(iso: string | null): string {
  if (!iso) return ''
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${m}/${d}/${y}`
}
/** Today in the LOCAL date, not UTC — an evening print must not stamp tomorrow. */
function todayLocal(): string {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
}

export default function AttendanceBlankReport() {
  const { currentCenter } = useOrg()
  const centerId = currentCenter?.id ?? ''

  const [rooms, setRooms] = useState<Room[]>([])
  const [roomId, setRoomId] = useState('')
  const [kids, setKids] = useState<Kid[]>([])
  const [teachers, setTeachers] = useState<string>('')
  const [monday, setMonday] = useState<string>(() => mondayOf(new Date()))
  const [loading, setLoading] = useState(false)
  const [loadErr, setLoadErr] = useState<string | null>(null)

  useEffect(() => {
    if (!centerId) return
    let cancelled = false
    ;(async () => {
      const { data, error } = await S().from('classrooms').select('id,name').eq('center_id', centerId).order('name')
      if (cancelled) return
      if (error) { setLoadErr(error.message); return }
      const list = (data ?? []) as Room[]
      setRooms(list)
      setRoomId(prev => (list.some(r => r.id === prev) ? prev : (list[0]?.id ?? '')))
    })()
    return () => { cancelled = true }
  }, [centerId])

  useEffect(() => {
    if (!roomId) { setKids([]); return }
    let cancelled = false
    ;(async () => {
      setLoading(true); setLoadErr(null)
      try {
        const { data, error } = await S().from('roster')
          .select('id,first_name,last_name,child_name,birthday')
          .eq('classroom_id', roomId).eq('is_active', true)
        if (error) throw error
        if (!cancelled) setKids((data ?? []) as Kid[])

        // Teacher(s) — best effort. staff.class_primary holds the room NAME as text at
        // some centres, so this matches by name and is allowed to come back empty; the
        // sheet then prints a ruled line for the room to fill in by hand.
        const room = rooms.find(r => r.id === roomId)
        if (room) {
          const { data: st } = await S().from('staff')
            .select('first_name,last_name').eq('center_id', centerId).eq('is_active', true)
            .eq('class_primary', room.name)
          if (!cancelled) setTeachers(((st ?? []) as any[]).map(s => `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim()).filter(Boolean).join(', '))
        }
      } catch (e: any) {
        // A failed load must never read as "this class is empty".
        if (!cancelled) { setKids([]); setLoadErr(e?.message ?? String(e)) }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [roomId, centerId, rooms])

  // Enrollment context (platform-standards §2b): a class list is read alphabetically by
  // a teacher looking someone up. NOT byAgeOldestFirst — that rule is for CACFP meal
  // forms; this is the licensing attendance sheet.
  const ordered = useMemo(() => [...kids].sort(byEnrollmentName), [kids])
  const room = rooms.find(r => r.id === roomId)
  const monthLabel = addDays(monday, 0).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  function printSheet() {
    const w = window.open('', '_blank', 'width=1100,height=1100')
    if (!w) return
    const esc = (s: any) => String(s ?? '').replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]!))

    const dayHeads = DAYS.map((d, i) => {
      const dt = addDays(monday, i)
      return `<th colspan="2" class="day">${d}<div class="dnum">${dt.getMonth() + 1}/${dt.getDate()}</div></th>`
    }).join('')
    const inOutHeads = DAYS.map(() => `<th class="io">in</th><th class="io">out</th>`).join('')
    const cells = DAYS.map(() => `<td class="io"></td><td class="io"></td>`).join('')

    const body = ordered.map((k, i) => `
      <tr>
        <td class="num">${i + 1}</td>
        <td class="nm">${esc(displayChildName(k))}</td>
        <td class="dob">${esc(usDate(k.birthday))}</td>
        ${cells}
        <td class="hrs"></td>
      </tr>`).join('')

    w.document.write(`<!doctype html><html><head><meta charset="utf-8">
<title>Weekly Attendance Report — ${esc(room?.name ?? '')}</title>
<style>
  @page { size: landscape; margin: 10mm }
  body { font-family: Arial, Helvetica, sans-serif; color:#000; margin:0 }
  h1 { font-size:16px; margin:0 0 2px; text-align:center; letter-spacing:.02em }
  .mo { text-align:center; font-size:12px; margin-bottom:8px }
  .meta { display:flex; gap:26px; font-size:12px; margin:0 0 8px }
  .meta .f { flex:1; border-bottom:1px solid #000; padding-bottom:1px }
  .meta .lbl { font-weight:bold }
  table { border-collapse:collapse; width:100%; font-size:11px; table-layout:fixed }
  th, td { border:1px solid #000; padding:0 3px; height:22px }
  th { background:#f2f2f2; font-size:10.5px; text-align:center }
  th.day { font-size:11px }
  .dnum { font-weight:normal; font-size:9px; color:#333 }
  th.io, td.io { width:34px; text-align:center }
  .num { width:22px; text-align:center }
  .nm  { width:150px; text-align:left; white-space:nowrap; overflow:hidden; text-overflow:ellipsis }
  .dob { width:66px; text-align:center }
  .hrs { width:56px }
  th.hrs-h { width:56px }
  .foot { margin-top:8px; font-size:9px; color:#444; display:flex; justify-content:space-between }
  @media print { button { display:none } }
</style></head><body>
  <h1>Weekly Attendance Report</h1>
  <div class="mo">${esc(monthLabel)}</div>
  <div class="meta">
    <div class="f"><span class="lbl">Teacher(s):</span> ${esc(teachers)}</div>
    <div class="f"><span class="lbl">Room:</span> ${esc(room?.name ?? '')}</div>
  </div>
  <table>
    <thead>
      <tr><th rowspan="2" class="num">#</th><th rowspan="2" class="nm">Child's Name</th><th rowspan="2" class="dob">DOB</th>${dayHeads}<th rowspan="2" class="hrs-h">Schedule Hours</th></tr>
      <tr>${inOutHeads}</tr>
    </thead>
    <tbody>${body}</tbody>
  </table>
  <div class="foot">
    <span>${esc(currentCenter?.name ?? '')} · ${esc(room?.name ?? '')} · week of ${esc(usDate(monday))} · ${ordered.length} children</span>
    <span>Printed ${esc(usDate(todayLocal()))}</span>
  </div>
</body></html>`)
    w.document.close(); w.focus(); w.print()
  }

  if (!centerId) return <div style={{ padding: 32, color: '#6b7280', fontFamily: "'DM Sans', sans-serif" }}>Pick a center in the switcher at the top to print its attendance sheets.</div>

  return (
    <div style={{ padding: '28px 26px', fontFamily: "'DM Sans', sans-serif", maxWidth: 1080, margin: '0 auto' }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#6b7280', marginBottom: 6 }}>REPORTS</div>
      <h1 style={{ fontSize: 26, fontWeight: 700, color: '#0a3320', margin: 0, fontFamily: "'DM Serif Display', serif" }}>Weekly Attendance Report</h1>
      <p style={{ margin: '6px 0 16px', color: '#6b7280', fontSize: 14 }}>
        {currentCenter?.name} · a printable blank for the week: numbers, names and DOB are filled in — in/out are left empty for the room to write by hand.
      </p>

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <label style={{ display: 'grid', gap: 4 }}>
          <span style={lbl}>Classroom</span>
          <select value={roomId} onChange={e => setRoomId(e.target.value)} style={ctl}>
            {rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </label>
        <label style={{ display: 'grid', gap: 4 }}>
          <span style={lbl}>Week starting (Monday)</span>
          <input type="date" value={monday} onChange={e => e.target.value && setMonday(mondayOf(addDays(e.target.value, 0)))} style={ctl} />
        </label>
        <button onClick={printSheet} disabled={!ordered.length} style={{
          marginLeft: 'auto', padding: '9px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
          background: GREEN, color: '#fff', border: 'none', fontFamily: 'inherit',
          cursor: ordered.length ? 'pointer' : 'default', opacity: ordered.length ? 1 : 0.5,
        }}>🖨 Print blank</button>
      </div>

      {loadErr && (
        <div role="alert" style={{ padding: '11px 14px', borderRadius: 9, background: '#fef2f2', border: '1px solid #fca5a5', color: '#991b1b', fontSize: 13, marginBottom: 12 }}>
          ⚠ This class could not be loaded — the list below is <b>not</b> empty, it failed: {loadErr}
        </div>
      )}

      <div style={{ background: '#f0f7f4', border: '1px solid #d1fae5', borderRadius: 9, padding: '9px 12px', fontSize: 12.5, color: '#1a2e1a', marginBottom: 14 }}>
        <b>Schedule Hours prints empty.</b> There is no schedule anywhere in the roster yet, so the column is left for hand-filling — exactly as the sheet was filled before. It fills itself once schedules are imported.
      </div>

      {loading ? <div style={{ color: '#6b7280', padding: 24 }}>Loading…</div> : ordered.length === 0 ? (
        <div style={{ padding: '28px 22px', textAlign: 'center', color: '#9ca3af', fontSize: 14, background: '#fafafa', borderRadius: 12, border: '1px dashed #e5e7eb' }}>
          No active children in this classroom.
        </div>
      ) : (
        <>
          <div style={{ fontSize: 12.5, color: '#6b7280', marginBottom: 8 }}>
            {ordered.length} children · week of {usDate(monday)} · Teacher(s): {teachers || <i>— none on file; the sheet prints a blank line</i>}
          </div>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13, background: '#fff' }}>
            <thead>
              <tr>
                <th style={th}>#</th><th style={{ ...th, textAlign: 'left' }}>Child's Name</th><th style={th}>DOB</th>
                {DAYS.map((d, i) => <th key={d} style={th}>{d}<div style={{ fontWeight: 400, fontSize: 10, color: '#6b7280' }}>{addDays(monday, i).getMonth() + 1}/{addDays(monday, i).getDate()}</div></th>)}
                <th style={th}>Hours</th>
              </tr>
            </thead>
            <tbody>
              {ordered.map((k, i) => (
                <tr key={k.id}>
                  <td style={{ ...td, textAlign: 'center', color: '#6b7280' }}>{i + 1}</td>
                  <td style={td}>{displayChildName(k)}</td>
                  <td style={{ ...td, textAlign: 'center' }}>{usDate(k.birthday)}</td>
                  {DAYS.map(d => <td key={d} style={{ ...td, background: '#fcfcfc' }} />)}
                  <td style={{ ...td, background: '#fcfcfc' }} />
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}

const lbl: React.CSSProperties = { fontSize: 10.5, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#6b7280' }
const ctl: React.CSSProperties = { font: 'inherit', fontSize: 13, padding: '7px 10px', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff' }
const th: React.CSSProperties = { border: '1px solid #e4e8e4', background: '#f0fff4', padding: '5px 7px', color: '#0a3320', fontSize: 11.5 }
const td: React.CSSProperties = { border: '1px solid #e4e8e4', padding: '5px 7px', color: '#374151' }
