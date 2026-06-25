// ============================================================
// ChildrenPage.tsx — route /children
// Roster browser: children grouped by classroom for the active center.
// Source: menumaker.roster (+ classrooms). Gated to admin/director/office_manager.
// ============================================================

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useOrg } from '@/contexts/OrgContext'
import { useAuth } from '@/hooks/useAuth'

type Classroom = { id: string; name: string; sort_order: number }
type Child = {
  id: string
  first_name: string | null
  last_name: string | null
  child_name: string | null
  age_group_food: string | null
  frp: string | null
  frp_expires: string | null
  milk_kind: string | null
  rate_oz: number | null
  date_in: string | null
  date_out: string | null
  birthday: string | null
  classroom_id: string | null
}

const AGE_LABEL: Record<string, string> = {
  infant_0_5m: '0-5m', infant_6_11m: '6-11m',
  '1y': '1yr', '2y': '2yr', '3_5': '3-5y', '6_12': '6-12y',
}

const FRP_STYLE: Record<string, { bg: string; color: string; border: string; label: string }> = {
  F: { bg: '#f0fff4', color: '#0f4c35', border: '#bbf7d0', label: 'Free' },
  R: { bg: '#fffbeb', color: '#92400e', border: '#fde68a', label: 'Reduced' },
  P: { bg: '#f4f4f5', color: '#6b7280', border: '#e0e0e0', label: 'Paid' },
}

const fmtDate = (d: string | null) => {
  if (!d) return '—'
  const [y, m, day] = String(d).slice(0, 10).split('-')
  return m && day ? `${Number(m)}/${Number(day)}/${y}` : String(d)
}
const fullName = (c: Child) =>
  [c.first_name, c.last_name].filter(Boolean).join(' ').trim() || c.child_name || '—'

// Center selector styled as a clear, clickable button with a ▾ arrow.
const selStyle: React.CSSProperties = {
  appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none',
  background: "#fff url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6'><path d='M1 1l4 4 4-4' fill='none' stroke='%230f4c35' stroke-width='1.5'/></svg>\") no-repeat right 12px center",
  border: '1.5px solid #0f4c35', borderRadius: 8, padding: '7px 30px 7px 12px',
  fontSize: 13, fontFamily: 'inherit', color: '#0f4c35', fontWeight: 600, cursor: 'pointer', outline: 'none',
}

const th: React.CSSProperties = { textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '10px 14px', background: '#0f4c35', whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '10px 14px', fontSize: 13, color: '#23332a', borderBottom: '1px solid #f0f4f1', whiteSpace: 'nowrap' }

