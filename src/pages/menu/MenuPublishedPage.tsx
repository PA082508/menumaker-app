import { useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams, Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useOrg } from '@/contexts/OrgContext'
import OfficialMenu, { type Lookup, type Holiday } from './OfficialMenu'

/**
 * Published view of the official monthly menu (route
 * /menu/published/:center/:year/:month). Renders the stored snapshot from
 * published_menus through the same <OfficialMenu> component — "generate on the
 * fly from the snapshot" (step b). Shows the latest version by default;
 * ?version=N pins a specific version.
 */
interface Snapshot {
  centerName: string
  cycleStart: string | null
  totalWeeks: number
  lookup: Lookup
  holidayByDate: Record<string, Holiday>
}

export default function MenuPublishedPage() {
  const { center: centerSlug, year: yearStr, month: monthStr } = useParams()
  const [params] = useSearchParams()
  const { centers, loading: orgLoading } = useOrg()
  const year = parseInt(yearStr || '', 10)
  const month = parseInt(monthStr || '', 10)
  const wantVersion = params.get('version') ? parseInt(params.get('version')!, 10) : null

  const [loading, setLoading] = useState(true)
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [version, setVersion] = useState<number | null>(null)
  const [publishedAt, setPublishedAt] = useState<string | null>(null)

  const center = useMemo(
    () => centers.find(c => c.slug === centerSlug) || null,
    [centers, centerSlug])

  useEffect(() => {
    if (orgLoading) return
    if (!center || !year || !month) { setLoading(false); return }
    const load = async () => {
      setLoading(true)
      let q = supabase.schema('menumaker').from('published_menus')
        .select('version, snapshot, published_at')
        .eq('program', 'child').eq('center_id', center.id).eq('year', year).eq('month', month)
      if (wantVersion) q = q.eq('version', wantVersion)
      const { data } = await q.order('version', { ascending: false }).limit(1)
      const row = data?.[0]
      if (row) {
        setSnapshot(row.snapshot as Snapshot)
        setVersion(row.version)
        setPublishedAt(row.published_at)
      }
      setLoading(false)
    }
    load()
  }, [center, orgLoading, year, month, wantVersion])

  if (!year || !month) return <Msg>Invalid URL. Use /menu/published/:center/:year/:month.</Msg>
  if (orgLoading || loading) return <Msg>Loading published menu…</Msg>
  if (!center) return <Msg>Center “{centerSlug}” not found or not accessible.</Msg>
  if (!snapshot) return (
    <Msg>
      No published menu for {center.name}, {month}/{year}
      {wantVersion ? ` (v${wantVersion})` : ''}.{' '}
      <Link to={`/menu/print-official/${center.slug}/${year}/${month}`} style={{ color: '#0f4c35' }}>Open the live form to publish it →</Link>
    </Msg>
  )

  return (
    <div>
      <div className="no-print" style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '14px 16px', background: '#f4f6f4', flexWrap: 'wrap', fontFamily: "'DM Sans',sans-serif" }}>
        <Link to="/menu" style={{ fontSize: 13, color: '#0f4c35', textDecoration: 'none' }}>← Menu Planner</Link>
        <button onClick={() => window.print()} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #0f4c35', background: '#0f4c35', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          🖨 Print / Save PDF
        </button>
        <span style={{ fontSize: 12, color: '#666' }}>
          Published <strong>v{version}</strong>
          {publishedAt ? ` · ${new Date(publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}
          {' · '}<Link to={`/menu/print-official/${center.slug}/${year}/${month}`} style={{ color: '#0f4c35', textDecoration: 'none' }}>live form →</Link>
        </span>
      </div>
      <OfficialMenu
        centerName={snapshot.centerName}
        year={year}
        month={month}
        cycleStart={snapshot.cycleStart}
        totalWeeks={snapshot.totalWeeks}
        lookup={snapshot.lookup}
        holidayByDate={snapshot.holidayByDate}
      />
    </div>
  )
}

function Msg({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: 40, fontFamily: "'DM Sans',sans-serif", color: '#666', fontSize: 14 }}>{children}</div>
}
