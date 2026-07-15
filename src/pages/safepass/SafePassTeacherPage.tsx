// ============================================================
// SafePassTeacherPage.tsx — route /safepass/teacher
// Teacher iPad — Step 2: app auth method only (no trusted persons yet).
//
// Visual reference: safepass-teacher-v2.html (dark iPad theme, Inter).
// - Left: incoming "waiting" request queue (app method) + today's log.
// - Right: stats, paper-sheet widget, children-in-class list, notice.
// Realtime: channel safepass:classroom:{classroom_id} listens to INSERT/UPDATE
// on menumaker.safepass_sessions. Accept/Release → confirm the session.
// ============================================================

import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useOrg } from '@/contexts/OrgContext'
import { useAuth } from '@/hooks/useAuth'
import Avatar from '@/components/Avatar'

// org_id (3a9a290e-7e49-491e-946b-ad86f2399910) is stamped on INSERT by the
// parent flow (Step 4); the teacher view only reads/confirms existing sessions.

// ─── palette (from safepass-teacher-v2.html) ──────────────────────────────────
const C = {
  bg: '#0f1117', surface: '#1a1d27', surface2: '#22263a', border: '#2e3350',
  text: '#f0f2ff', muted: '#7b82a6',
  green: '#00e896', greenDim: 'rgba(0,232,150,0.12)',
  amber: '#ffb740', amberDim: 'rgba(255,183,64,0.12)',
  red: '#ff4d6a', redDim: 'rgba(255,77,106,0.12)',
  blue: '#5b8bff', blueDim: 'rgba(91,139,255,0.12)',
}

// ─── types ─────────────────────────────────────────────────────────────────────
type Classroom = { id: string; name: string; center_id: string }
type Child = { roster_id: string; child_name: string; photo_url?: string | null }
type Session = {
  id: string
  child_id: string
  child_name: string
  parent_name: string | null
  trusted_person_name: string | null
  auth_method: string
  action_type: 'drop_off' | 'pick_up' | 'transfer'
  status: string
  person_initiated_at: string
  teacher_confirmed_at: string | null
}

// ─── helpers ───────────────────────────────────────────────────────────────────
const hhmm = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }) : '--:--'

const startOfTodayISO = () => {
  const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString()
}

function elapsed(fromISO: string, now: number) {
  const secs = Math.max(0, Math.floor((now - new Date(fromISO).getTime()) / 1000))
  const m = Math.floor(secs / 60), s = secs % 60
  return `${m}:${String(s).padStart(2, '0')}`
}


// ─── Duty types ────────────────────────────────────────────────────────────────
type DutyMode = 'regular' | 'early_care' | 'late_care' | 'transport'
type DutyChild = {
  session_id: string; child_name: string; child_id: string
  classroom_name: string; classroom_id: string
  arrived_at: string; minutes_waiting: number; escalation_level: number
}
type TransportRun = {
  id: string; run_type: 'morning_to_school' | 'afternoon_from_school'
  driver_name: string; school_name: string; children_count: number
  status: string; departed_at: string | null; arrived_at: string | null
}

