// CenterRosterPage.tsx — Children page for a specific center
// Table view: classroom rows, click to expand children + teachers cards

import { useEffect, useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import ChildSettingsPage from './ChildSettingsPage'
import EmergencyPopup from './EmergencyPopup'
import AddChildRouterModal from './AddChildRouter'
import { useOrg } from '@/contexts/OrgContext'
import { useAuth } from '@/hooks/useAuth'
import { displayChildName } from '@/lib/childName'
import { isActiveOn } from '@/lib/childActive'
import { classifyChild, type MatchKind } from '@/lib/childSearch'
import AddChildPacketPanel from './AddChildPacketPanel'

type Classroom = { id: string; name: string; sort_order: number; capacity_internal: number | null; is_roster?: boolean | null }

// Roster class-summary columns — ONE source of truth so the header, each class
// row and the TOTAL line always line up: class · capacity · fill% · listed ·
// today · teachers. Compact: fixed numeric columns hug the class name; teachers
// takes the remainder.
const SUMMARY_COLS = 'minmax(150px,210px) 84px 76px 72px 72px minmax(110px,1fr)'

// Fill% colour thresholds (percent of capacity used). ≥green → green,
// ≥yellow → amber, otherwise red. Tune here.
const FILL_THRESHOLDS = { green: 90, yellow: 70 }
function fillStyle(pct: number | null): { bg: string; fg: string } {
  if (pct === null)                  return { bg: 'transparent', fg: '#c4c4c4' }
  if (pct >= FILL_THRESHOLDS.green)  return { bg: '#dcfce7', fg: '#15803d' }
  if (pct >= FILL_THRESHOLDS.yellow) return { bg: '#fef9c3', fg: '#a16207' }
  return { bg: '#fee2e2', fg: '#b91c1c' }
}
// LISTED/Capacity → whole-percent, or null when capacity is unset (→ shows "—").
function fillPct(listed: number, capacity: number | null): number | null {
  return capacity && capacity > 0 ? Math.round((listed / capacity) * 100) : null
}
type Child = {
  id: string; first_name: string | null; last_name: string | null
  child_name: string | null; age_group_food: string | null; frp: string | null
  date_in: string | null; date_out: string | null; birthday: string | null
  milk_kind: string | null; classroom_id: string | null
  is_active?: boolean | null
}
type StaffRow = {
  id: string; first_name: string | null; last_name: string | null
  position: string | null; class_primary: string | null
  class_secondary: string | null; phone?: string | null; email?: string | null
  photo_url?: string | null
}
type Session = {
  id: string; child_id: string | null; child_name: string
  action_type: 'drop_off' | 'pick_up' | 'transfer'
  status: string; teacher_confirmed_at: string | null; classroom_id: string
}
type AttendState = { state: 'present' | 'released'; time: string }
type PopupData =
  | { kind: 'child'; child: Child; attend: AttendState | null }
  | { kind: 'staff'; staff: StaffRow }

const todayStr = new Date().toISOString().slice(0, 10)
const AGE_LABEL: Record<string, string> = {
  infant_0_5m: '0-5m', infant_6_11m: '6-11m',
  '1y': '1yr', '2y': '2yr', '3_5': '3-5y', '6_12': '6-12y',
}
const FRP_COLOR: Record<string, string> = { F: '#0f4c35', R: '#92400e', P: '#6b7280' }
const FRP_BG: Record<string, string>    = { F: '#f0fff4', R: '#fffbeb', P: '#f4f4f5' }

function startOfTodayISO() {
  const d = new Date(); d.setHours(0,0,0,0); return d.toISOString()
}
const hhmm = (iso: string | null) => {
  if (!iso) return ''
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}
const fmtDate = (d: string | null) => {
  if (!d) return '—'
  const [y,m,day] = d.slice(0,10).split('-')
  return `${Number(m)}/${Number(day)}/${y}`
}
const fullName = (c: Child) => displayChildName(c)

// Name search delegates to the shared token+fuzzy matcher (src/lib/childSearch)
// so every child-search surface behaves identically: token match in any order
// ("Erulan Rakhmanov" finds "Rakhmanov Erulan"), plus fuzzy 'similar' suggestions
// so typo records (Rackmanov ↔ Rakhmanov) are never invisible.
const childSearchKind = (c: Child, q: string): MatchKind => q ? classifyChild(c, q) : 'exact'
function childMatchesSearch(c: Child, q: string): boolean {
  return childSearchKind(c, q) !== null
}

const staffName = (s: StaffRow) =>
  [s.first_name, s.last_name].filter(Boolean).join(' ').trim() || '—'
const avatarColor = (name: string) => {
  const colors = ['#0f4c35','#1a6b4a','#2d8f64','#4a7c6b','#5c4f7c','#7c4f4f','#4f6b7c']
  let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0xffff
  return colors[h % colors.length]
}

function Avatar({ name, size = 40, photo }: { name: string; size?: number; photo?: string | null }) {
  const [err, setErr] = useState(false)
  const bg = avatarColor(name)
  const ini = name.split(' ').map(w => w[0]).filter(Boolean).slice(0,2).join('').toUpperCase()
  if (photo && !err) return (
    <img src={photo} alt={name} onError={() => setErr(true)}
      style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
  )
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff', fontWeight: 700, fontSize: size * 0.35, flexShrink: 0,
    }}>{ini || '?'}</div>
  )
}

