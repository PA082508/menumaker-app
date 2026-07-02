// ============================================================
// ChildrenPage.tsx — route /children
// Org view: 3 fixed columns Ridge | Alpha | Pearl
// Each column: table Classroom | Listed | Today | Teachers
// Click row → expand children list below that row
// Center selected → full-width view for that center
// ============================================================

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useOrg } from '@/contexts/OrgContext'
import { displayChildName } from '@/lib/childName'
import { useAuth } from '@/hooks/useAuth'
import CenterRosterPage from './CenterRosterPage'

// Center IDs
const CENTER_ORDER = [
  { id: '4aed7d5a-00d0-4a4c-ac99-311046ad2027', name: 'Ridge' },
  { id: '099c404b-e6d3-4543-9d9a-1fb11a2ee62d', name: 'Alpha' },
  { id: '881ef4ce-1a27-4d3b-aa60-59d2a307bf2b', name: 'Pearl' },
]

type Classroom = { id: string; name: string; sort_order: number; center_id: string }
type StaffRow  = { id: string; first_name: string | null; last_name: string | null; class_primary: string | null; center_id: string }
type Child = {
  id: string
  first_name: string | null
  last_name: string | null
  child_name: string | null
  age_group_food: string | null
  frp: string | null
  date_in: string | null
  date_out: string | null
  birthday: string | null
  classroom_id: string | null
}

const AGE_LABEL: Record<string, string> = {
  infant_0_5m: '0-5m', infant_6_11m: '6-11m',
  '1y': '1yr', '2y': '2yr', '3_5': '3-5y', '6_12': '6-12y',
}

const fmtDate = (d: string | null) => {
  if (!d) return '—'
  const [y, m, day] = String(d).slice(0, 10).split('-')
  return m && day ? `${Number(m)}/${Number(day)}/${y}` : String(d)
}
const fullName = (c: Child) => displayChildName(c)

// today string yyyy-mm-dd
const todayStr = new Date().toISOString().slice(0, 10)

// monday of current week
function mondayOf(d: Date) {
  const day = d.getDay()
  const diff = (day === 0 ? -6 : 1 - day)
  const m = new Date(d)
  m.setDate(d.getDate() + diff)
  return m.toISOString().slice(0, 10)
}
const monStr = mondayOf(new Date())

// day column: mon tue wed thu fri
function todayDayCol(): string | null {
  const d = new Date().getDay()
  return ['mon','tue','wed','thu','fri'][d - 1] ?? null
}
const todayCol = todayDayCol()

const FRP_STYLE: Record<string, { bg: string; color: string; border: string }> = {
  F: { bg: '#f0fff4', color: '#0f4c35', border: '#bbf7d0' },
  R: { bg: '#fffbeb', color: '#92400e', border: '#fde68a' },
  P: { bg: '#f4f4f5', color: '#6b7280', border: '#e0e0e0' },
}

