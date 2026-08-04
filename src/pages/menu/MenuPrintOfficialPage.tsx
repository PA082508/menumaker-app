import { useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { warnIf } from '@/lib/queryError'
import { useOrg } from '@/contexts/OrgContext'
import { useAuth } from '@/hooks/useAuth'
import OfficialMenu, { weekPagesFor, type Lookup, type Holiday, type Combos } from './OfficialMenu'
import { loadMenuSource, loadHolidaysByCenter, publishMonth } from './publishMonth'

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

/**
 * Container for the official CACFP monthly menu form
 * (route /menu/print-official/:center/:year/:month).
 *
 * Fetches the same selection as Print Week on MenuPlannerPage (menu_cycles +
 * weekly menu_items + linked recipes). Each menu_item carries component_id, so
 * dishes drop straight into the CACFP component rows; WG marks come from
 * recipes.is_whole_grain; holidays are per center_id. Rendering lives in the pure
 * <OfficialMenu> component.
 *
 * Publish here is the ADMIN's point tool: it re-issues ONE center's month as a new
 * version (re-publishing never overwrites). The normal path is the org-wide
 * «Publish» on the Menu Planner, which publishes the month for ALL centers in one
 * operation — both go through publishMonth(), so the snapshot shape stays one.
 * Published months are viewed at /menu/published/:center/:year/:month.
 */
export default function MenuPrintOfficialPage() {
  const { center: centerSlug, year: yearStr, month: monthStr } = useParams()
  const { centers, org, loading: orgLoading } = useOrg()
  const { user, roles } = useAuth()
  const year = parseInt(yearStr || '', 10)
  const month = parseInt(monthStr || '', 10) // 1-12

  const [loading, setLoading] = useState(true)
  const [cycleId, setCycleId] = useState<string | null>(null)
  const [cycleStart, setCycleStart] = useState<string | null>(null)
  const [totalWeeks, setTotalWeeks] = useState(4)
  const [lookup, setLookup] = useState<Lookup>({})
  const [combos, setCombos] = useState<Combos>({})
  const [holidayByDate, setHolidayByDate] = useState<Record<string, Holiday>>({})
  const [latestVersion, setLatestVersion] = useState<number | null>(null)
  const [publishState, setPublishState] = useState<'idle' | 'busy' | string>('idle')
  const [loadError, setLoadError] = useState<string | null>(null)

  const center = useMemo(
    () => centers.find(c => c.slug === centerSlug) || null,
    [centers, centerSlug])
  // Точечное переиздание одного центра — инструмент админа. Обычная публикация
  // месяца идёт по всем центрам сразу, кнопкой на планировщике.
  const canPublish = roles.includes('admin')

  useEffect(() => {
    if (orgLoading) return
    if (!center) { setLoading(false); return }
    const load = async () => {
      setLoading(true)
      setLoadError(null)

      try {
        // Ровно те же данные, из которых собирается публикуемый снимок —
        // живая форма и снимок не могут разойтись, их строит один код.
        const source = await loadMenuSource('child')
        if (!source) { setLoading(false); return }
        setCycleId(source.cycleId)
        setCycleStart(source.cycleStart)
        setTotalWeeks(source.totalWeeks)
        setLookup(source.lookup)
        setCombos(source.combos)

        // Holidays for THIS center (small table → fetch all, key by full date).
        const hols = await loadHolidaysByCenter([center.id])
        setHolidayByDate(hols[center.id] ?? {})
      } catch (e: any) {
        // Пустой бланк выглядит как «в меню ничего не запланировано».
        // Отказ обязан сказать это словами и не притворяться формой.
        setLoadError(e?.message ?? 'the database refused the request')
        setLoading(false)
        return
      }

      // Latest published version for this center/month (for the Publish button label).
      if (year && month) {
        const { data: pub, error: pubErr } = await supabase.schema('menumaker')
          .from('published_menus')
          .select('version')
          .eq('program', 'child').eq('center_id', center.id).eq('year', year).eq('month', month)
          .order('version', { ascending: false }).limit(1)
        warnIf(pubErr, 'MenuPrintOfficialPage/latest-version')
        setLatestVersion(pub?.[0]?.version ?? null)
      }

      setLoading(false)
    }
    load()
  }, [center, orgLoading, year, month])

  const publish = async () => {
    if (!center || !year || !month) return
    setPublishState('busy')
    const { published, error } = await publishMonth({
      centers: [{ id: center.id, slug: center.slug, name: center.name }],
      year, month,
      orgId: org?.id ?? null,
      userId: user?.id ?? null,
      source: { cycleId, cycleStart, totalWeeks, lookup, combos },
      holidaysByCenter: { [center.id]: holidayByDate },
    })
    if (error) { setPublishState(`Error: ${error}`); return }
    const v = published[0]?.version ?? null
    if (v) setLatestVersion(v)
    setPublishState(`Published v${v} ✓`)
  }

  if (!year || !month || month < 1 || month > 12)
    return <Msg>Invalid month in URL. Use /menu/print-official/:center/:year/:month.</Msg>
  if (orgLoading || loading) return <Msg>Loading official menu…</Msg>
  if (!center) return <Msg>Center “{centerSlug}” not found or not accessible.</Msg>
  if (loadError) return <Msg>Official menu not built — {loadError}. Nothing was published.</Msg>

  const pageCount = weekPagesFor(year, month, cycleStart, totalWeeks).length
  const monthName = MONTH_NAMES[month - 1]

  return (
    <div>
      {/* No-print toolbar (hidden by OfficialMenu's .no-print print rule) */}
      <div className="no-print" style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '14px 16px', background: '#f4f6f4', flexWrap: 'wrap', fontFamily: "'DM Sans',sans-serif" }}>
        <Link to="/menu" style={{ fontSize: 13, color: '#0f4c35', textDecoration: 'none' }}>← Back to Menu Planner</Link>
        <button onClick={() => window.print()} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #0f4c35', background: '#0f4c35', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          🖨 Print / Save PDF
        </button>
        {canPublish && (
          <button onClick={publish} disabled={publishState === 'busy'} title="Admin tool: re-issue THIS center's month as a new version. The normal path is Publish on the Menu Planner — it publishes the month for all centers at once." style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #0f4c35', background: '#fff', color: '#0f4c35', fontSize: 13, fontWeight: 600, cursor: publishState === 'busy' ? 'default' : 'pointer' }}>
            {publishState === 'busy' ? 'Publishing…' : latestVersion ? `📢 Publish (next v${latestVersion + 1})` : '📢 Publish'}
          </button>
        )}
        {latestVersion && (
          <Link to={`/menu/published/${center.slug}/${year}/${month}`} style={{ fontSize: 12, color: '#0f4c35', textDecoration: 'none' }}>
            View published v{latestVersion} →
          </Link>
        )}
        <span style={{ fontSize: 12, color: publishState.startsWith('Error') ? '#b91c1c' : '#666' }}>
          {publishState !== 'idle' && publishState !== 'busy'
            ? publishState
            : `${center.name} · ${monthName} ${year} · ${pageCount} week page${pageCount !== 1 ? 's' : ''}`}
        </span>
      </div>

      {pageCount === 0
        ? <Msg>No weeks fall in {monthName} {year}.</Msg>
        : <OfficialMenu
            centerName={center.name}
            year={year}
            month={month}
            cycleStart={cycleStart}
            totalWeeks={totalWeeks}
            lookup={lookup}
            holidayByDate={holidayByDate}
            combos={combos}
          />}
    </div>
  )
}

function Msg({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: 40, fontFamily: "'DM Sans',sans-serif", color: '#666', fontSize: 14 }}>{children}</div>
}