function DetailPopup({ data, onClose, classrooms, onChanged }: { data: PopupData; onClose: () => void; classrooms: Classroom[]; onChanged: () => void }) {
  const [mode, setMode] = useState<'view'|'edit'|'transfer'>('view')
  const name = data.kind === 'child' ? fullName(data.child) : staffName(data.staff)
  const photo = data.kind === 'child' ? null : data.staff.photo_url
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: 20,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: 18, width: '100%', maxWidth: 380,
        boxShadow: '0 20px 60px rgba(0,0,0,0.18)', maxHeight: '90vh', overflowY: 'auto',
        fontFamily: "'DM Sans', sans-serif",
      }}>
        <div style={{ background: '#0f4c35', padding: '24px 24px 20px', display: 'flex', gap: 16, alignItems: 'center' }}>
          <Avatar name={name} size={60} photo={photo} />
          <div style={{ flex: 1 }}>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 17 }}>{name}</div>
            {data.kind === 'child' && (
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 3 }}>
                {AGE_LABEL[data.child.age_group_food ?? ''] ?? data.child.age_group_food ?? ''}
                {data.child.frp ? ` · ${data.child.frp}` : ''}
              </div>
            )}
            {data.kind === 'staff' && (
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 3 }}>
                {data.staff.position ?? 'Staff'}
              </div>
            )}
          </div>
          <div style={{ display:'flex', gap:6, alignItems:'center' }}>
            {data.kind === 'child' && (
              <>
                <button onClick={() => setMode(m => m==='edit' ? 'view' : 'edit')} style={{ background:'rgba(255,255,255,0.15)', border:'none', color:'#fff', width:30, height:30, borderRadius:'50%', cursor:'pointer', fontSize:15 }} title="Edit">✏️</button>
                <button onClick={() => setMode(m => m==='transfer' ? 'view' : 'transfer')} style={{ background:'rgba(255,255,255,0.15)', border:'none', color:'#fff', width:30, height:30, borderRadius:'50%', cursor:'pointer', fontSize:15 }} title="Transfer">🔄</button>
              </>
            )}
            <button onClick={onClose} style={{ background:'rgba(255,255,255,0.15)', border:'none', color:'#fff', width:30, height:30, borderRadius:'50%', cursor:'pointer', fontSize:18 }}>×</button>
          </div>
        </div>
        <div style={{ padding: 24 }}>
          {data.kind === 'child' && (() => {
            const c = data.child; const at = data.attend
            const frpKey = (c.frp ?? '').trim().toUpperCase().slice(0,1)
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{
                  padding: '10px 14px', borderRadius: 10,
                  background: at?.state === 'present' ? '#f0fff4' : at?.state === 'released' ? '#fff8e1' : '#f4f4f5',
                  border: `1px solid ${at?.state === 'present' ? '#bbf7d0' : at?.state === 'released' ? '#fde68a' : '#e0e0e0'}`,
                  display: 'flex', alignItems: 'center', gap: 10,
                }}>
                  <span style={{ fontSize: 20 }}>
                    {at?.state === 'present' ? '✅' : at?.state === 'released' ? '🔄' : '⬜'}
                  </span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: '#1a2e1a' }}>
                      {at?.state === 'present' ? 'Present' : at?.state === 'released' ? 'Checked out' : 'Not arrived'}
                    </div>
                    {at?.time && <div style={{ fontSize: 12, color: '#666' }}>
                      {at.state === 'present' ? `Arrived ${at.time}` : `Left ${at.time}`}
                    </div>}
                  </div>
                </div>
                {[
                  { label: 'Birthday',  value: fmtDate(c.birthday) },
                  { label: 'Date In',   value: fmtDate(c.date_in) },
                  { label: 'Meal',      value: frpKey ? `${frpKey === 'F' ? 'Free' : frpKey === 'R' ? 'Reduced' : 'Paid'}` : '—' },
                  { label: 'Milk',      value: c.milk_kind ?? '—' },
                  { label: 'Age group', value: AGE_LABEL[c.age_group_food ?? ''] ?? c.age_group_food ?? '—' },
                ].map(({ label, value }) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f0f0f0', paddingBottom: 8 }}>
                    <span style={{ fontSize: 12, color: '#888' }}>{label}</span>
                    <span style={{ fontSize: 13, color: '#1a2e1a', fontWeight: 500 }}>{value}</span>
                  </div>
                ))}
                {mode === 'transfer' && <TransferChildPanel child={c} classrooms={classrooms} onDone={() => { onClose(); onChanged() }} />}
                {mode === 'edit' && <EditChildPanel child={c} classrooms={classrooms} onDone={() => { onClose(); onChanged() }} />}
              </div>
            )
          })()}
          {data.kind === 'staff' && (() => {
            const s = data.staff
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{
                  padding: '10px 14px', borderRadius: 10, background: '#f4f6f4',
                  border: '1px solid #e0e8e0', display: 'flex', alignItems: 'center', gap: 10,
                }}>
                  <span style={{ fontSize: 20 }}>⏳</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>Timesheet — coming soon</div>
                    <div style={{ fontSize: 12, color: '#888' }}>Teacher SafePass in development</div>
                  </div>
                </div>
                {[
                  { label: 'Position',   value: s.position ?? '—' },
                  { label: 'Phone',      value: s.phone ?? '—' },
                  { label: 'Email',      value: s.email ?? '—' },
                  { label: 'Secondary',  value: s.class_secondary ?? '—' },
                ].map(({ label, value }) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f0f0f0', paddingBottom: 8 }}>
                    <span style={{ fontSize: 12, color: '#888' }}>{label}</span>
                    <span style={{ fontSize: 13, color: '#1a2e1a', fontWeight: 500 }}>{value}</span>
                  </div>
                ))}
              </div>
            )
          })()}
        </div>
      </div>
    </div>
  )
}

