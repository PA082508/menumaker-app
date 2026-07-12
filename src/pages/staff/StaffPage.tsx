import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useOrg } from '@/contexts/OrgContext'
import { useAuth } from '@/hooks/useAuth'

type Staff = {
  id: string
  first_name: string | null; last_name: string | null
  position: string | null; center_id: string | null
  class_primary: string | null; class_secondary: string | null
  hire_date: string | null; is_active: boolean | null
  phone: string | null; email: string | null
}

type FilterKey = 'all' | 'teachers' | 'directors' | 'cooks' | 'admin'
const FILTERS: { key: FilterKey; label: string; test?: RegExp }[] = [
  { key: 'all',       label: 'All' },
  { key: 'teachers',  label: 'Teachers',  test: /teacher/i },
  { key: 'directors', label: 'Directors', test: /director|administrator/i },
  { key: 'cooks',     label: 'Cooks',     test: /cook/i },
  { key: 'admin',     label: 'Admin',     test: /admin|manager|bookkeeper/i },
]

// Ridge first, then Alpha, then Pearl
const CENTER_ORDER = ['ridge', 'alpha', 'pearl']

const short    = (n?: string | null) => (n ?? '').replace(/^Play Academy\s+/i, '').trim()
const fmtDate  = (d: string | null) => { if (!d) return '—'; const [y,m,day] = d.slice(0,10).split('-'); return `${Number(m)}/${Number(day)}/${y}` }
const fullName = (s: Staff) => [s.first_name, s.last_name].filter(Boolean).join(' ').trim() || '—'
const initials = (s: Staff) => `${s.first_name?.[0] ?? ''}${s.last_name?.[0] ?? ''}`.toUpperCase() || '?'
const avatarColor = (name: string) => {
  const colors = ['#0f4c35','#1a6b4a','#2d8f64','#4a7c6b','#5c4f7c','#7c4f4f','#4f6b7c']
  let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0xffff
  return colors[h % colors.length]
}

const selStyle: React.CSSProperties = {
  appearance: 'none', WebkitAppearance: 'none',
  background: "#fff url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6'><path d='M1 1l4 4 4-4' fill='none' stroke='%230f4c35' stroke-width='1.5'/></svg>\") no-repeat right 12px center",
  border: '1.5px solid #0f4c35', borderRadius: 8, padding: '7px 30px 7px 12px',
  fontSize: 13, fontFamily: 'inherit', color: '#0f4c35', fontWeight: 600, cursor: 'pointer', outline: 'none',
}

