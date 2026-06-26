// ============================================================
// CenterRosterPage.tsx  — route /center/:centerId
// Per-center attendance board: classrooms → children + teachers
// Children presence from safepass_sessions (today, confirmed)
// Teachers: photo placeholder + stub for future Teacher SafePass
// Click name → detail popup
// ============================================================

import { useEffect, useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useOrg } from '@/contexts/OrgContext'
import { useAuth } from '@/hooks/useAuth'

// ── types ────────────────────────────────────────────────────
type Classroom = { id: string; name: string; sort_order: number }
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
  milk_kind: string | null
  classroom_id: string | null
  photo_url?: string | null
}
type StaffRow = {
  id: string
  first_name: string | null
  last_name: string | null
  position: string | null
  class_primary: string | null
  class_secondary: string | null
  phone?: string | null
  email?: string | null
  photo_url?: string | null
}
type Session = {
  id: string
  child_id: string | null
  child_name: string
  action_type: 'drop_off' | 'pick_up' | 'transfer'
  status: string
  teacher_confirmed_at: string | null
  classroom_id: string
}
type AttendState = { state: 'present' | 'released'; time: string }

// ── helpers ──────────────────────────────────────────────────
const todayStr  = new Date().toISOString().slice(0, 10)
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
const initials = (first: string | null, last: string | null, fallback?: string | null) => {
  if (first && last) return (first[0] + last[0]).toUpperCase()
  if (first) return first[0].toUpperCase()
  if (fallback) return fallback.slice(0,2).toUpperCase()
  return '?'
}
const avatarColor = (name: string) => {
  const colors = ['#0f4c35','#1a6b4a','#2d8f64','#4a7c6b','#5c4f7c','#7c4f4f','#4f6b7c']
  let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0xffff
  return colors[h % colors.length]
}
const fullName = (c: Child) =>
  [c.first_name, c.last_name].filter(Boolean).join(' ').trim() || c.child_name || '—'
const staffName = (s: StaffRow) =>
  [s.first_name, s.last_name].filter(Boolean).join(' ').trim() || '—'

// ── Avatar component ─────────────────────────────────────────
function Avatar({ name, size = 40, photo }: { name: string; size?: number; photo?: string | null }) {
  const [err, setErr] = useState(false)
  const bg = avatarColor(name)
  if (photo && !err) return (
    <img src={photo} alt={name} onError={() => setErr(true)}
      style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
  )
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff', fontWeight: 700, fontSize: size * 0.35, flexShrink: 0,
      fontFamily: "'DM Sans', sans-serif",
    }}>
      {initials(null, null, name)}
    </div>
  )
}

// ── Detail Popup ─────────────────────────────────────────────
type PopupData =
  | { kind: 'child'; child: Child; attend: AttendState | null }
  | { kind: 'staff'; staff: StaffRow }

