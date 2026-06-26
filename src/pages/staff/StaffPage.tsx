// ============================================================
// StaffPage.tsx — route /staff
// Staff directory for the active center (or whole org in Organization view).
// Source: menumaker.staff. Gated to admin/director/office_manager.
//
// NOTE: the staff table has no phone/email columns, so those aren't shown;
// we surface position, center, class assignment, hire date and status instead.
// staff has RLS disabled, so we scope the query by org_id ourselves.
// ============================================================

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useOrg } from '@/contexts/OrgContext'
import { useAuth } from '@/hooks/useAuth'

type Staff = {
  id: string
  first_name: string | null
  last_name: string | null
  position: string | null
  center_id: string | null
  class_primary: string | null
  class_secondary: string | null
  hire_date: string | null
  is_active: boolean | null
  phone: string | null
  email: string | null
}

type FilterKey = 'all' | 'teachers' | 'directors' | 'cooks' | 'admin'
const FILTERS: { key: FilterKey; label: string; test?: RegExp }[] = [
  { key: 'all', label: 'All' },
  { key: 'teachers', label: 'Teachers', test: /teacher/i },
  { key: 'directors', label: 'Directors', test: /director/i },
  { key: 'cooks', label: 'Cooks', test: /cook/i },
  { key: 'admin', label: 'Admin', test: /admin/i },
]

const short = (n?: string | null) => (n ?? '').replace(/^Play Academy\s+/i, '').trim()
const fmtDate = (d: string | null) => {
  if (!d) return '—'
  const [y, m, day] = String(d).slice(0, 10).split('-')
  return m && day ? `${Number(m)}/${Number(day)}/${y}` : String(d)
}
const fullName = (s: Staff) => [s.first_name, s.last_name].filter(Boolean).join(' ').trim() || '—'
const initials = (s: Staff) =>
  `${(s.first_name?.[0] ?? '')}${(s.last_name?.[0] ?? '')}`.toUpperCase() || '👤'

// Center selector styled as a clear, clickable button with a ▾ arrow.
const selStyle: React.CSSProperties = {
  appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none',
  background: "#fff url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6'><path d='M1 1l4 4 4-4' fill='none' stroke='%230f4c35' stroke-width='1.5'/></svg>\") no-repeat right 12px center",
  border: '1.5px solid #0f4c35', borderRadius: 8, padding: '7px 30px 7px 12px',
  fontSize: 13, fontFamily: 'inherit', color: '#0f4c35', fontWeight: 600, cursor: 'pointer', outline: 'none',
}