export default function ChildrenPage() {
  const { currentCenter, orgRole, isOrgAdmin } = useOrg()
  const { roles } = useAuth()
  const navigate = useNavigate()
  const allowed = isOrgAdmin || (roles as string[]).some(r => ['admin','director','office_manager'].includes(r)) || ['admin','director','office_manager'].includes(orgRole ?? '')

  const [classrooms, setClassrooms]   = useState<Classroom[]>([])
  const [staff, setStaff]             = useState<StaffRow[]>([])
  const [children, setChildren]       = useState<Child[]>([])
  const [todayCounts, setTodayCounts] = useState<Record<string, number>>({})
  const [capacities, setCapacities]   = useState<Record<string, number>>({})
  const [expanded, setExpanded]       = useState<Record<string, boolean>>({})
  const [loading, setLoading]         = useState(false)
  const ORG_ID = '3a9a290e-7e49-491e-946b-ad86f2399910'

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    ;(async () => {
      const centerIds = CENTER_ORDER.map(c => c.id)

      // classrooms for all 3 centers
      const { data: cls } = await supabase.schema('menumaker').from('classrooms')
        .select('id,name,sort_order,center_id')
        .in('center_id', centerIds).eq('is_active', true).order('sort_order')

      // roster — active + date range
      const { data: kids } = await supabase.schema('menumaker').from('roster')
        .select('id,first_name,last_name,child_name,age_group_food,frp,date_in,date_out,birthday,classroom_id')
        .in('center_id', centerIds).eq('is_active', true)
        .or(`date_out.is.null,date_out.gte.${todayStr}`)
        .order('last_name', { nullsFirst: false }).order('first_name')

      // staff for all centers
      const { data: staffData } = await supabase.schema('menumaker').from('staff')
        .select('id,first_name,last_name,class_primary,center_id')
        .in('center_id', centerIds).eq('is_active', true)

      // today meal count
      let todayMap: Record<string, number> = {}
      if (todayCol) {
        try {
          const { data: mwr } = await supabase.schema('menumaker').from('meal_week_records')
            .select('*').eq('monday_date', monStr)
          if (mwr) {
            for (const row of mwr as Record<string, unknown>[]) {
              const cid = row['classroom_id'] as string | null
              if (!cid) continue
              const cols = [`${todayCol}_b`,`${todayCol}_as`,`${todayCol}_l`,`${todayCol}_ps`,`${todayCol}_su`,`${todayCol}_es`]
              const hasAny = cols.some(c => row[c] === true || row[c] === 1)
              if (hasAny) todayMap[cid] = (todayMap[cid] ?? 0) + 1
            }
          }
        } catch (_) {}
      }

      // capacities
      const { data: cenData } = await supabase.schema('menumaker').from('centers')
        .select('id,license_capacity').in('id', centerIds)
      const capMap: Record<string, number> = {}
      for (const c of cenData ?? []) capMap[c.id] = Number(c.license_capacity) || 0

      if (cancelled) return
      setClassrooms((cls ?? []) as Classroom[])
      setChildren((kids ?? []) as Child[])
      setStaff((staffData ?? []) as StaffRow[])
      setTodayCounts(todayMap)
      setCapacities(capMap)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [])

  const toggleExpand = (key: string) =>
    setExpanded(prev => ({ ...prev, [key]: !prev[key] }))

  if (!allowed) return (
    <div style={{ padding: 40, fontFamily: "'DM Sans', sans-serif", color: '#888' }}>
      This page is available to admins, directors, and office managers only.
    </div>
  )

  // When a specific center is selected → show roster inline
  if (currentCenter) return <CenterRosterPage centerId={currentCenter.id} />

  // Org view only from here

  // Org view: always show all 3 centers
  const visibleCenters = CENTER_ORDER

  return (
    <div style={{ padding: '24px 32px', fontFamily: "'DM Sans', sans-serif", background: '#f4f6f4', minHeight: '100vh' }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Serif+Display&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 26, color: '#0a3320', marginBottom: 2 }}>Children</div>
        <div style={{ fontSize: 12, color: '#888' }}>
          All centers · roster · {todayStr}
        </div>
      </div>

      {loading ? (
        <div style={{ color: '#aaa', fontSize: 13 }}>Loading…</div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: currentCenter ? '1fr' : 'repeat(3, 1fr)',
          gap: 16,
          alignItems: 'start',
        }}>
          {visibleCenters.map(center => {
            const cls = classrooms
              .filter(c => c.center_id === center.id)
              .sort((a, b) => a.sort_order - b.sort_order)

            const centerChildren = children.filter(c => {
              const clsIds = cls.map(x => x.id)
              return clsIds.includes(c.classroom_id ?? '')
            })
            const totalListed = centerChildren.length
            const cap = capacities[center.id] ?? 0

            return (
              <div key={center.id} style={{
                background: '#fff',
                borderRadius: 14,
                border: '1px solid #e0e8e0',
                overflow: 'hidden',
              }}>
                {/* Center header */}
                <div style={{
                  background: '#0f4c35',
                  padding: '12px 16px',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                  <div>
                    <div style={{ color: '#fff', fontWeight: 700, fontSize: 14, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                      {center.name}
                    </div>
                    {cap > 0 && (
                      <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 11, marginTop: 2 }}>
                        capacity {cap}
                      </div>
                    )}
                  </div>
                </div>

                {/* Table header */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 44px 52px 1fr',
                  padding: '7px 14px',
                  background: '#f0f4f1',
                  borderBottom: '1px solid #e0e8e0',
                }}>
                  {['Classroom', 'Listed', 'Today', 'Teachers'].map((h, i) => (
                    <div key={h} style={{
                      fontSize: 10, fontWeight: 700, color: '#0f4c35',
                      textTransform: 'uppercase', letterSpacing: '0.05em',
                      textAlign: i === 1 || i === 2 ? 'center' : 'left',
                    }}>{h}</div>
                  ))}
                </div>

                {/* Classroom rows */}
                {cls.length === 0 ? (
                  <div style={{ padding: '20px 16px', color: '#aaa', fontSize: 12 }}>No classrooms</div>
                ) : cls.map((room, ri) => {
                  const listed = children.filter(c => c.classroom_id === room.id).length
                  const today  = todayCounts[room.id] ?? 0
                  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()
                  const teachers = staff.filter(s =>
                    s.center_id === center.id && (
                      s.class_primary === room.id ||
                      norm(s.class_primary ?? '') === norm(room.name)
                    )
                  )
                  const teacherNames = teachers
                    .map(s => s.first_name ?? '').filter(Boolean).join(', ') || '—'
                  const expandKey = `${center.id}__${room.id}`
                  const isOpen = expanded[expandKey]
                  const roomChildren = children.filter(c => c.classroom_id === room.id)

                  return (
                    <div key={room.id}>
                      {/* Row */}
                      <div
                        onClick={() => toggleExpand(expandKey)}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr 44px 52px 1fr',
                          padding: '9px 14px',
                          borderBottom: isOpen ? 'none' : '1px solid #f0f4f1',
                          background: ri % 2 === 0 ? '#fff' : '#fafbfa',
                          cursor: 'pointer',
                          transition: 'background 0.15s',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#f0f7f2')}
                        onMouseLeave={e => (e.currentTarget.style.background = ri % 2 === 0 ? '#fff' : '#fafbfa')}
                      >
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#1a2e1a', display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{
                            display: 'inline-block', width: 14, height: 14,
                            fontSize: 9, color: '#0f4c35', transition: 'transform 0.2s',
                            transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                            flexShrink: 0,
                          }}>▶</span>
                          {room.name}
                        </div>
                        <div style={{ fontSize: 13, color: '#23332a', textAlign: 'center', fontWeight: 600 }}>{listed}</div>
                        <div style={{ fontSize: 13, color: today > 0 ? '#0f4c35' : '#bbb', textAlign: 'center', fontWeight: today > 0 ? 600 : 400 }}>{today > 0 ? today : '—'}</div>
                        <div style={{ fontSize: 12, color: '#555', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{teacherNames}</div>
                      </div>

                      {/* Expanded children */}
                      {isOpen && (
                        <div style={{
                          borderTop: '1px solid #e8f0e8',
                          borderBottom: '1px solid #f0f4f1',
                          background: '#f8fbf8',
                        }}>
                          {roomChildren.length === 0 ? (
                            <div style={{ padding: '10px 28px', fontSize: 12, color: '#aaa' }}>No children</div>
                          ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                              <thead>
                                <tr style={{ background: '#eef4ee' }}>
                                  {['Name', 'Age', 'F/R/P', 'Date In'].map(h => (
                                    <th key={h} style={{
                                      fontSize: 9, fontWeight: 700, color: '#0f4c35', textTransform: 'uppercase',
                                      letterSpacing: '0.05em', padding: '6px 10px', textAlign: 'left',
                                    }}>{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {roomChildren.map((c, i) => {
                                  const frpKey = (c.frp ?? '').trim().toUpperCase().slice(0, 1)
                                  const frp = FRP_STYLE[frpKey]
                                  return (
                                    <tr key={c.id} style={{ background: i % 2 === 0 ? '#f8fbf8' : '#f2f7f2' }}>
                                      <td style={{ padding: '6px 10px', fontSize: 12, color: '#1a2e1a', fontWeight: 500 }}>{fullName(c)}</td>
                                      <td style={{ padding: '6px 10px', fontSize: 11, color: '#555' }}>{AGE_LABEL[c.age_group_food ?? ''] ?? c.age_group_food ?? '—'}</td>
                                      <td style={{ padding: '6px 10px' }}>
                                        {frp ? (
                                          <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: frp.bg, color: frp.color, border: `1px solid ${frp.border}` }}>
                                            {frpKey}
                                          </span>
                                        ) : <span style={{ color: '#ccc', fontSize: 11 }}>—</span>}
                                      </td>
                                      <td style={{ padding: '6px 10px', fontSize: 11, color: '#888' }}>{fmtDate(c.date_in)}</td>
                                    </tr>
                                  )
                                })}
                              </tbody>
                            </table>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}

                {/* Footer total */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 44px 52px 1fr',
                  padding: '9px 14px',
                  background: '#e8f0e8',
                  borderTop: '1px solid #d0dcd0',
                }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#0f4c35', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0f4c35', textAlign: 'center' }}>{totalListed}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0f4c35', textAlign: 'center' }}>
                    {Object.entries(todayCounts)
                      .filter(([cid]) => cls.some(r => r.id === cid))
                      .reduce((sum, [, v]) => sum + v, 0) || '—'}
                  </div>
                  <div style={{ fontSize: 11, color: '#0f4c35' }}>
                    {cap > 0 ? `${totalListed}/${cap} licensed` : ''}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