function EarlyCarePanelView({ dutyChildren, onTransfer, onEscalate, C }: {
  dutyChildren: DutyChild[]; onTransfer: (c: DutyChild) => void
  onEscalate: (c: DutyChild) => void; C: Record<string,string>
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 10 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.muted, textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 4 }}>
        Early Care — {dutyChildren.length} children · Ohio minimum ratios apply
      </div>
      {dutyChildren.length === 0 ? (
        <div style={{ textAlign: 'center' as const, padding: '32px 0', color: C.muted, fontSize: 13 }}>No children in Early Care yet</div>
      ) : dutyChildren.map(child => {
        const mins = child.minutes_waiting
        const urgent = mins >= 45; const warn = mins >= 15
        return (
          <div key={child.session_id} style={{ background: urgent ? 'rgba(255,77,106,0.08)' : warn ? 'rgba(255,183,64,0.08)' : C.surface, border: `1.5px solid ${urgent ? C.red : warn ? C.amber : C.border}`, borderRadius: 12, padding: '14px 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{child.child_name}</div>
                <div style={{ fontSize: 12, color: C.muted }}>→ {child.classroom_name}</div>
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: urgent ? C.red : warn ? C.amber : C.green }}>{mins}m</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => onTransfer(child)} style={{ flex: 1, padding: '8px', borderRadius: 8, background: C.green, color: C.bg, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit' }}>Transfer to Class →</button>
              {warn && <button onClick={() => onEscalate(child)} style={{ padding: '8px 12px', borderRadius: 8, background: urgent ? C.red : C.amber, color: C.bg, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit' }}>{urgent ? '🚨 CPS' : '📞 Call'}</button>}
            </div>
            {urgent && <div style={{ marginTop: 8, fontSize: 11, color: C.red, fontWeight: 600 }}>⚠️ 45+ min — Contact all emergency persons. Prepare CPS notification.</div>}
          </div>
        )
      })}
    </div>
  )
}

function LateCarePanelView({ dutyChildren, onParentArrived, onEscalate, C }: {
  dutyChildren: DutyChild[]; onParentArrived: (c: DutyChild) => void
  onEscalate: (c: DutyChild) => void; C: Record<string,string>
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.muted, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>Late Care — {dutyChildren.length} children</div>
        {dutyChildren.length > 0 && <div style={{ fontSize: 11, color: C.amber, fontWeight: 600 }}>🔒 Cannot close shift</div>}
      </div>
      {dutyChildren.length > 0 && (
        <div style={{ background: 'rgba(255,183,64,0.08)', border: `1px solid ${C.amber}`, borderRadius: 10, padding: '10px 14px', fontSize: 12, color: C.amber, marginBottom: 4 }}>
          ⚠️ Shift cannot be closed while children are present.
        </div>
      )}
      {dutyChildren.length === 0
        ? <div style={{ textAlign: 'center' as const, padding: '32px 0', color: C.green, fontSize: 13, fontWeight: 700 }}>✓ All children picked up — shift can close</div>
        : dutyChildren.map(child => {
          const mins = child.minutes_waiting
          const urgent = mins >= 45; const warn = mins >= 15
          return (
            <div key={child.session_id} style={{ background: urgent ? 'rgba(255,77,106,0.08)' : warn ? 'rgba(255,183,64,0.08)' : C.surface, border: `1.5px solid ${urgent ? C.red : warn ? C.amber : C.border}`, borderRadius: 12, padding: '14px 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{child.child_name}</div>
                  <div style={{ fontSize: 12, color: C.muted }}>from {child.classroom_name}</div>
                </div>
                <div style={{ fontSize: 20, fontWeight: 800, color: urgent ? C.red : warn ? C.amber : C.text }}>{mins}m</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 4, marginBottom: 8 }}>
                {[{t:15,l:'Call parent'},{t:30,l:'Director'},{t:45,l:'Emergency'},{t:60,l:'CPS'}].map(s => (
                  <div key={s.t} style={{ textAlign: 'center' as const, padding: '4px 2px', borderRadius: 6, background: mins>=s.t ? (mins>=45?C.red:C.amber) : C.surface2, fontSize: 9, color: mins>=s.t ? C.bg : C.muted, fontWeight: mins>=s.t ? 700 : 400 }}>{s.t}m {s.l.split(' ')[0]}</div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => onParentArrived(child)} style={{ flex: 1, padding: '8px', borderRadius: 8, background: C.green, color: C.bg, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit' }}>✓ Parent Arrived</button>
                <button onClick={() => onEscalate(child)} style={{ padding: '8px 12px', borderRadius: 8, background: urgent?C.red:C.amber, color: C.bg, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit' }}>{mins>=60?'🚨 CPS':mins>=45?'🚨 911':mins>=30?'📋 Dir':'📞 Call'}</button>
              </div>
            </div>
          )
        })
      }
    </div>
  )
}

function TransportPanelView({ runs, onConfirmRun, C }: {
  runs: TransportRun[]; onConfirmRun: (id: string) => void; C: Record<string,string>
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 10 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.muted, textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 4 }}>
        Transportation · {new Date().toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})}
      </div>
      {runs.length === 0
        ? <div style={{ textAlign: 'center' as const, padding: '32px 0', color: C.muted, fontSize: 13 }}>No transport runs today</div>
        : runs.map(run => (
          <div key={run.id} style={{ background: C.surface, border: `1.5px solid ${C.border}`, borderRadius: 12, padding: '14px 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{run.run_type==='morning_to_school'?'🚌 Morning → School':'🚌 Afternoon ← School'}</div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{run.school_name} · {run.driver_name} · {run.children_count} children</div>
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20, background: run.status==='completed'?C.greenDim:C.surface2, color: run.status==='completed'?C.green:C.muted, textTransform: 'uppercase' as const }}>{run.status}</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 10 }}>
              {['1. Center → Driver','2. Driver → School','3. School → Driver','4. Driver → Center'].map((p,i) => (
                <div key={i} style={{ fontSize: 11, color: i < (run.status==='completed'?4:run.status==='arrived'?2:1) ? C.green : C.muted }}>
                  {i < (run.status==='completed'?4:run.status==='arrived'?2:1) ? '✓' : '○'} {p}
                </div>
              ))}
            </div>
            {run.status==='arrived' && (
              <button onClick={() => onConfirmRun(run.id)} style={{ width: '100%', padding: '10px', borderRadius: 8, background: C.green, color: C.bg, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'inherit' }}>✓ Confirm All Children Returned</button>
            )}
          </div>
        ))
      }
      <div style={{ padding: '12px', background: C.surface, borderRadius: 10, fontSize: 11, color: C.muted, lineHeight: 1.6 }}>
        Per Ohio law, responsibility ends at the school's designated drop-off point. GPS timestamp + driver checklist = legal proof of delivery.
      </div>
    </div>
  )
}

export default function SafePassTeacherPage() {
  const { currentCenter } = useOrg()
  const { user, roles } = useAuth()
  const allowed = (roles as string[]).some(r => r === 'cook' || r === 'teacher' || r === 'director' || r === 'admin' || r === 'org_admin' || r === 'office_manager')
  const teacherId = user?.id ?? 'unknown'
  const teacherName =
    (user?.user_metadata?.full_name as string) || (user?.email?.split('@')[0]) || 'Teacher'

  const [classrooms, setClassrooms] = useState<Classroom[]>([])
  const [classId, setClassId] = useState<string>(() => localStorage.getItem('safepass_class') || '')
  const [roster, setRoster] = useState<Child[]>([])
  const [queue, setQueue] = useState<Session[]>([])
  const [confirmed, setConfirmed] = useState<Session[]>([])
  const [now, setNow] = useState(Date.now())
  const [toast, setToast] = useState<{ text: string; amber?: boolean } | null>(null)
  const [mode, setMode] = useState<DutyMode>('regular')
  const [dutyChildren, setDutyChildren] = useState<DutyChild[]>([])
  const [transportRuns, setTransportRuns] = useState<TransportRun[]>([])
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const className = classrooms.find(c => c.id === classId)?.name ?? '—'

  // tick (clock + timers)
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const [selectedCenterId, setSelectedCenterId] = useState<string>(currentCenter?.id ?? '')
  const [allCenters, setAllCenters] = useState<{id:string;name:string}[]>([])

  // load all centers for selector
  useEffect(() => {
    supabase.schema('menumaker').from('centers')
      .select('id,name').eq('org_id', '3a9a290e-7e49-491e-946b-ad86f2399910').eq('is_active', true).order('name')
      .then(({data}) => { setAllCenters(data ?? []); if (!selectedCenterId && data?.[0]) setSelectedCenterId(data[0].id) })
  }, [])

  useEffect(() => {
    if (currentCenter?.id) setSelectedCenterId(currentCenter.id)
  }, [currentCenter?.id])

  const activeCenterId = selectedCenterId || currentCenter?.id

  // load classrooms for the active center
  useEffect(() => {
    if (!activeCenterId) { setClassrooms([]); return }
    ;(async () => {
      const { data } = await supabase.schema('menumaker').from('classrooms')
        .select('id,name,center_id').eq('is_active', true).eq('center_id', activeCenterId).order('sort_order')
      const cls = (data ?? []) as Classroom[]
      setClassrooms(cls)
      setClassId(prev => (prev && cls.some(c => c.id === prev)) ? prev : (cls[0]?.id ?? ''))
    })()
  }, [currentCenter?.id])

  useEffect(() => { if (classId) localStorage.setItem('safepass_class', classId) }, [classId])

  // load roster + today's sessions, then subscribe to Realtime for this classroom
  useEffect(() => {
    if (!classId) { setRoster([]); setQueue([]); setConfirmed([]); return }
    let cancelled = false

    ;(async () => {
      const { data: kids } = await supabase.schema('menumaker').from('v_meal_grid')
        .select('roster_id,child_name,photo_url').eq('classroom_id', classId).eq('is_active', true)
        .order('child_name')
      if (!cancelled) setRoster((kids ?? []) as Child[])

      const { data: sess } = await supabase.schema('menumaker').from('safepass_sessions')
        .select('id,child_id,child_name,parent_name,trusted_person_name,auth_method,action_type,status,person_initiated_at,teacher_confirmed_at')
        .eq('classroom_id', classId)
        .gte('created_at', startOfTodayISO())
        .order('person_initiated_at', { ascending: true })
      if (cancelled) return
      const rows = (sess ?? []) as Session[]
      setQueue(rows.filter(s => s.status === 'waiting' && s.auth_method === 'app'))
      setConfirmed(rows.filter(s => s.status === 'confirmed').sort(
        (a, b) => +new Date(b.teacher_confirmed_at!) - +new Date(a.teacher_confirmed_at!)))
    })()

    const channel = supabase
      .channel(`safepass:classroom:${classId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'menumaker', table: 'safepass_sessions', filter: `classroom_id=eq.${classId}` },
        ({ new: s }: any) => {
          if (s.status === 'waiting' && s.auth_method === 'app') {
            setQueue(q => q.some(x => x.id === s.id) ? q : [...q, s as Session])
          }
        })
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'menumaker', table: 'safepass_sessions', filter: `classroom_id=eq.${classId}` },
        ({ new: s }: any) => {
          if (s.status === 'confirmed') {
            setQueue(q => q.filter(x => x.id !== s.id))
            setConfirmed(c => c.some(x => x.id === s.id) ? c : [s as Session, ...c])
          } else if (s.status === 'waiting' && s.auth_method === 'app') {
            setQueue(q => q.some(x => x.id === s.id) ? q : [...q, s as Session])
          } else {
            setQueue(q => q.filter(x => x.id !== s.id))
          }
        })
      .subscribe()

    return () => { cancelled = true; supabase.removeChannel(channel) }
  }, [classId])

  function flashToast(text: string, amber = false) {
    setToast({ text, amber })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2600)
  }

  async function confirm(s: Session) {
    const ts = new Date().toISOString()
    const { error } = await supabase.schema('menumaker').from('safepass_sessions')
      .update({ status: 'confirmed', teacher_confirmed_at: ts, teacher_id: teacherId, teacher_name: teacherName })
      .eq('id', s.id)
    if (error) { flashToast('Error — try again', true); return }
    setQueue(q => q.filter(x => x.id !== s.id))
    setConfirmed(c => [{ ...s, status: 'confirmed', teacher_confirmed_at: ts }, ...c])
    flashToast(s.action_type === 'drop_off' ? `✓ ${s.child_name} accepted` : `✓ ${s.child_name} released`,
      s.action_type !== 'drop_off')
  }

  const skip = (id: string) => setQueue(q => q.filter(x => x.id !== id))

  // child status from today's confirmed sessions (latest action wins)
  const statusByChild = useMemo(() => {
    const m: Record<string, { state: 'present' | 'released'; time: string }> = {}
    const sorted = [...confirmed].sort((a, b) => +new Date(a.teacher_confirmed_at!) - +new Date(b.teacher_confirmed_at!))
    for (const s of sorted) {
      const key = s.child_name.toLowerCase()
      if (s.action_type === 'drop_off') m[key] = { state: 'present', time: hhmm(s.teacher_confirmed_at) }
      else if (s.action_type === 'pick_up') m[key] = { state: 'released', time: hhmm(s.teacher_confirmed_at) }
    }
    return m
  }, [confirmed])

  const presentCount = Object.values(statusByChild).filter(s => s.state === 'present').length
  const releasedCount = Object.values(statusByChild).filter(s => s.state === 'released').length

  const clock = new Date(now).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })

  if (!allowed) {
    return (
      <div style={{ background: C.bg, color: C.text, minHeight: '100vh', fontFamily: "'Inter', system-ui, sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 40 }}>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
        <div>
          <div style={{ fontSize: 40, marginBottom: 10 }}>🛡️</div>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>SafePass — Teacher</div>
          <div style={{ fontSize: 13, color: C.muted }}>This view is available to teachers, cooks, and directors only.</div>
        </div>
      </div>
    )
  }

  // ─── styles ──────────────────────────────────────────────────────────────────
  const panelLabel: React.CSSProperties = { fontSize: 11, fontWeight: 600, letterSpacing: 1.5, textTransform: 'uppercase', color: C.muted, marginBottom: 16 }
  const methodBadge: React.CSSProperties = { fontSize: 10, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', padding: '3px 8px', borderRadius: 100, background: C.blueDim, color: C.blue }

  return (
    <div style={{ background: C.bg, color: C.text, minHeight: '100vh', fontFamily: "'Inter', system-ui, sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
      <style>{`@keyframes sp-blink{0%,100%{opacity:1}50%{opacity:.2}} @keyframes sp-pulse{0%,100%{box-shadow:0 0 0 0 rgba(255,183,64,0)}50%{box-shadow:0 0 0 6px rgba(255,183,64,0.15)}}`}</style>

      {/* HEADER */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 28px', borderBottom: `1px solid ${C.border}`, background: C.surface }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 40, height: 40, background: C.green, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🛡️</div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.3 }}>SafePass</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{className} · {currentCenter?.name ?? '—'}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {classrooms.length > 0 && (
            <select value={classId} onChange={e => setClassId(e.target.value)}
              style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 100, padding: '8px 14px', fontSize: 13, color: C.text, fontFamily: 'inherit', outline: 'none', cursor: 'pointer' }}>
              {classrooms.map(c => <option key={c.id} value={c.id} style={{ background: C.surface }}>{c.name}</option>)}
            </select>
          )}
          <div style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 100, padding: '8px 16px', fontSize: 13, fontWeight: 500 }}>👩‍🏫 {teacherName}</div>
          <div style={{ fontSize: 28, fontWeight: 300, letterSpacing: -1, color: C.green }}>{clock}</div>
        </div>
      </header>

      {/* MAIN */}
      {/* Center selector — shown when in org view */}
      {!currentCenter?.id && allCenters.length > 0 && (
        <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>CENTER:</span>
          <div style={{ display: 'flex', gap: 6 }}>
            {allCenters.map(ct => (
              <button key={ct.id} onClick={() => setSelectedCenterId(ct.id)}
                style={{ padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', border: 'none', background: selectedCenterId===ct.id ? C.green : C.surface2, color: selectedCenterId===ct.id ? C.bg : C.muted }}>
                {ct.name.replace('Play Academy ','')}
              </button>
            ))}
          </div>
          {selectedCenterId && <span style={{ fontSize: 11, color: C.green, marginLeft: 'auto' }}>✓ {allCenters.find(ct=>ct.id===selectedCenterId)?.name}</span>}
        </div>
      )}

      {/* Help link */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: '6px 20px', display: 'flex', justifyContent: 'flex-end' }}>
        <a href="/safepass/help" target="_blank"
          style={{ fontSize: 12, color: C.blue, textDecoration: 'none', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
          ❓ Teacher Guide & Help
        </a>
      </div>

      {/* Mode switcher */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: '8px 20px', display: 'flex', gap: 6, flexWrap: 'wrap' as const }}>
        {(['regular','early_care','late_care','transport'] as const).map(m => (
          <button key={m} onClick={() => setMode(m)}
            style={{ padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', border: 'none', background: mode===m?C.green:C.surface2, color: mode===m?C.bg:C.muted }}>
            {m==='regular'?'Regular':m==='early_care'?'☀️ Early Care':m==='late_care'?'🌙 Late Care':'🚌 Transport'}
          </button>
        ))}
        {dutyChildren.length>0 && <span style={{ marginLeft:'auto', fontSize:12, color:C.amber, fontWeight:700, display:'flex', alignItems:'center' }}>⚠️ {dutyChildren.length} in duty care</span>}
      </div>

      {mode==='early_care' && <div style={{ padding: '20px', maxWidth: 800, margin: '0 auto' }}><EarlyCarePanelView dutyChildren={dutyChildren} onTransfer={c=>flashToast(c.child_name+' transferred')} onEscalate={c=>flashToast('Escalating: '+c.child_name,true)} C={C}/></div>}
      {mode==='late_care' && <div style={{ padding: '20px', maxWidth: 800, margin: '0 auto' }}><LateCarePanelView dutyChildren={dutyChildren} onParentArrived={c=>flashToast(c.child_name+' picked up')} onEscalate={c=>flashToast('Escalating: '+c.child_name,true)} C={C}/></div>}
      {mode==='transport' && <div style={{ padding: '20px', maxWidth: 800, margin: '0 auto' }}><TransportPanelView runs={transportRuns} onConfirmRun={async id=>{await supabase.schema('menumaker').from('safepass_transport_runs').update({status:'completed'}).eq('id',id);flashToast('Run completed ✓')}} C={C}/></div>}

      {mode==='regular' && <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', minHeight: 'calc(100vh - 77px)' }}>

        {/* QUEUE PANEL */}
        <div style={{ padding: '24px 28px', overflowY: 'auto', borderRight: `1px solid ${C.border}` }}>
          <div style={panelLabel}>Incoming Requests</div>

          {!currentCenter?.id && <div style={{ color: C.muted, fontSize: 13 }}>Pick a center in the switcher at the top to begin.</div>}
          {currentCenter?.id && classrooms.length === 0 && <div style={{ color: C.muted, fontSize: 13 }}>No active classrooms for {currentCenter.name}.</div>}
          {classId && queue.length === 0 && (
            <div style={{ background: C.surface, border: `1px dashed ${C.border}`, borderRadius: 16, padding: '28px', textAlign: 'center', color: C.muted, fontSize: 13 }}>
              No incoming requests. Waiting for parents…
            </div>
          )}

          {queue.map(s => {
            const drop = s.action_type === 'drop_off'
            return (
              <div key={s.id} style={{ background: C.surface, border: `1px solid ${C.amber}`, borderRadius: 16, marginBottom: 14, overflow: 'hidden', animation: 'sp-pulse 1.5s ease-in-out infinite' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '18px 18px 12px' }}>
                  <div style={{ width: 52, height: 52, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0, background: drop ? C.blueDim : C.amberDim, border: `2px solid ${drop ? C.blue : C.amber}` }}>{drop ? '🧒' : '👋'}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: -0.3 }}>{s.child_name}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                      {s.parent_name && <span style={{ fontSize: 13, color: C.muted }}>{s.parent_name}</span>}
                      <span style={methodBadge}>📱 App</span>
                      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', padding: '4px 10px', borderRadius: 100, whiteSpace: 'nowrap', background: drop ? C.blueDim : C.amberDim, color: drop ? C.blue : C.amber }}>{drop ? 'Drop-off' : 'Pick-up'}</span>
                    </div>
                  </div>
                </div>
                <div style={{ padding: '0 18px 8px', fontSize: 12, color: C.muted, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.amber, animation: 'sp-blink 1s infinite' }} />
                  <span>Waiting {elapsed(s.person_initiated_at, now)}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, borderTop: `1px solid ${C.border}`, background: C.border }}>
                  <button onClick={() => skip(s.id)} style={{ padding: 15, fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer', background: C.surface2, color: C.muted, borderRadius: '0 0 0 16px', fontFamily: 'inherit' }}>Skip</button>
                  <button onClick={() => confirm(s)} style={{ padding: 15, fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer', background: drop ? C.blue : C.amber, color: drop ? '#fff' : C.bg, borderRadius: '0 0 16px 0', fontFamily: 'inherit' }}>{drop ? '✓ Accept' : '✓ Release'}</button>
                </div>
              </div>
            )
          })}

          {/* TODAY'S LOG */}
          <div style={{ ...panelLabel, marginTop: 20 }}>Today's Log</div>
          {confirmed.length === 0 && <div style={{ color: C.muted, fontSize: 13 }}>No confirmed handoffs yet today.</div>}
          {confirmed.map(s => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, marginBottom: 8 }}>
              <div style={{ fontSize: 18 }}>{s.action_type === 'drop_off' ? '✅' : '🔄'}</div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{s.child_name}</div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>{s.action_type === 'drop_off' ? 'Drop-off' : 'Pick-up'} · App{s.parent_name ? ` · ${s.parent_name}` : ''}</div>
              </div>
              <div style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 700, color: C.green }}>{hhmm(s.teacher_confirmed_at)}</div>
            </div>
          ))}
        </div>

        {/* SIDEBAR */}
        <div style={{ background: C.surface, padding: '24px 20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div>
            <div style={panelLabel}>Today</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
              {[['g', presentCount, 'Present', C.green], ['a', queue.length, 'Pending', C.amber], ['m', releasedCount, 'Released', C.muted]].map(([, num, label, col]) => (
                <div key={label as string} style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 10px', textAlign: 'center' }}>
                  <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: -1, color: col as string }}>{num as number}</div>
                  <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{label as string}</div>
                </div>
              ))}
            </div>
          </div>

          {/* PAPER SHEET WIDGET */}
          <div>
            <div style={panelLabel}>📋 Paper Sheet — Copy These Times</div>
            <div style={{ background: C.amberDim, border: `1px solid ${C.amber}`, borderRadius: 12, padding: '14px 16px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: C.amber, marginBottom: 10 }}>Today's Confirmed Times</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {confirmed.length === 0 && <div style={{ fontSize: 12, color: C.amber, opacity: 0.7 }}>Nothing confirmed yet.</div>}
                {confirmed.map(s => (
                  <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '6px 0', borderBottom: '1px solid rgba(255,183,64,0.2)' }}>
                    <span style={{ color: C.text }}>{s.child_name}</span>
                    <span style={{ color: C.amber, fontWeight: 700 }}>{s.action_type === 'drop_off' ? 'IN' : 'OUT'} {hhmm(s.teacher_confirmed_at)}</span>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 12, fontSize: 11, color: C.amber, opacity: 0.7 }}>Write these times on the paper sign-in sheet. SafePass time = paper time.</div>
            </div>
          </div>

          {/* CHILDREN IN CLASS */}
          <div>
            <div style={panelLabel}>Children in Class</div>
            {roster.length === 0 && <div style={{ fontSize: 12, color: C.muted }}>No roster for this classroom.</div>}
            {roster.map(child => {
              const st = statusByChild[child.child_name.toLowerCase()]
              const inClass = st?.state === 'present'
              const label = st ? (st.state === 'present' ? `in ${st.time}` : `out ${st.time}`) : 'not arrived'
              return (
                <div key={child.roster_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 10, marginBottom: 6 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: inClass ? C.green : C.border }} />
                  <Avatar name={child.child_name} path={child.photo_url} size={30} />
                  <div style={{ fontSize: 13, fontWeight: 500, flex: 1 }}>{child.child_name}</div>
                  <div style={{ fontSize: 11, color: C.muted }}>{label}</div>
                </div>
              )
            })}
          </div>

          {/* NOTICE */}
          <div style={{ background: C.surface2, border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.blue}`, borderRadius: 10, padding: '12px 14px', fontSize: 12, lineHeight: 1.6, color: C.muted }}>
            <strong style={{ color: C.text }}>Responsibility transfers at physical handoff — not at the door.</strong><br /><br />
            Tap <em>Accept</em> only when the child is physically in your hands. Tap <em>Release</em> only when the child is physically in the authorized person's hands. Your tap is your legal signature of physical transfer.
          </div>
        </div>
      </div>}

      {/* TOAST */}

      {toast && (
        <div style={{ position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', background: toast.amber ? C.amber : C.green, color: C.bg, fontSize: 15, fontWeight: 700, padding: '14px 28px', borderRadius: 100, zIndex: 999, whiteSpace: 'nowrap', boxShadow: '0 8px 30px rgba(0,0,0,0.4)' }}>
          {toast.text}
        </div>
      )}
    </div>
  )
}
// Mon Jun 29 17:03:05 EDT 2026
// Mon Jun 29 17:05:36 EDT 2026
// Mon Jun 29 17:13:57 EDT 2026