export default function StaffPage() {
  const { org, currentCenter, centers, setCurrentCenter } = useOrg()
  const { roles } = useAuth()
  const navigate = useNavigate()
  const allowed = (roles as string[]).some(r => ['admin','director','office_manager'].includes(r))

  const [staff,   setStaff]   = useState<Staff[]>([])
  const [loading, setLoading] = useState(false)
  const [filter,  setFilter]  = useState<FilterKey>('all')
  const [search,  setSearch]  = useState('')
  const [popup,   setPopup]   = useState<Staff | null>(null)

  useEffect(() => {
    if (!org?.id) { setStaff([]); return }
    let cancelled = false
    setLoading(true)
    ;(async () => {
      let q = supabase.schema('menumaker').from('staff')
        .select('id,first_name,last_name,position,center_id,class_primary,class_secondary,hire_date,is_active,phone,email')
        .eq('org_id', org.id).eq('is_active', true)
      if (currentCenter?.id) q = q.eq('center_id', currentCenter.id)
      const { data } = await q.order('first_name').order('last_name')
      if (cancelled) return
      setStaff((data ?? []) as Staff[])
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [org?.id, currentCenter?.id])

  const centerName = (id: string | null) => short(centers.find(c => c.id === id)?.name) || '—'
  const countFor = (f: FilterKey) => f === 'all' ? staff.length : staff.filter(s => FILTERS.find(x => x.key === f)?.test?.test(s.position ?? '')).length

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    const test = FILTERS.find(f => f.key === filter)?.test
    return staff
      .filter(s => !test || test.test(s.position ?? ''))
      .filter(s => !q || fullName(s).toLowerCase().includes(q))
  }, [staff, filter, search])

  const renderCard = (s: Staff) => {
    const bg = avatarColor(fullName(s))
    return (
      <div key={s.id} style={{ background: '#fff', borderRadius: 10, border: '1px solid #e8e8e8', padding: '9px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0, background: bg, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>{initials(s)}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div onClick={() => setPopup(s)} style={{ fontSize: 13, fontWeight: 700, color: '#0a3320', cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{fullName(s)}</div>
            <div style={{ display: 'flex', gap: 5, marginTop: 4 }}>
              <button onClick={() => setPopup(s)} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 5, border: '1px solid #d0e8d8', background: '#f0f7f2', color: '#0f4c35', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>
                👤 Details
              </button>
              <button onClick={() => navigate(`/staff/${s.id}/settings`)} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 5, border: '1px solid #d0e8d8', background: '#f0f7f2', color: '#0f4c35', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>
                ⚙️ Settings
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!allowed) return (
    <div style={{ padding: 40, fontFamily: "'DM Sans', sans-serif", color: '#888' }}>
      This page is available to admins, directors, and office managers only.
    </div>
  )

  // Sort centers: Ridge → Alpha → Pearl
  const sortedCenters = [...centers]
    .filter(c => !c.name.toLowerCase().includes('kitchen'))
    .sort((a, b) => {
      const ai = CENTER_ORDER.findIndex(k => a.name.toLowerCase().includes(k))
      const bi = CENTER_ORDER.findIndex(k => b.name.toLowerCase().includes(k))
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
    })

  return (
    <div style={{ padding: '24px 32px', fontFamily: "'DM Sans', sans-serif", background: '#f4f6f4', minHeight: '100vh' }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Serif+Display&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
        <div>
          <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 26, color: '#0a3320', marginBottom: 2 }}>Staff</div>
          <div style={{ fontSize: 12, color: '#888' }}>{currentCenter ? short(currentCenter.name) : 'Organization'} · {staff.length} staff</div>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {FILTERS.map(f => {
          const active = filter === f.key
          return (
            <button key={f.key} onClick={() => setFilter(f.key)} style={{
              padding: '6px 14px', borderRadius: 100, cursor: 'pointer', fontFamily: 'inherit',
              border: `1.5px solid ${active ? '#0f4c35' : '#d0d5d0'}`,
              background: active ? '#0f4c35' : '#fff', color: active ? '#fff' : '#555',
              fontSize: 13, fontWeight: active ? 600 : 400, display: 'flex', alignItems: 'center', gap: 7,
            }}>
              {f.label}
              <span style={{ fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 100, background: active ? 'rgba(255,255,255,0.2)' : '#eef2ee', color: active ? '#fff' : '#0f4c35' }}>{countFor(f.key)}</span>
            </button>
          )
        })}
      </div>

      {/* Search */}
      <div style={{ marginBottom: 16 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name…"
          style={{ width: 260, maxWidth: '100%', padding: '7px 12px', borderRadius: 8, border: '1.5px solid #d0d5d0', fontSize: 13, fontFamily: 'inherit', outline: 'none', background: '#fff' }} />
        <span style={{ marginLeft: 10, fontSize: 12, color: '#aaa' }}>{visible.length} shown</span>
      </div>

      {loading ? (
        <div style={{ color: '#aaa', fontSize: 13 }}>Loading…</div>
      ) : visible.length === 0 ? (
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e8e8e8', padding: 40, textAlign: 'center', color: '#aaa', fontSize: 13 }}>
          No staff {search ? 'match your search' : 'found'}.
        </div>
      ) : currentCenter ? (
        // ── Single center view — grid ──
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
          {visible.map(s => renderCard(s))}
        </div>
      ) : (
        // ── Org view — Ridge → Alpha → Pearl blocks ──
        <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
          {sortedCenters.map(center => {
            const cs = visible.filter(s => s.center_id === center.id)
            if (cs.length === 0) return null
            return (
              <div key={center.id}>
                {/* Center header */}
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 14 }}>
                  <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 22, color: '#0a3320' }}>{short(center.name)}</div>
                  <div style={{ fontSize: 12, color: '#888' }}>{cs.length} staff</div>
                </div>
                {/* Staff grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
                  {cs.map(s => renderCard(s))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Detail popup */}
      {popup && (
        <div onClick={() => setPopup(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 18, width: '100%', maxWidth: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.18)', overflow: 'hidden', fontFamily: "'DM Sans', sans-serif" }}>
            <div style={{ background: '#0f4c35', padding: '20px 24px', display: 'flex', gap: 14, alignItems: 'center' }}>
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: avatarColor(fullName(popup)), color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700, flexShrink: 0 }}>{initials(popup)}</div>
              <div style={{ flex: 1 }}>
                <div style={{ color: '#fff', fontWeight: 700, fontSize: 17 }}>{fullName(popup)}</div>
                <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 2 }}>{popup.position ?? 'Staff'} · {centerName(popup.center_id)}</div>
              </div>
              <button onClick={() => setPopup(null)} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', width: 30, height: 30, borderRadius: '50%', cursor: 'pointer', fontSize: 18 }}>×</button>
            </div>
            <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { label: 'Position',  value: popup.position },
                { label: 'Classroom', value: [popup.class_primary, popup.class_secondary].filter(Boolean).join(' · ') || null },
                { label: 'Email',     value: popup.email,  href: popup.email  ? `mailto:${popup.email}`  : undefined },
                { label: 'Phone',     value: popup.phone,  href: popup.phone  ? `tel:${popup.phone}`     : undefined },
                { label: 'Hire Date', value: fmtDate(popup.hire_date) },
              ].map(({ label, value, href }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f0f0f0', paddingBottom: 8 }}>
                  <span style={{ fontSize: 12, color: '#888' }}>{label}</span>
                  {href
                    ? <a href={href} style={{ fontSize: 13, color: '#0f4c35', fontWeight: 500 }}>{value}</a>
                    : <span style={{ fontSize: 13, color: '#1a2e1a', fontWeight: 500 }}>{value || '—'}</span>
                  }
                </div>
              ))}
              <button onClick={() => { setPopup(null); navigate(`/staff/${popup.id}/settings`) }} style={{ marginTop: 8, padding: 10, borderRadius: 9, border: 'none', background: '#0f4c35', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                ⚙️ Open Full Settings
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Row({ icon, text, href }: { icon: string; text: string; href?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
      <span style={{ fontSize: 13 }}>{icon}</span>
      {href
        ? <a href={href} style={{ color: '#1e6b4a', textDecoration: 'none', wordBreak: 'break-word' }}>{text}</a>
        : <span style={{ wordBreak: 'break-word' }}>{text}</span>}
    </div>
  )
}