export default function ChildrenPage() {
  const { currentCenter, centers, setCurrentCenter } = useOrg()
  const { roles } = useAuth()
  const allowed = (roles as string[]).some(r => r === 'admin' || r === 'director' || r === 'office_manager')

  const [classrooms, setClassrooms] = useState<Classroom[]>([])
  const [classId, setClassId] = useState<string>('')
  const [children, setChildren] = useState<Child[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')

  const centerId = currentCenter?.id ?? null

  useEffect(() => {
    if (!centerId) { setClassrooms([]); setChildren([]); setClassId(''); return }
    let cancelled = false
    setLoading(true)
    ;(async () => {
      const [{ data: cls }, { data: kids }] = await Promise.all([
        supabase.schema('menumaker').from('classrooms')
          .select('id,name,sort_order').eq('center_id', centerId).eq('is_active', true).order('sort_order'),
        supabase.schema('menumaker').from('roster')
          .select('id,first_name,last_name,child_name,age_group_food,frp,frp_expires,milk_kind,rate_oz,date_in,date_out,birthday,classroom_id')
          .eq('center_id', centerId).eq('is_active', true)
          .order('last_name', { nullsFirst: false }).order('first_name'),
      ])
      if (cancelled) return
      const clsList = (cls ?? []) as Classroom[]
      setClassrooms(clsList)
      setChildren((kids ?? []) as Child[])
      setClassId(prev => (prev && clsList.some(c => c.id === prev)) ? prev : (clsList[0]?.id ?? ''))
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [centerId])

  const countFor = (cid: string) => children.filter(c => c.classroom_id === cid).length

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return children
      .filter(c => c.classroom_id === classId)
      .filter(c => !q || fullName(c).toLowerCase().includes(q))
  }, [children, classId, search])

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
          <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 26, color: '#0a3320', marginBottom: 2 }}>Children</div>
          <div style={{ fontSize: 12, color: '#888' }}>{currentCenter?.name ?? 'Organization'} · roster</div>
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

      {!centerId ? (
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e8e8e8', padding: 40, textAlign: 'center', color: '#aaa', fontSize: 13 }}>
          Select a center to view its children.
        </div>
      ) : (
        <>
          {/* Classroom tabs */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
            {classrooms.map(cls => {
              const active = classId === cls.id
              return (
                <button key={cls.id} onClick={() => setClassId(cls.id)} style={{
                  padding: '7px 14px', borderRadius: 100, cursor: 'pointer', fontFamily: 'inherit',
                  border: `1.5px solid ${active ? '#0f4c35' : '#d0d5d0'}`,
                  background: active ? '#0f4c35' : '#fff', color: active ? '#fff' : '#555',
                  fontSize: 13, fontWeight: active ? 600 : 400, display: 'flex', alignItems: 'center', gap: 7,
                }}>
                  {cls.name}
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 100,
                    background: active ? 'rgba(255,255,255,0.2)' : '#eef2ee', color: active ? '#fff' : '#0f4c35',
                  }}>{countFor(cls.id)}</span>
                </button>
              )
            })}
            {classrooms.length === 0 && !loading && <span style={{ color: '#aaa', fontSize: 13 }}>No active classrooms.</span>}
          </div>

          {/* Search */}
          <div style={{ marginBottom: 12 }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name…"
              style={{ width: 260, maxWidth: '100%', padding: '8px 12px', borderRadius: 8, border: '1.5px solid #d0d5d0', fontSize: 13, fontFamily: 'inherit', outline: 'none', background: '#fff' }} />
            <span style={{ marginLeft: 10, fontSize: 12, color: '#aaa' }}>{visible.length} {visible.length === 1 ? 'child' : 'children'}</span>
          </div>

          {/* Table */}
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e8e8e8', overflow: 'hidden', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
              <thead>
                <tr>
                  {['Name', 'Age', 'F/R/P', 'FRP Expires', 'Milk', 'Date In', 'Date Out', 'Birthday'].map(h => <th key={h} style={th}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={8} style={{ ...td, textAlign: 'center', color: '#aaa', padding: 36 }}>Loading…</td></tr>
                ) : visible.length === 0 ? (
                  <tr><td colSpan={8} style={{ ...td, textAlign: 'center', color: '#aaa', padding: 36 }}>No children {search ? 'match your search' : 'in this classroom'}.</td></tr>
                ) : visible.map((c, i) => {
                  const frpKey = (c.frp ?? '').trim().toUpperCase().slice(0, 1)
                  const frp = FRP_STYLE[frpKey]
                  const expired = c.frp_expires && new Date(c.frp_expires) < new Date()
                  return (
                    <tr key={c.id} style={{ background: i % 2 === 0 ? '#fff' : '#fafaf8' }}>
                      <td style={{ ...td, fontWeight: 600, color: '#1a2e1a' }}>{fullName(c)}</td>
                      <td style={td}>{AGE_LABEL[c.age_group_food ?? ''] ?? c.age_group_food ?? '—'}</td>
                      <td style={td}>
                        {frp ? (
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 5, background: frp.bg, color: frp.color, border: `1px solid ${frp.border}` }}>
                            {frpKey} · {frp.label}
                          </span>
                        ) : <span style={{ color: '#ccc' }}>—</span>}
                      </td>
                      <td style={{ ...td, color: expired ? '#c0392b' : '#23332a' }}>
                        {fmtDate(c.frp_expires)}{expired && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700 }}>⚠ Expired</span>}
                      </td>
                      <td style={td}>{c.milk_kind ?? '—'}{c.rate_oz ? ` · ${c.rate_oz}oz` : ''}</td>
                      <td style={td}>{fmtDate(c.date_in)}</td>
                      <td style={td}>{fmtDate(c.date_out)}</td>
                      <td style={td}>{fmtDate(c.birthday)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