function DetailPopup({ data, onClose }: { data: PopupData; onClose: () => void }) {
  const name = data.kind === 'child' ? fullName(data.child) : staffName(data.staff)
  const photo = data.kind === 'child' ? data.child.photo_url : data.staff.photo_url

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: 20,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: 18, width: '100%', maxWidth: 380,
        boxShadow: '0 20px 60px rgba(0,0,0,0.18)', overflow: 'hidden',
        fontFamily: "'DM Sans', sans-serif",
      }}>
        {/* Header */}
        <div style={{ background: '#0f4c35', padding: '24px 24px 20px', display: 'flex', gap: 16, alignItems: 'center' }}>
          <Avatar name={name} size={60} photo={photo} />
          <div style={{ flex: 1 }}>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 17 }}>{name}</div>
            {data.kind === 'child' && (
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 3 }}>
                {AGE_LABEL[data.child.age_group_food ?? ''] ?? data.child.age_group_food ?? ''}
                {data.child.frp ? ` · ${data.child.frp} status` : ''}
              </div>
            )}
            {data.kind === 'staff' && (
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 3 }}>
                {data.staff.position ?? 'Staff'}
              </div>
            )}
          </div>
          <button onClick={onClose} style={{
            background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff',
            width: 30, height: 30, borderRadius: '50%', cursor: 'pointer',
            fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>×</button>
        </div>

        {/* Body */}
        <div style={{ padding: 24 }}>
          {data.kind === 'child' && (() => {
            const c = data.child
            const at = data.attend
            const frpKey = (c.frp ?? '').trim().toUpperCase().slice(0, 1)
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* Attendance status */}
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
                      {at.state === 'present' ? `Arrived at ${at.time}` : `Left at ${at.time}`}
                    </div>}
                  </div>
                </div>

                {/* Fields */}
                {[
                  { label: 'Date of Birth', value: fmtDate(c.birthday) },
                  { label: 'Date Enrolled', value: fmtDate(c.date_in) },
                  { label: 'Date Out',       value: fmtDate(c.date_out) },
                  { label: 'Meal Status',    value: frpKey ? `${frpKey} · ${frpKey === 'F' ? 'Free' : frpKey === 'R' ? 'Reduced' : 'Paid'}` : '—' },
                  { label: 'Milk',           value: c.milk_kind ?? '—' },
                ].map(({ label, value }) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f0f0f0', paddingBottom: 8 }}>
                    <span style={{ fontSize: 12, color: '#888' }}>{label}</span>
                    <span style={{ fontSize: 13, color: '#1a2e1a', fontWeight: 500 }}>{value}</span>
                  </div>
                ))}
              </div>
            )
          })()}

          {data.kind === 'staff' && (() => {
            const s = data.staff
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* Attendance stub */}
                <div style={{
                  padding: '10px 14px', borderRadius: 10,
                  background: '#f4f6f4', border: '1px solid #e0e8e0',
                  display: 'flex', alignItems: 'center', gap: 10,
                }}>
                  <span style={{ fontSize: 20 }}>⏳</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: '#1a2e1a' }}>Timesheet — coming soon</div>
                    <div style={{ fontSize: 12, color: '#888' }}>Teacher SafePass in development</div>
                  </div>
                </div>

                {[
                  { label: 'Position',   value: s.position ?? '—' },
                  { label: 'Phone',      value: s.phone ?? '—' },
                  { label: 'Email',      value: s.email ?? '—' },
                  { label: 'Secondary classroom', value: s.class_secondary ?? '—' },
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

// ── Main Page ────────────────────────────────────────────────
export default function CenterRosterPage({ centerId: centerIdProp }: { centerId?: string } = {}) {
  const { centerId: centerIdParam } = useParams<{ centerId: string }>()
  const centerId = centerIdProp ?? centerIdParam
  const { centers } = useOrg()
  const { roles } = useAuth()
  const navigate = useNavigate()
  const allowed = true // accessible to all authenticated users with center access

  const center = centers.find(c => c.id === centerId)

  const [classrooms, setClassrooms] = useState<Classroom[]>([])
  const [children,   setChildren]   = useState<Child[]>([])
  const [staff,      setStaff]      = useState<StaffRow[]>([])
  const [sessions,   setSessions]   = useState<Session[]>([])
  const [loading,    setLoading]    = useState(false)
  const [popup,      setPopup]      = useState<PopupData | null>(null)

  useEffect(() => {
    if (!centerId) return
    let cancelled = false
    setLoading(true)
    ;(async () => {
      const [
        { data: cls },
        { data: kids },
        { data: staffData },
        { data: sess },
      ] = await Promise.all([
        supabase.schema('menumaker').from('classrooms')
          .select('id,name,sort_order')
          .eq('center_id', centerId).eq('is_active', true).order('sort_order'),

        supabase.schema('menumaker').from('roster')
          .select('id,first_name,last_name,child_name,age_group_food,frp,date_in,date_out,birthday,milk_kind,classroom_id')
          .eq('center_id', centerId).eq('is_active', true)
          .or(`date_out.is.null,date_out.gte.${todayStr}`)
          .order('last_name', { nullsFirst: false }).order('first_name'),

        supabase.schema('menumaker').from('staff')
          .select('id,first_name,last_name,position,class_primary,class_secondary,phone,email,photo_url')
          .eq('center_id', centerId).eq('is_active', true),

        supabase.schema('menumaker').from('safepass_sessions')
          .select('id,child_id,child_name,action_type,status,teacher_confirmed_at,classroom_id')
          .eq('center_id', centerId)
          .eq('status', 'confirmed')
          .gte('created_at', startOfTodayISO()),
      ])

      if (cancelled) return
      setClassrooms((cls ?? []) as Classroom[])
      setChildren((kids ?? []) as Child[])
      setStaff((staffData ?? []) as StaffRow[])
      setSessions((sess ?? []) as Session[])
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [centerId])

  // Build attendance map: child_name.lower → latest state
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

  if (!allowed) return (
    <div style={{ padding: 40, fontFamily: "'DM Sans', sans-serif", color: '#888' }}>
      Access restricted.
    </div>
  )

  const presentTotal   = Object.values(attendMap).filter(a => a.state === 'present').length
  const listedTotal    = children.length

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
          <span>{listedTotal} listed</span>
        </div>
      </div>

      {loading ? (
        <div style={{ color: '#aaa', fontSize: 13 }}>Loading…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {classrooms.map(room => {
            const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()
            const roomChildren = children.filter(c => c.classroom_id === room.id)
            const roomStaff    = staff.filter(s =>
              s.class_primary === room.id ||
              norm(s.class_primary ?? '') === norm(room.name)
            )
            const presentHere  = roomChildren.filter(c =>
              attendMap[fullName(c).toLowerCase()]?.state === 'present'
            ).length

            return (
              <div key={room.id} style={{
                background: '#fff', borderRadius: 14,
                border: '1px solid #e0e8e0', overflow: 'hidden',
              }}>
                {/* Classroom header */}
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px 20px', background: '#f0f4f1',
                  borderBottom: '1px solid #e0e8e0',
                }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: '#0a3320' }}>{room.name}</div>
                  <div style={{ fontSize: 12, color: '#555', display: 'flex', gap: 12 }}>
                    <span style={{ color: '#0f4c35', fontWeight: 600 }}>{presentHere} present</span>
                    <span>/ {roomChildren.length} listed</span>
                  </div>
                </div>

                <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>

                  {/* Teachers row */}
                  {roomStaff.length > 0 && (
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#0f4c35', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
                        Teachers
                      </div>
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        {roomStaff.map(s => (
                          <div
                            key={s.id}
                            onClick={() => setPopup({ kind: 'staff', staff: s })}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 10,
                              padding: '8px 14px', borderRadius: 10,
                              border: '1px solid #e0e8e0', background: '#f8faf8',
                              cursor: 'pointer', transition: 'background 0.15s',
                            }}
                            onMouseEnter={e => (e.currentTarget.style.background = '#eef4ee')}
                            onMouseLeave={e => (e.currentTarget.style.background = '#f8faf8')}
                          >
                            <Avatar name={staffName(s)} size={34} photo={s.photo_url} />
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 600, color: '#1a2e1a' }}>{staffName(s)}</div>
                              <div style={{ fontSize: 10, color: '#888' }}>{s.position ?? 'Teacher'}</div>
                            </div>
                            {/* Timesheet stub */}
                            <div style={{
                              marginLeft: 8, fontSize: 10, color: '#bbb',
                              padding: '2px 8px', borderRadius: 6, border: '1px solid #e8e8e8',
                            }}>
                              — : —
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Divider */}
                  {roomStaff.length > 0 && roomChildren.length > 0 && (
                    <div style={{ borderTop: '1px solid #f0f4f1' }} />
                  )}

                  {/* Children grid */}
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#0f4c35', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
                      Children
                    </div>
                    {roomChildren.length === 0 ? (
                      <div style={{ color: '#bbb', fontSize: 13 }}>No children on roster.</div>
                    ) : (
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                        gap: 8,
                      }}>
                        {roomChildren.map(child => {
                          const name = fullName(child)
                          const at   = attendMap[name.toLowerCase()]
                          const isPresent  = at?.state === 'present'
                          const isReleased = at?.state === 'released'
                          const frpKey = (child.frp ?? '').trim().toUpperCase().slice(0,1)

                          return (
                            <div
                              key={child.id}
                              onClick={() => setPopup({ kind: 'child', child, attend: at ?? null })}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 10,
                                padding: '8px 12px', borderRadius: 10, cursor: 'pointer',
                                border: `1.5px solid ${isPresent ? '#bbf7d0' : isReleased ? '#fde68a' : '#e8e8e8'}`,
                                background: isPresent ? '#f0fff4' : isReleased ? '#fffbeb' : '#fff',
                                transition: 'box-shadow 0.15s',
                              }}
                              onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)')}
                              onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
                            >
                              {/* Avatar with status dot */}
                              <div style={{ position: 'relative', flexShrink: 0 }}>
                                <Avatar name={name} size={36} photo={child.photo_url} />
                                <div style={{
                                  position: 'absolute', bottom: 0, right: 0,
                                  width: 10, height: 10, borderRadius: '50%',
                                  border: '2px solid #fff',
                                  background: isPresent ? '#22c55e' : isReleased ? '#f59e0b' : '#d1d5db',
                                }} />
                              </div>

                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{
                                  fontSize: 12, fontWeight: 600, color: '#1a2e1a',
                                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                }}>
                                  {name}
                                </div>
                                <div style={{ fontSize: 10, color: '#888', marginTop: 1, display: 'flex', gap: 4, alignItems: 'center' }}>
                                  {frpKey && (
                                    <span style={{
                                      fontSize: 9, fontWeight: 700, padding: '1px 5px',
                                      borderRadius: 4, background: FRP_BG[frpKey] ?? '#f4f4f5',
                                      color: FRP_COLOR[frpKey] ?? '#666',
                                    }}>{frpKey}</span>
                                  )}
                                  {isPresent  && <span style={{ color: '#16a34a', fontWeight: 600 }}>in {at?.time}</span>}
                                  {isReleased && <span style={{ color: '#b45309', fontWeight: 600 }}>out {at?.time}</span>}
                                  {!at        && <span style={{ color: '#bbb' }}>not arrived</span>}
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}

          {classrooms.length === 0 && (
            <div style={{ color: '#aaa', fontSize: 13 }}>No classrooms found for this center.</div>
          )}
        </div>
      )}

      {/* Popup */}
      {popup && <DetailPopup data={popup} onClose={() => setPopup(null)} />}
    </div>
  )
}
