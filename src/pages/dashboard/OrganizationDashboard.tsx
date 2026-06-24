// Organization-wide dashboard. Shown on /dashboard when an org admin selects
// "Organization" in the header switcher (OrgContext viewMode === 'org').
// Center cards pull live numbers from menumaker.compute_monthly_claim() and
// week status is aggregated from meal_week_records for the current month.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useOrg, type Center } from '@/contexts/OrgContext'
import { startOfMonth, endOfMonth, format } from 'date-fns'

interface CenterMetrics {
  ada: number | null
  reimbursement: number | null
  meals: number | null
  approvedWeeks: number
  totalWeeks: number
}

const money = (v: number | null) =>
  v == null ? '—' : v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
// "6285 Pearl Rd #30, Parma Hts, OH 44130" → "Parma Hts" (the part before state/zip)
const cityFromAddress = (addr?: string | null) => {
  const parts = (addr ?? '').split(',').map(s => s.trim()).filter(Boolean)
  return parts.length >= 2 ? parts[parts.length - 2] : (parts[0] ?? '')
}

export default function OrganizationDashboard() {
  const { org, centers, setCurrentCenter } = useOrg()
  const [metrics, setMetrics] = useState<Record<string, CenterMetrics>>({})
  const [cities, setCities] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)

  const monthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd')
  const monthEnd = format(endOfMonth(new Date()), 'yyyy-MM-dd')
  const monthLabel = format(new Date(), 'MMMM yyyy')

  useEffect(() => {
    if (!centers.length) { setLoading(false); return }
    let cancelled = false
    setLoading(true)
    ;(async () => {
      // Center locations (city parsed from address) for the card subtitles.
      const { data: ctrs } = await supabase
        .schema('menumaker').from('centers')
        .select('id, address').in('id', centers.map(c => c.id))
      if (!cancelled && ctrs) {
        const cmap: Record<string, string> = {}
        for (const r of ctrs as { id: string; address: string | null }[]) cmap[r.id] = cityFromAddress(r.address)
        setCities(cmap)
      }

      // Week status for the whole month, all centers in one query. A (center,
      // week) is "approved" only if every classroom record for that Monday is.
      const { data: recs } = await supabase
        .schema('menumaker').from('meal_week_records')
        .select('center_id, monday_date, status')
        .gte('monday_date', monthStart).lte('monday_date', monthEnd)
      const weekApproved: Record<string, Record<string, boolean>> = {}
      for (const r of recs ?? []) {
        const cm = (weekApproved[r.center_id] ??= {})
        if (!(r.monday_date in cm)) cm[r.monday_date] = true
        if (r.status !== 'approved') cm[r.monday_date] = false
      }

      const entries = await Promise.all(centers.map(async (c) => {
        const { data: claim } = await (supabase.schema('menumaker').rpc as any)(
          'compute_monthly_claim', { p_center_id: c.id, p_month: monthStart }
        )
        const weeks = weekApproved[c.id] ?? {}
        const m: CenterMetrics = {
          ada:           claim?.attendance?.ada ?? null,
          reimbursement: claim?.reimbursement?.total ?? null,
          meals:         claim?.meals?.total_reimbursable ?? null,
          totalWeeks:    Object.keys(weeks).length,
          approvedWeeks: Object.values(weeks).filter(Boolean).length,
        }
        return [c.id, m] as const
      }))
      if (cancelled) return
      setMetrics(Object.fromEntries(entries))
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [centers, monthStart, monthEnd])

  const openCenter = (c: Center) => setCurrentCenter(c)

  return (
    <div style={{ padding: '28px 32px', fontFamily: "'DM Sans', sans-serif", maxWidth: 1200 }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Serif+Display&display=swap" rel="stylesheet"/>

      <div style={{ marginBottom: 4, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#1a6b4a', fontWeight: 600 }}>
        🏢 Organization
      </div>
      <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 28, color: '#0a3320', margin: '0 0 2px' }}>
        {org?.name ?? 'Organization'}
      </h1>
      <div style={{ fontSize: 13, color: '#888', marginBottom: 24 }}>
        {centers.length} center{centers.length !== 1 ? 's' : ''} · Claim month {monthLabel}
      </div>

      {/* Center cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16, marginBottom: 32 }}>
        {centers.map((c) => {
          const m = metrics[c.id]
          const allApproved = m && m.totalWeeks > 0 && m.approvedWeeks === m.totalWeeks
          return (
            <div key={c.id} style={{
              background: '#fff', borderRadius: 16, border: '1px solid #e8e8e8',
              padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                <div>
                  <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 19, color: '#0a3320' }}>
                    🏫 {c.name}
                  </div>
                  {cities[c.id] && <div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>{cities[c.id]}</div>}
                </div>
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 20,
                  textTransform: 'uppercase', letterSpacing: '0.05em',
                  background: allApproved ? '#e7f7ee' : '#fff4e5',
                  color: allApproved ? '#0f7a4a' : '#b06a00',
                }}>
                  {m ? (m.totalWeeks === 0 ? 'No data' : allApproved ? 'Approved' : 'Open') : '…'}
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
                <Metric label="ADA" value={loading ? '…' : (m?.ada ?? '—')} />
                <Metric label="Reimbursement" value={loading ? '…' : money(m?.reimbursement ?? null)} />
                <Metric label="Meals served" value={loading ? '…' : (m?.meals?.toLocaleString() ?? '—')} />
                <Metric label="Weeks approved" value={loading ? '…' : (m ? `${m.approvedWeeks}/${m.totalWeeks}` : '—')} />
              </div>

              <button onClick={() => openCenter(c)} style={{
                width: '100%', padding: '9px', borderRadius: 10, border: '1px solid #0f4c35',
                background: '#0f4c35', color: '#fff', fontSize: 13, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit',
              }}>
                View Center →
              </button>
            </div>
          )
        })}
      </div>

      {/* Org-level sections */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
        <SectionCard icon="📊" title="Consolidated CACFP Report"
          body="All centers' meals, ADA, and reimbursement for a month — one printable page." to="/org/consolidated-report" />
        <SectionCard icon="👥" title="User Management"
          body="View staff, roles, and per-center access across the organization." to="/org/users" />
        <SectionCard icon="🍳" title="Kitchen" body="Central kitchen production planning." badge="Coming soon" />
        <SectionCard icon="🚐" title="Delivery" body="Cross-center delivery dispatch." badge="Coming soon" />
      </div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>
        {label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, color: '#1a1a1a', lineHeight: 1.1 }}>{value}</div>
    </div>
  )
}

function SectionCard({ icon, title, body, badge, to }: { icon: string; title: string; body: string; badge?: string; to?: string }) {
  const inner = (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span style={{ fontSize: 22 }}>{icon}</span>
        <div style={{ fontSize: 15, fontWeight: 600, color: '#0a3320' }}>{title}</div>
        {badge && (
          <span style={{
            marginLeft: 'auto', fontSize: 9, fontWeight: 700, padding: '3px 8px', borderRadius: 20,
            background: '#f0f0f0', color: '#999', textTransform: 'uppercase', letterSpacing: '0.05em',
          }}>{badge}</span>
        )}
        {to && <span style={{ marginLeft: 'auto', color: '#1a6b4a', fontSize: 16 }}>→</span>}
      </div>
      <div style={{ fontSize: 12, color: '#888', lineHeight: 1.5 }}>{body}</div>
    </>
  )
  const style: React.CSSProperties = {
    background: '#fff', borderRadius: 16, border: '1px solid #e8e8e8', padding: 20,
    display: 'block', textDecoration: 'none',
  }
  return to
    ? <Link to={to} style={{ ...style, cursor: 'pointer' }}>{inner}</Link>
    : <div style={style}>{inner}</div>
}