export default function StaffPage() {
  const { org, currentCenter, centers, setCurrentCenter } = useOrg()
  const { roles } = useAuth()
  const navigate = useNavigate()
  const allowed = (roles as string[]).some(r => r === 'admin' || r === 'director' || r === 'office_manager')

  const [staff, setStaff] = useState<Staff[]>([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState<FilterKey>('all')
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!org?.id) { setStaff([]); return }
    let cancelled = false
    setLoading(true)
    ;(async () => {
      let q = supabase.schema('menumaker').from('staff')
        .select('id,first_name,last_name,position,center_id,class_primary,class_secondary,hire_date,is_active,phone,email')
        .eq('org_id', org.id)
      if (currentCenter?.id) q = q.eq('center_id', currentCenter.id)
      const { data } = await q.order('last_name', { nullsFirst: false }).order('first_name')
      if (cancelled) return
      setStaff((data ?? []) as Staff[])
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [org?.id, currentCenter?.id])

  const [popup, setPopup] = useState<Staff | null>(null)

  const centerName = (id: string | null) => short(centers.find(c => c.id === id)?.name) || '—'

  const countFor = (f: FilterKey) =>
    f === 'all' ? staff.length : staff.filter(s => FILTERS.find(x => x.key === f)?.test?.test(s.position ?? '')).length

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    const test = FILTERS.find(f => f.key === filter)?.test
    return staff
      .filter(s => !test || test.test(s.position ?? ''))
      .filter(s => !q || fullName(s).toLowerCase().includes(q))
      .sort((a, b) => (a.last_name ?? '').localeCompare(b.last_name ?? '') || (a.first_name ?? '').localeCompare(b.first_name ?? ''))
  }, [staff, filter, search])

  if (!allowed) {
    return (
      <div style={{ padding: 40, fontFamily: "'DM Sans', sans-serif", color: '#888' }}>
        This page is available to admins, directors, and office managers only.
      </div>
    )
  }

  return (
    <div style={{ padding: '24px 32px', fontFamily: "'DM Sans', sans-serif", background: '#f4f6f4', minHeight: '100vh' }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Serif+Display&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
        <div>
          <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 26, color: '#0a3320', marginBottom: 2 }}>Staff</div>
          <div style={{ fontSize: 12, color: '#888' }}>{currentCenter?.name ?? 'Organization'} · {staff.length} staff</div>
        </div>
        {centers.length > 1 && (
          <select
            value={currentCenter?.id ?? ''}
            onChange={e => { const v = e.target.value; setCurrentCenter(v ? (centers.find(c => c.id === v) ?? null) : null) }}
            style={selStyle}
          >
            <option value="">🏢 Organization (all centers)</option>
            {centers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {FILTERS.map(f => {
          const active = filter === f.key
          return (
            <button key={f.key} onClick={() => setFilter(f.key)} style={{
              padding: '7px 14px', borderRadius: 100, cursor: 'pointer', fontFamily: 'inherit',
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
      <div style={{ marginBottom: 14 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name…"
          style={{ width: 260, maxWidth: '100%', padding: '8px 12px', borderRadius: 8, border: '1.5px solid #d0d5d0', fontSize: 13, fontFamily: 'inherit', outline: 'none', background: '#fff' }} />
        <span style={{ marginLeft: 10, fontSize: 12, color: '#aaa' }}>{visible.length} shown</span>
      </div>

      {/* Cards */}
      {loading ? (
        <div style={{ color: '#aaa', fontSize: 13, padding: 20 }}>Loading…</div>
      ) : visible.length === 0 ? (
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e8e8e8', padding: 40, textAlign: 'center', color: '#aaa', fontSize: 13 }}>
          No staff {search ? 'match your search' : 'found'}.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
          {visible.map(s => {
            const active = s.is_active !== false
            return (
              <div key={s.id} style={{ background: '#fff', borderRadius: 14, border: '1px solid #e8e8e8', padding: '16px 18px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                  <div style={{ width: 44, height: 44, borderRadius: '50%', flexShrink: 0, background: 'linear-gradient(135deg,#0f4c35,#1a6b4a)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700 }}>{initials(s)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      onClick={() => setPopup(s)}
                      style={{ fontSize: 15, fontWeight: 700, color: '#0a3320', cursor: 'pointer', textDecoration: 'underline dotted' }}
                    >{fullName(s)}</div>
                    <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{s.position ?? 'Staff'}</div>
                  </div>
                  <span style={{
                    fontSize: 10, fontWeight: 600, padding: '3px 9px', borderRadius: 100, whiteSpace: 'nowrap',
                    background: active ? '#f0fff4' : '#f4f4f5', color: active ? '#0f4c35' : '#9ca3af',
                    border: `1px solid ${active ? '#bbf7d0' : '#e0e0e0'}`,
                  }}>{active ? 'Active' : 'Inactive'}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12.5, color: '#555' }}>
                  <Row icon="🏫" text={centerName(s.center_id)} />
                  {(s.class_primary || s.class_secondary) && (
                    <Row icon="🚪" text={[s.class_primary, s.class_secondary].filter(Boolean).join(' · ')} />
                  )}
                  {s.phone && <Row icon="📞" text={s.phone} href={`tel:${s.phone}`} />}
                  {s.email && <Row icon="✉️" text={s.email} href={`mailto:${s.email}`} />}
                  <Row icon="📅" text={`Hired ${fmtDate(s.hire_date)}`} />
                </div>
                <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #f0f0f0', display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => setPopup(s)}
                    style={{ fontSize: 12, padding: '5px 12px', borderRadius: 7, border: '1px solid #e0e8e0', background: '#f8fbf8', color: '#0f4c35', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}
                  >
                    👤 Details
                  </button>
                  <button
                    onClick={() => navigate(`/staff/${s.id}/settings`)}
                    style={{ fontSize: 12, padding: '5px 12px', borderRadius: 7, border: '1px solid #e0e8e0', background: '#f8fbf8', color: '#0f4c35', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}
                  >
                    ⚙️ Settings
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        {/* Staff detail popup */}
        {popup && (
          <div onClick={() => setPopup(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
            <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 18, width: '100%', maxWidth: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.18)', overflow: 'hidden', fontFamily: "'DM Sans', sans-serif" }}>
              {/* Header */}
              <div style={{ background: '#0f4c35', padding: '20px 24px', display: 'flex', gap: 14, alignItems: 'center' }}>
                <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700, flexShrink: 0 }}>{initials(popup)}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ color: '#fff', fontWeight: 700, fontSize: 17 }}>{fullName(popup)}</div>
                  <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 2 }}>{popup.position ?? 'Staff'} · {centerName(popup.center_id)}</div>
                </div>
                <button onClick={() => setPopup(null)} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', width: 30, height: 30, borderRadius: '50%', cursor: 'pointer', fontSize: 18 }}>×</button>
              </div>
              {/* Body */}
              <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  { label: 'Email',      value: popup.email,        href: popup.email ? `mailto:${popup.email}` : undefined },
                  { label: 'Phone',      value: popup.phone,        href: popup.phone ? `tel:${popup.phone}` : undefined },
                  { label: 'Classroom',  value: [popup.class_primary, popup.class_secondary].filter(Boolean).join(' · ') || '—' },
                  { label: 'Hire Date',  value: fmtDate(popup.hire_date) },
                  { label: 'Status',     value: popup.is_active !== false ? 'Active' : 'Inactive' },
                ].map(({ label, value, href }) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f0f0f0', paddingBottom: 8 }}>
                    <span style={{ fontSize: 12, color: '#888' }}>{label}</span>
                    {href
                      ? <a href={href} style={{ fontSize: 13, color: '#0f4c35', fontWeight: 500 }}>{value}</a>
                      : <span style={{ fontSize: 13, color: '#1a2e1a', fontWeight: 500 }}>{value || '—'}</span>
                    }
                  </div>
                ))}
                <button onClick={() => { setPopup(null); navigate(`/staff/${popup.id}/settings`) }} style={{ marginTop: 8, padding: '10px', borderRadius: 9, border: 'none', background: '#0f4c35', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                  ⚙️ Open Full Settings
                </button>
              </div>
            </div>
          </div>
        )}
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
