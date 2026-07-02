import { useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useOrg } from '@/contexts/OrgContext'
import OfficialMenu, { weekPagesFor, type Lookup, type Holiday } from './OfficialMenu'

/**
 * Container for the official CACFP monthly menu form
 * (route /menu/print-official/:center/:year/:month).
 *
 * Fetches the same selection as Print Week on MenuPlannerPage (menu_cycles +
 * weekly menu_items + linked recipes). Each menu_item carries component_id, so
 * dishes drop straight into the CACFP component rows; WG marks come from
 * recipes.is_whole_grain; holidays are per center_id. Rendering lives in the pure
 * <OfficialMenu> component.
 */
export default function MenuPrintOfficialPage() {
  const { center: centerSlug, year: yearStr, month: monthStr } = useParams()
  const { centers, loading: orgLoading } = useOrg()
  const year = parseInt(yearStr || '', 10)
  const month = parseInt(monthStr || '', 10) // 1-12

  const [loading, setLoading] = useState(true)
  const [cycleStart, setCycleStart] = useState<string | null>(null)
  const [totalWeeks, setTotalWeeks] = useState(4)
  const [lookup, setLookup] = useState<Lookup>({})
  const [holidayByDate, setHolidayByDate] = useState<Record<string, Holiday>>({})

  const center = useMemo(
    () => centers.find(c => c.slug === centerSlug) || null,
    [centers, centerSlug])

  useEffect(() => {
    if (orgLoading) return
    if (!center) { setLoading(false); return }
    const load = async () => {
      setLoading(true)

      const { data: cycles } = await supabase.schema('menumaker')
        .from('menu_cycles')
        .select('id, total_weeks, start_date')
        .eq('program', 'child')
        .order('created_at', { ascending: false })
        .limit(1)
      const cycle = cycles?.[0]
      if (!cycle) { setLoading(false); return }
      setCycleStart(cycle.start_date ?? null)
      if (cycle.total_weeks) setTotalWeeks(cycle.total_weeks)

      const { data: items } = await supabase.schema('menumaker')
        .from('menu_items')
        .select(`week_number, day_of_week, item_text,
                 meal_types:meal_type_id(label),
                 components:component_id(slug),
                 recipes:recipe_id(is_whole_grain)`)
        .eq('cycle_id', cycle.id)
        .order('sort_order')

      const lk: Lookup = {}
      for (const it of (items || []) as any[]) {
        const meal = it.meal_types?.label as string | undefined
        const comp = it.components?.slug as string | undefined
        if (!meal || !comp) continue
        ;((((lk[it.week_number] ??= {})[it.day_of_week] ??= {})[meal] ??= {})[comp] ??= []).push({
          text: it.item_text || '',
          wg: !!it.recipes?.is_whole_grain,
        })
      }
      setLookup(lk)

      // Holidays for THIS center (small table → fetch all, key by full date).
      const { data: hols } = await supabase.schema('menumaker')
        .from('holidays')
        .select('year, month, day, name, type, close_time')
        .eq('center_id', center.id)
      const hmap: Record<string, Holiday> = {}
      for (const h of (hols || []) as any[])
        hmap[`${h.year}-${h.month}-${h.day}`] = { type: h.type, name: h.name, close_time: h.close_time }
      setHolidayByDate(hmap)

      setLoading(false)
    }
    load()
  }, [center, orgLoading])

  if (!year || !month || month < 1 || month > 12)
    return <Msg>Invalid month in URL. Use /menu/print-official/:center/:year/:month.</Msg>
  if (orgLoading || loading) return <Msg>Loading official menu…</Msg>
  if (!center) return <Msg>Center “{centerSlug}” not found or not accessible.</Msg>

  const pageCount = weekPagesFor(year, month, cycleStart, totalWeeks).length
  const monthName = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'][month - 1]

  return (
    <div>
      {/* No-print toolbar (hidden by OfficialMenu's .no-print print rule) */}
      <div className="no-print" style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '14px 16px', background: '#f4f6f4', flexWrap: 'wrap', fontFamily: "'DM Sans',sans-serif" }}>
        <Link to="/menu" style={{ fontSize: 13, color: '#0f4c35', textDecoration: 'none' }}>← Back to Menu Planner</Link>
        <button onClick={() => window.print()} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #0f4c35', background: '#0f4c35', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          🖨 Print / Save PDF
        </button>
        <span style={{ fontSize: 12, color: '#666' }}>
          {center.name} · {monthName} {year} · {pageCount} week page{pageCount !== 1 ? 's' : ''}
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
          />}
    </div>
  )
}

function Msg({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: 40, fontFamily: "'DM Sans',sans-serif", color: '#666', fontSize: 14 }}>{children}</div>
}