export default function CenterRosterPage({ centerId: centerIdProp }: { centerId?: string } = {}) {
  const { centerId: centerIdParam } = useParams<{ centerId: string }>()
  const centerId = centerIdProp ?? centerIdParam
  const { centers, currentCenter, org, isOrgAdmin } = useOrg()
  const { user } = useAuth()
  const navigate = useNavigate()
  const center = centers.find(c => c.id === centerId)

  const [classrooms, setClassrooms] = useState<Classroom[]>([])
  const [allChildren, setAllChildren] = useState<Child[]>([])  // active + inactive (search spans both)
  const [staff,      setStaff]      = useState<StaffRow[]>([])
  const [sessions,   setSessions]   = useState<Session[]>([])
  const [loading,    setLoading]    = useState(false)
  const [expanded,   setExpanded]   = useState<Record<string, boolean>>({})
  const [popup,      setPopup]      = useState<PopupData | null>(null)
  const [showAddChild, setShowAddChild] = useState(false)
  const [showAddRouter, setShowAddRouter] = useState(false)
  const [highlightId, setHighlightId] = useState<string|null>(null)  // just-added child → flash + scroll
  const [toast, setToast] = useState<string|null>(null)
  // IA v2 — People block: page-level action strip. Pending count feeds the Enrollment badge.
  const [pendingCount, setPendingCount] = useState<number>(0)
  const [showPacket, setShowPacket] = useState(false)   // Add Child → packet Link + QR panel

  useEffect(() => {
    if (!centerId) return
    let cancelled = false
    supabase.schema('menumaker').from('enrollment_submissions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending').eq('center_id', centerId).neq('submission_type', 'staff')
      .then(({ count }) => { if (!cancelled) setPendingCount(count ?? 0) })
    return () => { cancelled = true }
  }, [centerId])
  const [childSettingsId, setChildSettingsId] = useState<string|null>(null)
  const [settingsTab, setSettingsTab] = useState(0)
  const [focusField, setFocusField] = useState<string|null>(null)
  const [emergencyChild, setEmergencyChild] = useState<{ id: string; name: string }|null>(null)
  const [reactivateTarget, setReactivateTarget] = useState<Child|null>(null)
  const [viewMode, setViewMode] = useState<'cards'|'list'>('cards')
  const [listClassFilter, setListClassFilter] = useState('all')
  const [search, setSearch] = useState('')          // raw input (immediate)
  const [debSearch, setDebSearch] = useState('')     // debounced (~200ms) — drives filtering
  useEffect(() => {
    const t = setTimeout(() => setDebSearch(search), 200)
    return () => clearTimeout(t)
  }, [search])
  const searchActive = debSearch.trim().length > 0
  const [listCols, setListCols] = useState({
    classroom: true, birthday: true, age: false,
    frp: true, milk: true, date_in: false
  })
  const toggleCol = (k: string) => setListCols(p => ({ ...p, [k]: !(p as any)[k] }))

  // Fetch the center roster. soft=true → refetch in place (no loading flash, keep
  // expanded rooms) so mutations (add/edit/transfer) update the list without a full
  // page reload (which would reset OrgContext → bounce to the org overview).
  const loadRoster = async (soft = false) => {
    if (!centerId) return
    if (!soft) { setLoading(true); setExpanded({}) }
    // Load the WHOLE roster (active + inactive) in one pass so name search can span
    // both — the normal grouped/list view filters down to active children client-side
    // (isActiveOn), while inactive rows surface, dimmed, only inside search results.
    const [{ data: cls }, { data: kids }, { data: staffData }, { data: sess }] = await Promise.all([
      supabase.schema('menumaker').from('classrooms')
        .select('id,name,sort_order,capacity_internal,is_roster').eq('center_id', centerId).eq('is_active', true).order('sort_order'),
      supabase.schema('menumaker').from('roster')
        .select('id,first_name,last_name,child_name,age_group_food,frp,date_in,date_out,birthday,milk_kind,classroom_id,is_active')
        .eq('center_id', centerId)
        .order('last_name', { nullsFirst: false }).order('first_name'),
      supabase.schema('menumaker').from('staff')
        .select('id,first_name,last_name,position,class_primary,class_secondary,phone,email,photo_url')
        .eq('center_id', centerId).eq('is_active', true),
      supabase.schema('menumaker').from('safepass_sessions')
        .select('id,child_id,child_name,action_type,status,teacher_confirmed_at,classroom_id')
        .eq('center_id', centerId).eq('status', 'confirmed')
        .gte('created_at', startOfTodayISO()),
    ])
    // Non-roster pseudo-classes (e.g. Staff, is_roster=false) are excluded from
    // the child roster: their class rows drop out of the summary/TOTAL/Fill%, and
    // their records (roster is fetched by center_id, so filter by classroom_id)
    // drop out of listed/active counts. Records themselves are left untouched.
    const allCls = (cls ?? []) as Classroom[]
    const staffClassIds = new Set(allCls.filter(c => c.is_roster === false).map(c => c.id))
    setClassrooms(allCls.filter(c => c.is_roster !== false))
    setAllChildren(((kids ?? []) as Child[]).filter(k => !staffClassIds.has(k.classroom_id ?? '')))
    setStaff((staffData ?? []) as StaffRow[])
    setSessions((sess ?? []) as Session[])
    if (!soft) setLoading(false)
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadRoster() }, [centerId])

  const attendMap = useMemo<Record<string, AttendState>>(() => {
    const sorted = [...sessions].sort(
      (a, b) => +new Date(a.teacher_confirmed_at!) - +new Date(b.teacher_confirmed_at!)
    )
    const m: Record<string, AttendState> = {}
    for (const s of sorted) {
      const key = s.child_name.toLowerCase()
      if (s.action_type === 'drop_off') m[key] = { state: 'present', time: hhmm(s.teacher_confirmed_at) }
      else if (s.action_type === 'pick_up') m[key] = { state: 'released', time: hhmm(s.teacher_confirmed_at) }
    }
    return m
  }, [sessions])

  // Active children (shown normally); inactive rows surface only inside search results.
  const activeChildren = useMemo(
    () => allChildren.filter(c => isActiveOn(c, todayStr)),
    [allChildren],
  )
  const isChildActive = (c: Child) => isActiveOn(c, todayStr)
  // Base set the view renders: search spans active + inactive, otherwise active only.
  const displayChildren = searchActive ? allChildren : activeChildren

  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()
  const presentTotal = Object.values(attendMap).filter(a => a.state === 'present').length
  const listedTotal  = activeChildren.length
  // Center totals for the TOTAL row: sum of per-class capacity + overall fill%.
  const totalCapacity = classrooms.reduce(
    (s, r) => s + (r.capacity_internal && r.capacity_internal > 0 ? r.capacity_internal : 0), 0,
  )
  const overallFill = fillPct(listedTotal, totalCapacity)
  // Search matches across ALL classes of the center (class filter is ignored while searching).
  const searchMatches = (c: Child) => childMatchesSearch(c, debSearch)
  const listedShown = searchActive ? displayChildren.filter(searchMatches).length : listedTotal

  const toggleRoom = (id: string) => setExpanded(p => ({ ...p, [id]: !p[id] }))

  return (
    <div style={{ padding: '24px 32px', fontFamily: "'DM Sans', sans-serif", background: '#f4f6f4', minHeight: '100vh' }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Serif+Display&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 26, color: '#0a3320', marginBottom: 2 }}>
          {center?.name ?? 'Center'} — Children
        </div>
        <div style={{ fontSize: 12, color: '#888', display: 'flex', gap: 16 }}>
          <span>{todayStr}</span>
          <span>·</span>
          <span style={{ color: '#0f4c35', fontWeight: 600 }}>{presentTotal} present</span>
          <span>·</span>
          <span>{listedShown} listed{searchActive ? ` (of ${listedTotal})` : ''}</span>
        </div>
      </div>

      {/* IA v2 — page-level action strip: the sidebar names WHO, actions live here. */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        <button onClick={() => setShowPacket(true)} title="Open the enrollment packet link + QR for a family to fill on-site or on their phone"
          style={{ padding: '9px 16px', borderRadius: 9, background: '#0f4c35', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}>
          ➕ Add Child
        </button>
        <button onClick={() => navigate('/enrollment-inbox?from=children')}
          style={{ padding: '9px 15px', borderRadius: 9, background: '#f0f7f4', color: '#1a5c3f', border: '1px solid #d1fae5', cursor: 'pointer', fontWeight: 600, fontSize: 13, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 8 }}>
          📥 Enrollment
          {pendingCount > 0 && (
            <span style={{ minWidth: 19, height: 19, padding: '0 6px', borderRadius: 20, background: '#c62a1f', color: '#fff', fontSize: 11, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{pendingCount}</span>
          )}
        </button>
        <button onClick={() => navigate('/children/import')}
          style={{ padding: '9px 15px', borderRadius: 9, background: '#f0f7f4', color: '#1a5c3f', border: '1px solid #d1fae5', cursor: 'pointer', fontWeight: 600, fontSize: 13, fontFamily: 'inherit' }}>
          ⇪ Import
        </button>
      </div>

      {loading ? (
        <div style={{ color: '#aaa', fontSize: 13 }}>Loading…</div>
      ) : (
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e0e8e0', overflow: 'hidden' }}>
          {/* Table header — columns must match SUMMARY_COLS (class · capacity ·
              fill% · listed · today · teachers). Numeric columns centered. */}
          <div style={{
            display: 'grid', gridTemplateColumns: SUMMARY_COLS,
            padding: '8px 20px', background: '#f0f4f1', borderBottom: '1px solid #e0e8e0',
          }}>
            {['CLASSROOM', 'CAPACITY', 'FILL %', 'LISTED', 'TODAY', 'TEACHERS'].map((h, i) => (
              <div key={h} style={{
                fontSize: 10, fontWeight: 700, color: '#0f4c35',
                textTransform: 'uppercase', letterSpacing: '0.05em',
                textAlign: i >= 1 && i <= 4 ? 'center' : 'left',
              }}>{h}</div>
            ))}
          </div>

          {/* Toolbar — view toggle and search sit together on the left (fix #3:
              search flush against the Cards/List toggle, not pushed to the far right). */}
          <div style={{ display:'flex', justifyContent:'flex-start', alignItems:'center', gap:12, padding:'8px 20px', borderBottom:'1px solid #f0f4f1' }}>
            {/* View mode */}
            <div style={{ display:'flex', gap:6, alignItems:'center' }}>
              <button onClick={() => setViewMode('cards')} style={{ padding:'6px 14px', borderRadius:8, border:'1.5px solid #c0d8c0', background: viewMode==='cards' ? '#0f4c35' : '#fff', color: viewMode==='cards' ? '#fff' : '#555', cursor:'pointer', fontFamily:'inherit', fontSize:13, fontWeight:600 }}>⊞ Cards</button>
              <button onClick={() => setViewMode('list')} style={{ padding:'6px 14px', borderRadius:8, border:'1.5px solid #c0d8c0', background: viewMode==='list' ? '#0f4c35' : '#fff', color: viewMode==='list' ? '#fff' : '#555', cursor:'pointer', fontFamily:'inherit', fontSize:13, fontWeight:600 }}>☰ List</button>
            </div>
            {/* Search — sits right next to the toggle. Always spans active &
                inactive; inactive matches show dimmed with an Inactive badge. */}
            <div style={{ display:'flex', gap:10, alignItems:'center', flexShrink:0 }}>
              <div style={{ position:'relative', width:280, maxWidth:'40vw' }}>
                <span style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', fontSize:13, color:'#8fae9c', pointerEvents:'none' }}>🔍</span>
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Escape') { setSearch(''); setDebSearch('') } }}
                  placeholder="Search active & inactive children…"
                  aria-label="Search active and inactive children by name"
                  style={{ width:'100%', padding:'7px 28px 7px 30px', borderRadius:8, border:`1.5px solid ${searchActive ? '#0f4c35' : '#c0d8c0'}`, fontSize:13, fontFamily:'inherit', color:'#0f4c35', outline:'none', boxSizing:'border-box' }}
                />
                {search && (
                  <button onClick={() => { setSearch(''); setDebSearch('') }} aria-label="Clear search"
                    style={{ position:'absolute', right:6, top:'50%', transform:'translateY(-50%)', border:'none', background:'transparent', cursor:'pointer', fontSize:14, color:'#999', lineHeight:1, padding:2 }}>✕</button>
                )}
              </div>
            </div>
          </div>
          {viewMode === 'list' && (() => {
            const COLS = [
              { key:'classroom', label:'Classroom' },
              { key:'birthday',  label:'Birthday' },
              { key:'age',       label:'Age' },
              { key:'frp',       label:'FRP' },
              { key:'milk',      label:'Milk' },
              { key:'date_in',   label:'Date In' },
            ]
            const filtered = [...displayChildren]
              // while searching, ignore the class filter (search all classes of the center)
              .filter(c => searchActive || listClassFilter === 'all' || c.classroom_id === listClassFilter)
              .filter(c => childMatchesSearch(c, debSearch))
              // while searching, active children sort above inactive; then by name.
              .sort((a,b) =>
                (searchActive ? (Number(isChildActive(b)) - Number(isChildActive(a))) : 0)
                || (a.last_name??'').localeCompare(b.last_name??''))

            function exportCSV() {
              const headers = ['#','Last Name','First Name',...COLS.filter(c=>(listCols as any)[c.key]).map(c=>c.label)]
              const rows = filtered.map((child,i) => {
                const room = classrooms.find(c=>c.id===child.classroom_id)
                const ageMs = child.birthday ? Date.now()-new Date(child.birthday).getTime() : 0
                const ageY = Math.floor(ageMs/(1000*60*60*24*365.25))
                const frpLabel = child.frp?.trim().toUpperCase().slice(0,1)
                const vals: string[] = [String(i+1), child.last_name??'', child.first_name??'']
                if(listCols.classroom) vals.push(room?.name??'')
                if(listCols.birthday) vals.push(child.birthday ? new Date(child.birthday).toLocaleDateString('en-US') : '')
                if(listCols.age) vals.push(child.birthday ? `${ageY}y` : '')
                if(listCols.frp) vals.push(frpLabel==='F'?'Free':frpLabel==='R'?'Reduced':frpLabel==='P'?'Paid':'')
                if(listCols.milk) vals.push(child.milk_kind??'')
                if(listCols.date_in) vals.push(child.date_in ? new Date((child as any).date_in).toLocaleDateString('en-US') : '')
                return vals.map(v => /[,"]/.test(v) ? `"${v}"` : v).join(',')
              })
              const csv = [headers.join(','), ...rows].join('\r\n')
              const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv'}))
              const cls = classrooms.find(c=>c.id===listClassFilter)
              a.download = `${center?.name??'center'}_${cls?.name??'all'}_roster.csv`; a.click()
            }

            return (
              <div>
                {/* Smart toolbar */}
                <div style={{ padding:'10px 16px', background:'#f8faf8', borderBottom:'1px solid #e8f0e8', display:'flex', flexWrap:'wrap', gap:10, alignItems:'center' }}>
                  {/* Class filter — dimmed & ignored while searching (search spans all classes) */}
                  <select value={listClassFilter} onChange={e=>setListClassFilter(e.target.value)}
                    disabled={searchActive} title={searchActive ? 'Ignored while searching — search covers all classes' : undefined}
                    style={{ padding:'6px 12px', borderRadius:8, border:'1.5px solid #c0d8c0', fontSize:13, fontFamily:'inherit', background:'#fff', color:'#0f4c35', fontWeight:600, opacity: searchActive ? 0.45 : 1, pointerEvents: searchActive ? 'none' : 'auto' }}>
                    <option value="all">All Classes ({activeChildren.length})</option>
                    {classrooms.filter(c=>!c.name.toLowerCase().includes('staff')).map(c => (
                      <option key={c.id} value={c.id}>{c.name} ({activeChildren.filter(ch=>ch.classroom_id===c.id).length})</option>
                    ))}
                  </select>
                  {/* Column toggles */}
                  <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                    {COLS.map(col => (
                      <button key={col.key} onClick={()=>toggleCol(col.key)}
                        style={{ padding:'4px 10px', borderRadius:6, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit',
                          border:`1.5px solid ${(listCols as any)[col.key] ? '#0f4c35' : '#d0d0d0'}`,
                          background:(listCols as any)[col.key] ? '#0f4c35' : '#fff',
                          color:(listCols as any)[col.key] ? '#fff' : '#888' }}>
                        {(listCols as any)[col.key] ? '✓' : '+'} {col.label}
                      </button>
                    ))}
                  </div>
                  {/* Actions */}
                  <div style={{ marginLeft:'auto', display:'flex', gap:8 }}>
                    <button onClick={exportCSV}
                      style={{ padding:'6px 14px', borderRadius:8, border:'1.5px solid #c0d8c0', background:'#fff', cursor:'pointer', fontSize:12, fontWeight:600, fontFamily:'inherit', color:'#0f4c35' }}>
                      💾 CSV
                    </button>
                    <button onClick={()=>window.print()}
                      style={{ padding:'6px 14px', borderRadius:8, border:'1.5px solid #c0d8c0', background:'#fff', cursor:'pointer', fontSize:12, fontWeight:600, fontFamily:'inherit', color:'#0f4c35' }}>
                      🖨️ Print
                    </button>
                  </div>
                </div>
                {/* Table */}
                <div style={{ overflowX:'auto' }}>
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                    <thead>
                      <tr style={{ background:'#f0f4f1' }}>
                        <th style={{ padding:'8px 12px', textAlign:'left', fontWeight:700, fontSize:11, color:'#0f4c35', textTransform:'uppercase', whiteSpace:'nowrap' }}>#</th>
                        <th style={{ padding:'8px 12px', textAlign:'left', fontWeight:700, fontSize:11, color:'#0f4c35', textTransform:'uppercase', whiteSpace:'nowrap' }}>Last Name</th>
                        <th style={{ padding:'8px 12px', textAlign:'left', fontWeight:700, fontSize:11, color:'#0f4c35', textTransform:'uppercase', whiteSpace:'nowrap' }}>First Name</th>
                        {COLS.filter(c=>(listCols as any)[c.key]).map(col => (
                          <th key={col.key} style={{ padding:'8px 12px', textAlign:'left', fontWeight:700, fontSize:11, color:'#0f4c35', textTransform:'uppercase', whiteSpace:'nowrap' }}>{col.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((child, idx) => {
                        const room = classrooms.find(c => c.id === child.classroom_id)
                        const frpLabel = child.frp?.trim().toUpperCase().slice(0,1)
                        const frpColor = frpLabel==='F' ? '#16a34a' : frpLabel==='R' ? '#d97706' : '#6b7280'
                        const frpBg = frpLabel==='F'?'#dcfce7':frpLabel==='R'?'#fef3c7':frpLabel==='P'?'#f3f4f6':'#fff'
                        const ageMs = child.birthday ? Date.now() - new Date(child.birthday).getTime() : 0
                        const ageY = Math.floor(ageMs / (1000*60*60*24*365.25))
                        const rowActive = isChildActive(child)
                        const rowSimilar = searchActive && childSearchKind(child, debSearch) === 'similar'
                        return (
                          <tr key={child.id} onClick={() => { setFocusField(null); setChildSettingsId(child.id) }}
                            style={{ borderBottom:'1px solid #f0f4f1', cursor:'pointer', background: idx%2===0 ? '#fff' : '#fafbfa', opacity: rowActive ? 1 : 0.55 }}
                            onMouseEnter={e => (e.currentTarget.style.background='#f0f7f2')}
                            onMouseLeave={e => (e.currentTarget.style.background=idx%2===0?'#fff':'#fafbfa')}>
                            <td style={{ padding:'7px 12px', color:'#aaa', fontSize:12 }}>{idx+1}</td>
                            <td style={{ padding:'7px 12px', fontWeight:600, color:'#1a2e1a' }}>
                              {child.last_name ?? '—'}
                              {!rowActive && <span style={{ marginLeft:6, fontSize:9, fontWeight:700, color:'#6b7280', background:'#f3f4f6', padding:'1px 6px', borderRadius:5, textTransform:'uppercase', letterSpacing:'0.04em' }}>inactive</span>}
                              {rowSimilar && <span style={{ marginLeft:6, fontSize:9, fontWeight:700, color:'#92400e', background:'#fef3c7', padding:'1px 6px', borderRadius:5, letterSpacing:'0.02em' }}>similar</span>}
                            </td>
                            <td style={{ padding:'7px 12px', color:'#1a2e1a' }}>{child.first_name ?? '—'}</td>
                            {listCols.classroom && <td style={{ padding:'7px 12px', color:'#555' }}>{room?.name ?? '—'}</td>}
                            {listCols.birthday && <td style={{ padding:'7px 12px', color:'#555', whiteSpace:'nowrap' }}>{child.birthday ? new Date(child.birthday).toLocaleDateString('en-US') : '—'}</td>}
                            {listCols.age && <td style={{ padding:'7px 12px', color:'#555', textAlign:'center' }}>{child.birthday ? `${ageY}y` : '—'}</td>}
                            {listCols.frp && <td style={{ padding:'7px 12px', textAlign:'center' }}><span style={{ fontWeight:700, color:frpColor, background:frpBg, padding:'2px 8px', borderRadius:6, fontSize:12 }}>{frpLabel==='F'?'Free':frpLabel==='R'?'Reduced':frpLabel==='P'?'Paid':'—'}</span></td>}
                            {listCols.milk && <td style={{ padding:'7px 12px', color:'#555' }}>{child.milk_kind ?? '—'}</td>}
                            {listCols.date_in && <td style={{ padding:'7px 12px', color:'#555', whiteSpace:'nowrap' }}>{(child as any).date_in ? new Date((child as any).date_in).toLocaleDateString('en-US') : '—'}</td>}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <div style={{ padding:'8px 16px', fontSize:12, color:'#888', borderTop:'1px solid #f0f4f1' }}>
                  {filtered.length} children · {filtered.filter(c=>c.frp==='F').length} Free · {filtered.filter(c=>c.frp==='R').length} Reduced · {filtered.filter(c=>c.frp==='P').length} Paid
                </div>
              </div>
            )
          })()}
          {classrooms.map((room, ri) => {
            const roomChildren = displayChildren
              .filter(c => c.classroom_id === room.id)
              .filter(searchMatches)               // while searching, keep only matches
            // while searching, hide rooms with no matches and auto-open the ones that have them
            if (searchActive && roomChildren.length === 0) return null
            const roomStaff    = staff.filter(s =>
              s.class_primary === room.id || norm(s.class_primary ?? '') === norm(room.name)
            )
            const presentHere = roomChildren.filter(c =>
              attendMap[fullName(c).toLowerCase()]?.state === 'present'
            ).length
            const isOpen = searchActive ? true : expanded[room.id]

            return (
              <div key={room.id}>
                {/* Classroom row */}
                <div
                  onClick={() => toggleRoom(room.id)}
                  style={{
                    display: 'grid', gridTemplateColumns: SUMMARY_COLS, alignItems: 'center',
                    padding: '10px 20px', cursor: 'pointer',
                    background: ri % 2 === 0 ? '#fff' : '#fafbfa',
                    borderBottom: isOpen ? 'none' : '1px solid #f0f4f1',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#f0f7f2')}
                  onMouseLeave={e => (e.currentTarget.style.background = ri % 2 === 0 ? '#fff' : '#fafbfa')}
                >
                  {(() => {
                    const cap  = room.capacity_internal
                    const pct  = fillPct(roomChildren.length, cap)
                    const fs   = fillStyle(pct)
                    return (
                      <>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 14, color: '#1a2e1a' }}>
                          <span style={{
                            fontSize: 10, color: '#0f4c35',
                            transform: isOpen ? 'rotate(90deg)' : 'rotate(0)',
                            display: 'inline-block', transition: 'transform 0.2s',
                          }}>▶</span>
                          {room.name}
                        </div>
                        {/* Capacity */}
                        <div style={{ textAlign: 'center', fontSize: 14, fontWeight: 500, color: cap && cap > 0 ? '#1a2e1a' : '#c4c4c4' }}>
                          {cap && cap > 0 ? cap : '—'}
                        </div>
                        {/* Fill % */}
                        <div style={{ textAlign: 'center' }}>
                          <span style={{
                            display: 'inline-block', minWidth: 42, padding: '2px 6px', borderRadius: 6,
                            fontSize: 12, fontWeight: 700, background: fs.bg, color: fs.fg,
                          }}>
                            {pct === null ? '—' : `${pct}%`}
                          </span>
                        </div>
                        {/* Listed */}
                        <div style={{ textAlign: 'center', fontSize: 14, fontWeight: 600, color: '#1a2e1a' }}>
                          {roomChildren.length}
                        </div>
                        {/* Today */}
                        <div style={{ textAlign: 'center', fontSize: 14, fontWeight: presentHere > 0 ? 600 : 400, color: presentHere > 0 ? '#0f4c35' : '#bbb' }}>
                          {presentHere > 0 ? presentHere : '—'}
                        </div>
                        {/* Teachers */}
                        <div style={{ fontSize: 12, color: '#555', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {roomStaff.map(s => s.first_name).filter(Boolean).join(', ') || '—'}
                        </div>
                      </>
                    )
                  })()}
                </div>

                {/* Expanded panel */}
                {isOpen && (
                  <div style={{ background: '#f8fbf8', borderBottom: '1px solid #e8f0e8', padding: '16px 20px' }}>

                    {/* Teachers */}
                    {roomStaff.length > 0 && (
                      <div style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#0f4c35', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
                          Teachers
                        </div>
                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                          {roomStaff.map(s => (
                            <div key={s.id} onClick={() => setPopup({ kind: 'staff', staff: s })}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 10,
                                padding: '8px 14px', borderRadius: 10, cursor: 'pointer',
                                border: '1px solid #e0e8e0', background: '#fff',
                              }}
                              onMouseEnter={e => (e.currentTarget.style.background = '#eef4ee')}
                              onMouseLeave={e => (e.currentTarget.style.background = '#fff')}
                            >
                              <div style={{ position: 'relative', flexShrink: 0 }}>
                                <Avatar name={staffName(s)} size={36} photo={s.photo_url} />
                                <div style={{
                                  position: 'absolute', bottom: 0, right: 0,
                                  width: 11, height: 11, borderRadius: '50%',
                                  border: '2px solid #f8fbf8', background: '#d1d5db',
                                }} />
                              </div>
                              <div>
                                <div style={{ fontSize: 13, fontWeight: 600, color: '#1a2e1a' }}>{staffName(s)}</div>
                                <div style={{ fontSize: 10, color: '#888' }}>{s.position ?? 'Teacher'}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Children */}
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#0f4c35', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
                        Children ({roomChildren.length})
                      </div>
                      {roomChildren.length === 0 ? (
                        <div style={{ color: '#bbb', fontSize: 13 }}>No children on roster.</div>
                      ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8 }}>
                          {roomChildren.map(child => {
                            const name = fullName(child)
                            const at   = attendMap[name.toLowerCase()]
                            const isPresent  = at?.state === 'present'
                            const isReleased = at?.state === 'released'
                            const frpKey = (child.frp ?? '').trim().toUpperCase().slice(0,1)
                            const isNew = child.id === highlightId
                            const childActive = isChildActive(child)
                            return (
                              <div key={child.id}
                                ref={el => { if (el && isNew) el.scrollIntoView({ behavior:'smooth', block:'center' }) }}
                                style={{
                                  borderRadius: 10,
                                  border: `1.5px solid ${isNew ? '#0f4c35' : !childActive ? '#e0d0d0' : isPresent ? '#bbf7d0' : isReleased ? '#fde68a' : '#e8e8e8'}`,
                                  background: isNew ? '#eafff2' : !childActive ? '#faf7f7' : isPresent ? '#f0fff4' : isReleased ? '#fffbeb' : '#fff',
                                  boxShadow: isNew ? '0 0 0 3px rgba(15,76,53,0.18)' : 'none',
                                  opacity: childActive || isNew ? 1 : 0.62,
                                  transition: 'box-shadow 0.3s, background 0.3s',
                                  overflow: 'hidden',
                                }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px' }}>
                                  <div style={{ position: 'relative', flexShrink: 0 }}>
                                    <Avatar name={name} size={36} />
                                    <div style={{
                                      position: 'absolute', bottom: 0, right: 0,
                                      width: 11, height: 11, borderRadius: '50%',
                                      border: '2px solid #fff',
                                      background: isPresent ? '#22c55e' : isReleased ? '#f59e0b' : '#d1d5db',
                                    }} />
                                  </div>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 12, fontWeight: 600, color: '#1a2e1a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display:'flex', alignItems:'center', gap:5 }}>
                                      <span style={{ overflow:'hidden', textOverflow:'ellipsis' }}>{name}</span>
                                      {!childActive && <span style={{ flexShrink:0, fontSize:8, fontWeight:700, color:'#6b7280', background:'#f3f4f6', padding:'1px 5px', borderRadius:4, textTransform:'uppercase', letterSpacing:'0.04em' }}>inactive</span>}
                                      {searchActive && childSearchKind(child, debSearch) === 'similar' && <span style={{ flexShrink:0, fontSize:8, fontWeight:700, color:'#92400e', background:'#fef3c7', padding:'1px 5px', borderRadius:4, letterSpacing:'0.02em' }}>similar</span>}
                                    </div>
                                    <div style={{ fontSize: 10, color: '#888', marginTop: 1 }}>
                                      {frpKey && (
                                        <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: FRP_BG[frpKey] ?? '#f4f4f5', color: FRP_COLOR[frpKey] ?? '#666', marginRight: 4 }}>{frpKey}</span>
                                      )}
                                      {isPresent  && <span style={{ color: '#16a34a', fontWeight: 600 }}>in {at?.time}</span>}
                                      {isReleased && <span style={{ color: '#b45309', fontWeight: 600 }}>out {at?.time}</span>}
                                      {!at        && <span style={{ color: '#bbb' }}>not arrived</span>}
                                    </div>
                                  </div>
                                </div>
                                <div style={{ display:'flex', borderTop:'1px solid #f0f0f0' }}>
                                  {searchActive ? (
                                    // Search results carry the deliberate status action: active → Deactivate,
                                    // inactive → Reactivate. (Normal cards stay Emergency + Settings only.)
                                    childActive ? (
                                      <button onClick={e=>{e.stopPropagation();setSettingsTab(0);setFocusField('date_out');setChildSettingsId(child.id)}} title="Set end date / deactivate" style={{ flex:1, padding:'6px 0', border:'none', borderRight:'1px solid #f0f0f0', background:'transparent', cursor:'pointer', fontSize:11, fontWeight:600, color:'#b45309', fontFamily:'inherit' }}>
                                        ⏻ Deactivate
                                      </button>
                                    ) : (
                                      <button onClick={e=>{e.stopPropagation();setReactivateTarget(child)}} title="Reactivate with a new start date" style={{ flex:1, padding:'6px 0', border:'none', borderRight:'1px solid #f0f0f0', background:'transparent', cursor:'pointer', fontSize:11, fontWeight:700, color:'#16a34a', fontFamily:'inherit' }}>
                                        ↩ Reactivate
                                      </button>
                                    )
                                  ) : (
                                    <button onClick={e=>{e.stopPropagation();setEmergencyChild({id:child.id,name:child.child_name || 'Child'})}} style={{ flex:1, padding:'6px 0', border:'none', borderRight:'1px solid #f0f0f0', background:'transparent', cursor:'pointer', fontSize:11, fontWeight:600, color:'#b91c1c', fontFamily:'inherit' }}>
                                      🚨 Emergency
                                    </button>
                                  )}
                                  <button onClick={e=>{e.stopPropagation();setSettingsTab(0);setFocusField(null);setChildSettingsId(child.id)}} style={{ flex:1, padding:'6px 0', border:'none', background:'transparent', cursor:'pointer', fontSize:11, fontWeight:600, color:'#0f4c35', fontFamily:'inherit' }}>
                                    ⚙️ Settings
                                  </button>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}

          {/* Total footer — same columns as SUMMARY_COLS. */}
          <div style={{
            display: 'grid', gridTemplateColumns: SUMMARY_COLS, alignItems: 'center',
            padding: '10px 20px', background: '#e8f0e8', borderTop: '1px solid #d0dcd0',
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#0f4c35', textTransform: 'uppercase' }}>Total</div>
            <div style={{ textAlign: 'center', fontSize: 14, fontWeight: 700, color: totalCapacity > 0 ? '#0f4c35' : '#c4c4c4' }}>
              {totalCapacity > 0 ? totalCapacity : '—'}
            </div>
            <div style={{ textAlign: 'center' }}>
              {(() => {
                const fs = fillStyle(overallFill)
                return (
                  <span style={{
                    display: 'inline-block', minWidth: 42, padding: '2px 6px', borderRadius: 6,
                    fontSize: 12, fontWeight: 700, background: fs.bg, color: fs.fg,
                  }}>
                    {overallFill === null ? '—' : `${overallFill}%`}
                  </span>
                )
              })()}
            </div>
            <div style={{ textAlign: 'center', fontSize: 14, fontWeight: 700, color: '#0f4c35' }}>{listedTotal}</div>
            <div style={{ textAlign: 'center', fontSize: 14, fontWeight: 700, color: '#0f4c35' }}>{presentTotal || '—'}</div>
            <div />
          </div>
        </div>
      )}

      {popup && <DetailPopup data={popup} onClose={() => setPopup(null)} classrooms={classrooms} onChanged={() => loadRoster(true)} />}
      {childSettingsId && (
        <ChildSettingsPage
          childId={childSettingsId}
          classrooms={classrooms}
          initialTab={settingsTab}
          focusField={focusField ?? undefined}
          onClose={() => { setChildSettingsId(null); setFocusField(null); loadRoster(true) }}
        />
      )}
      {emergencyChild && (
        <EmergencyPopup
          childId={emergencyChild.id}
          childName={emergencyChild.name}
          onClose={() => setEmergencyChild(null)}
          onAddContact={() => { const id = emergencyChild.id; setEmergencyChild(null); setSettingsTab(1); setFocusField(null); setChildSettingsId(id) }}
        />
      )}
      {reactivateTarget && (
        <ReactivateModal
          child={reactivateTarget}
          onClose={() => setReactivateTarget(null)}
          onDone={() => { setReactivateTarget(null); loadRoster(true) }}
        />
      )}
      {showAddRouter && currentCenter && (
        <AddChildRouterModal
          centerId={currentCenter.id}
          orgId={org?.id ?? ''}
          classrooms={classrooms}
          reviewerId={user?.id ?? ''}
          reviewerName={(user?.user_metadata?.full_name as string) || user?.email?.split('@')[0] || 'Director'}
          isOrgAdmin={isOrgAdmin}
          onClose={() => setShowAddRouter(false)}
          onReactivated={() => { setShowAddRouter(false); loadRoster(true) }}
          onNewEnrollment={() => { setShowAddRouter(false); navigate('/enrollment-inbox') }}
          onScan={() => { setShowAddRouter(false); navigate('/enrollment-inbox') }}
          onRawInsert={() => { setShowAddRouter(false); setShowAddChild(true) }}
        />
      )}
      {showPacket && center && (
        <AddChildPacketPanel center={{ id: center.id, name: center.name, slug: center.slug }} onClose={() => setShowPacket(false)} />
      )}
      {showAddChild && currentCenter && isOrgAdmin && (
        <AddChildModal
          centerId={currentCenter.id}
          orgId={org?.id ?? ''}
          classrooms={classrooms}
          onDone={(newChild) => {
            setShowAddChild(false)
            loadRoster(true)                       // refetch in place — stay on this center roster
            const roomId = newChild.classroom_id ?? ''
            setExpanded(prev => ({ ...prev, [roomId]: true }))   // Cards: open the child's room
            setHighlightId(newChild.id)                          // flash + scroll the new card
            setTimeout(() => setHighlightId(id => id === newChild.id ? null : id), 4000)
            // If the new child won't show under the current search/filter, confirm with a toast.
            const room = classrooms.find(c => c.id === newChild.classroom_id)
            const outBySearch = searchActive && !childMatchesSearch(newChild, debSearch)
            const outByList = viewMode === 'list' && !searchActive && listClassFilter !== 'all' && listClassFilter !== newChild.classroom_id
            if (outBySearch || outByList) {
              setToast(`Added to ${room?.name ?? 'classroom'}`)
              setTimeout(() => setToast(null), 3500)
            }
          }}
          onClose={() => setShowAddChild(false)}
        />
      )}
      {toast && (
        <div style={{ position:'fixed', bottom:24, left:'50%', transform:'translateX(-50%)', zIndex:3000,
          background:'#0f4c35', color:'#fff', padding:'10px 18px', borderRadius:10, fontSize:13, fontWeight:600,
          boxShadow:'0 8px 28px rgba(0,0,0,0.22)', fontFamily:"'DM Sans',sans-serif" }}>
          ✓ {toast}
        </div>
      )}
    </div>
  )
}

// ─── Edit Child Panel ─────────────────────────────────────────────────────────

function EditChildPanel({ child, classrooms, onDone }: {
  child: Child; classrooms: Classroom[]; onDone: () => void
}) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({
    first_name: child.first_name ?? '',
    last_name: child.last_name ?? '',
    birthday: child.birthday ?? '',
    classroom_id: child.classroom_id ?? '',
    date_in: (child as any).date_in ?? '',
    frp: (child as any).frp ?? '',
    milk_kind: child.milk_kind ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }))

  async function save() {
    setSaving(true); setError('')
    try {
      const { error: err } = await supabase.schema('menumaker').from('roster').update({
        first_name: form.first_name,
        last_name: form.last_name,
        child_name: `${form.last_name} ${form.first_name}`,
        birthday: form.birthday || null,
        classroom_id: form.classroom_id || null,
        date_in: form.date_in || null,
        frp: form.frp || null,
        milk_kind: form.milk_kind || null,
      }).eq('id', child.id)
      if (err) throw err
      onDone()
    } catch (e: any) {
      setError(e.message)
    } finally { setSaving(false) }
  }

  const inp: React.CSSProperties = {
    width: '100%', padding: '9px 12px', borderRadius: 8,
    border: '1.5px solid #c0d8c0', fontSize: 14, fontFamily: 'inherit',
    background: '#fff', boxSizing: 'border-box' as const, outline: 'none'
  }
  const lbl: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, color: '#6b7280',
    textTransform: 'uppercase' as const, letterSpacing: '0.06em',
    display: 'block', marginBottom: 4
  }

  if (!open) return (
    <button onClick={() => setOpen(true)} style={{
      width: '100%', padding: '10px 14px', borderRadius: 10, marginTop: 8,
      background: '#fff', border: '1.5px solid #c0d8c0',
      color: '#0f4c35', fontWeight: 700, fontSize: 13,
      cursor: 'pointer', fontFamily: 'inherit',
    }}>
      ✏️ Edit Child Data
    </button>
  )

  return (
    <div style={{ background: '#f9fafb', border: '1.5px solid #c0d8c0', borderRadius: 10, padding: 14, marginTop: 8 }}>
      <div style={{ fontWeight: 700, fontSize: 13, color: '#0f4c35', marginBottom: 12 }}>✏️ Edit Child Data</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
        <div>
          <label style={lbl}>First Name</label>
          <input style={inp} value={form.first_name} onChange={e => set('first_name', e.target.value)}/>
        </div>
        <div>
          <label style={lbl}>Last Name</label>
          <input style={inp} value={form.last_name} onChange={e => set('last_name', e.target.value)}/>
        </div>
      </div>
      <div style={{ marginBottom: 10 }}>
        <label style={lbl}>Birthday</label>
        <input type="date" style={inp} value={form.birthday} onChange={e => set('birthday', e.target.value)}/>
      </div>
      <div style={{ marginBottom: 10 }}>
        <label style={lbl}>Classroom</label>
        <select style={inp} value={form.classroom_id} onChange={e => set('classroom_id', e.target.value)}>
          <option value="">— no change —</option>
          {classrooms.filter(c => !c.name.toLowerCase().includes('staff')).map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
        <div>
          <label style={lbl}>Date In</label>
          <input type="date" style={inp} value={form.date_in} onChange={e => set('date_in', e.target.value)}/>
        </div>
        <div>
          <label style={lbl}>FRP</label>
          <select style={inp} value={form.frp} onChange={e => set('frp', e.target.value)}>
            <option value="">—</option>
            <option value="F">Free</option>
            <option value="R">Reduced</option>
            <option value="P">Paid</option>
          </select>
        </div>
        <div>
          <label style={lbl}>Milk</label>
          <select style={inp} value={form.milk_kind} onChange={e => set('milk_kind', e.target.value)}>
            <option value="">—</option>
            <option value="whole">Whole</option>
            <option value="1pct">1%</option>
            <option value="red">Reduced</option>
            <option value="formula">Formula</option>
          </select>
        </div>
      </div>
      {error && <div style={{ color: '#dc2626', fontSize: 12, marginBottom: 8 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => setOpen(false)}
          style={{ flex: 1, padding: '9px', borderRadius: 8, border: '1.5px solid #c0d8c0', background: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 }}>
          Cancel
        </button>
        <button onClick={save} disabled={saving}
          style={{ flex: 2, padding: '9px', borderRadius: 8, background: '#0f4c35', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13, fontFamily: 'inherit', opacity: saving ? 0.6 : 1 }}>
          {saving ? 'Saving…' : '✓ Save Changes'}
        </button>
      </div>
    </div>
  )
}

// ─── Add Child Modal ──────────────────────────────────────────────────────────

function AddChildModal({ centerId, orgId, classrooms, onDone, onClose }: {
  centerId: string; orgId: string; classrooms: Classroom[]; onDone: (child: Child) => void; onClose: () => void
}) {
  const [form, setForm] = useState({
    first_name: '', last_name: '', birthday: '', classroom_id: '',
    date_in: new Date().toISOString().slice(0,10), frp: 'F'
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }))

  async function save() {
    if (!form.first_name || !form.last_name || !form.birthday || !form.classroom_id) {
      setError('Please fill in all required fields'); return
    }
    setSaving(true); setError('')
    try {
      const child_name = `${form.last_name} ${form.first_name}`
      const { data, error: err } = await supabase.schema('menumaker').from('roster').insert({
        org_id: orgId, center_id: centerId,
        classroom_id: form.classroom_id,
        first_name: form.first_name, last_name: form.last_name,
        child_name, birthday: form.birthday,
        date_in: form.date_in, frp: form.frp,
        is_active: true,
      })
      .select('id,first_name,last_name,child_name,age_group_food,frp,date_in,date_out,birthday,milk_kind,classroom_id')
      .single()
      if (err) throw err
      onDone(data as Child)
    } catch (e: any) {
      setError(e.message)
    } finally { setSaving(false) }
  }

  const inp: React.CSSProperties = {
    width: '100%', padding: '10px 12px', borderRadius: 8,
    border: '1.5px solid #c0d8c0', fontSize: 14, fontFamily: 'inherit',
    background: '#fff', boxSizing: 'border-box' as const, outline: 'none'
  }
  const lbl: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, color: '#6b7280',
    textTransform: 'uppercase' as const, letterSpacing: '0.06em',
    display: 'block', marginBottom: 4
  }

  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:2000, padding:20 }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:'#fff', borderRadius:16, width:'100%', maxWidth:420, boxShadow:'0 20px 60px rgba(0,0,0,0.2)', fontFamily:"'DM Sans',sans-serif", overflow:'hidden' }}>
        <div style={{ background:'#0f4c35', padding:'20px 24px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ color:'#fff', fontWeight:700, fontSize:17 }}>➕ Add Child</div>
          <button onClick={onClose} style={{ background:'rgba(255,255,255,0.15)', border:'none', color:'#fff', width:30, height:30, borderRadius:'50%', cursor:'pointer', fontSize:18 }}>×</button>
        </div>
        <div style={{ padding:24, display:'flex', flexDirection:'column', gap:14 }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div>
              <label style={lbl}>First Name *</label>
              <input style={inp} placeholder="First" value={form.first_name} onChange={e=>set('first_name',e.target.value)}/>
            </div>
            <div>
              <label style={lbl}>Last Name *</label>
              <input style={inp} placeholder="Last" value={form.last_name} onChange={e=>set('last_name',e.target.value)}/>
            </div>
          </div>
          <div>
            <label style={lbl}>Birthday *</label>
            <input type="date" style={inp} value={form.birthday} onChange={e=>set('birthday',e.target.value)}/>
          </div>
          <div>
            <label style={lbl}>Classroom *</label>
            <select style={inp} value={form.classroom_id} onChange={e=>set('classroom_id',e.target.value)}>
              <option value="">Select classroom...</option>
              {classrooms.filter(c=>!c.name.toLowerCase().includes('staff')).map(c=>(
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={lbl}>Date In</label>
            <input type="date" style={inp} value={form.date_in} onChange={e=>set('date_in',e.target.value)}/>
          </div>
          <div>
            <label style={lbl}>Meal Status (FRP)</label>
            <select style={inp} value={form.frp} onChange={e=>set('frp',e.target.value)}>
              <option value="F">Free</option>
              <option value="R">Reduced</option>
              <option value="P">Paid</option>
            </select>
          </div>
          {error && <div style={{ color:'#dc2626', fontSize:13 }}>{error}</div>}
          <div style={{ display:'flex', gap:10, marginTop:4 }}>
            <button onClick={onClose} style={{ flex:1, padding:'11px', borderRadius:9, border:'1.5px solid #c0d8c0', background:'#fff', cursor:'pointer', fontFamily:'inherit', fontSize:14 }}>Cancel</button>
            <button onClick={save} disabled={saving} style={{ flex:2, padding:'11px', borderRadius:9, background:'#0f4c35', color:'#fff', border:'none', cursor:'pointer', fontWeight:700, fontSize:14, fontFamily:'inherit', opacity:saving?0.6:1 }}>
              {saving ? 'Saving…' : '✓ Add Child'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Reactivate Modal ─────────────────────────────────────────────────────────
// Restores a deactivated / departed child on a NEW start date. Rule (Nikolay):
// the new start must fall AFTER the recorded end date; on confirm we clear date_out,
// set is_active=true and date_in=new start — same roster row, no duplicate.

function ReactivateModal({ child, onClose, onDone }: {
  child: Child; onClose: () => void; onDone: () => void
}) {
  const endDate = child.date_out ? child.date_out.slice(0, 10) : ''
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const name = displayChildName(child)
  const tooEarly = !!endDate && startDate <= endDate

  async function confirm() {
    setError('')
    if (!startDate) { setError('Pick a start date'); return }
    if (tooEarly) { setError(`Start date must be after the end date (${fmtDate(endDate)}).`); return }
    setSaving(true)
    try {
      const { error: err } = await supabase.schema('menumaker').from('roster')
        .update({ is_active: true, date_out: null, date_in: startDate, deactivated_at: null, deactivation_reason: null })
        .eq('id', child.id)
      if (err) throw err
      onDone()
    } catch (e: any) { setError(e.message); setSaving(false) }
  }

  const inp: React.CSSProperties = {
    width: '100%', padding: '10px 12px', borderRadius: 8,
    border: '1.5px solid #c0d8c0', fontSize: 14, fontFamily: 'inherit',
    background: '#fff', boxSizing: 'border-box', outline: 'none',
  }
  const lbl: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, color: '#6b7280',
    textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4,
  }

  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:2000, padding:20 }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:'#fff', borderRadius:16, width:'100%', maxWidth:400, boxShadow:'0 20px 60px rgba(0,0,0,0.2)', fontFamily:"'DM Sans',sans-serif", overflow:'hidden' }}>
        <div style={{ background:'#0f4c35', padding:'20px 24px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ color:'#fff', fontWeight:700, fontSize:17 }}>↩ Reactivate {name}</div>
          <button onClick={onClose} style={{ background:'rgba(255,255,255,0.15)', border:'none', color:'#fff', width:30, height:30, borderRadius:'50%', cursor:'pointer', fontSize:18 }}>×</button>
        </div>
        <div style={{ padding:24, display:'flex', flexDirection:'column', gap:14 }}>
          <div style={{ fontSize:13, color:'#555', lineHeight:1.5 }}>
            This child left{endDate ? <> on <strong>{fmtDate(endDate)}</strong></> : ''}. Pick the
            new <strong>start date</strong> — it becomes their Date In and clears the end date so
            they count again.
          </div>
          <div>
            <label style={lbl}>New start date *</label>
            <input type="date" style={{ ...inp, border:`1.5px solid ${tooEarly ? '#dc2626' : '#c0d8c0'}` }}
              value={startDate} min={endDate || undefined}
              onChange={e=>setStartDate(e.target.value)} />
            {tooEarly && <div style={{ color:'#dc2626', fontSize:12, marginTop:6 }}>Must be after the end date ({fmtDate(endDate)}).</div>}
          </div>
          {error && <div style={{ color:'#dc2626', fontSize:13 }}>{error}</div>}
          <div style={{ display:'flex', gap:10, marginTop:4 }}>
            <button onClick={onClose} style={{ flex:1, padding:'11px', borderRadius:9, border:'1.5px solid #c0d8c0', background:'#fff', cursor:'pointer', fontFamily:'inherit', fontSize:14 }}>Cancel</button>
            <button onClick={confirm} disabled={saving || tooEarly} style={{ flex:2, padding:'11px', borderRadius:9, background:'#16a34a', color:'#fff', border:'none', cursor: (saving||tooEarly)?'not-allowed':'pointer', fontWeight:700, fontSize:14, fontFamily:'inherit', opacity:(saving||tooEarly)?0.6:1 }}>
              {saving ? 'Reactivating…' : '↩ Reactivate'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Transfer Child Panel ──────────────────────────────────────────────────

function TransferChildPanel({ child, classrooms, onDone }: {
  child: Child
  classrooms: Classroom[]
  onDone: () => void
}) {
  const [open, setOpen] = useState(false)
  const [targetClassId, setTargetClassId] = useState('')
  const [transferDate, setTransferDate] = useState(new Date().toISOString().slice(0, 10))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const otherClassrooms = classrooms.filter(c => c.id !== child.classroom_id)

  async function doTransfer() {
    if (!targetClassId) { setError('Select a classroom'); return }
    setSaving(true)
    setError('')
    try {
      const { error: err } = await supabase.schema('menumaker')
        .from('roster')
        .update({ classroom_id: targetClassId, date_in: transferDate })
        .eq('id', child.id)
      if (err) throw err
      onDone()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  if (!open) return (
    <button onClick={() => setOpen(true)} style={{
      width: '100%', padding: '10px 14px', borderRadius: 10,
      background: '#f0f7f4', border: '1.5px solid #0f4c35',
      color: '#0f4c35', fontWeight: 700, fontSize: 13,
      cursor: 'pointer', fontFamily: 'inherit', marginTop: 4,
    }}>
      🔄 Transfer to Another Class
    </button>
  )

  return (
    <div style={{ background: '#f0f7f4', border: '1.5px solid #0f4c35', borderRadius: 10, padding: 14, marginTop: 4 }}>
      <div style={{ fontWeight: 700, fontSize: 13, color: '#0f4c35', marginBottom: 10 }}>🔄 Transfer Child</div>
      <div style={{ marginBottom: 10 }}>
        <label style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>New Classroom</label>
        <select value={targetClassId} onChange={e => setTargetClassId(e.target.value)}
          style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #c0d8c0', fontSize: 14, fontFamily: 'inherit', background: '#fff' }}>
          <option value="">Select classroom...</option>
          {otherClassrooms.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Transfer Date</label>
        <input type="date" value={transferDate} onChange={e => setTransferDate(e.target.value)}
          style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #c0d8c0', fontSize: 14, fontFamily: 'inherit', background: '#fff' }}/>
      </div>
      {error && <div style={{ color: '#dc2626', fontSize: 12, marginBottom: 8 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => setOpen(false)}
          style={{ flex: 1, padding: '9px', borderRadius: 8, border: '1.5px solid #c0d8c0', background: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 }}>
          Cancel
        </button>
        <button onClick={doTransfer} disabled={saving || !targetClassId}
          style={{ flex: 2, padding: '9px', borderRadius: 8, background: '#0f4c35', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13, fontFamily: 'inherit', opacity: saving ? 0.6 : 1 }}>
          {saving ? 'Transferring…' : '✓ Confirm Transfer'}
        </button>
      </div>
    </div>
  )
}
