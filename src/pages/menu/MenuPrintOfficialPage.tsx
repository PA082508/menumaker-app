import { useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useOrg } from '@/contexts/OrgContext'
import { useAuth } from '@/hooks/useAuth'
import OfficialMenu, { weekPagesFor, buildCombos, type Lookup, type Holiday, type Combos } from './OfficialMenu'

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
 * Publish (step b): saves the resolved data snapshot to published_menus as a new
 * version (re-publishing the same month never overwrites). Published months are
 * viewed at /menu/published/:center/:year/:month, re-rendered from the snapshot.
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

  const center = useMemo(
    () => centers.find(c => c.slug === centerSlug) || null,
    [centers, centerSlug])
  const canPublish = roles.includes('director') || roles.includes('office_manager') || roles.includes('admin')

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
      setCycleId(cycle.id)
      setCycleStart(cycle.start_date ?? null)
      if (cycle.total_weeks) setTotalWeeks(cycle.total_weeks)

      const { data: items } = await supabase.schema('menumaker')
        .from('menu_items')
        .select(`week_number, day_of_week, item_text, recipe_id,
                 meal_types:meal_type_id(label),
                 components:component_id(slug),
                 recipes:recipe_id(is_whole_grain)`)
        .eq('cycle_id', cycle.id)
        .order('sort_order')

      const lk: Lookup = {}
      const recipeIds = new Set<string>()
      for (const it of (items || []) as any[]) {
        const meal = it.meal_types?.label as string | undefined
        const comp = it.components?.slug as string | undefined
        if (!meal || !comp) continue
        if (it.recipe_id) recipeIds.add(it.recipe_id)
        ;((((lk[it.week_number] ??= {})[it.day_of_week] ??= {})[meal] ??= {})[comp] ??= []).push({
          text: it.item_text || '',
          wg: !!it.recipes?.is_whole_grain,
          recipeId: it.recipe_id ?? null,
        })
      }
      setLookup(lk)

      // Combination-dish metadata: recipes crediting 2+ non-Extras components.
      let combosMap: Combos = {}
      if (recipeIds.size) {
        const { data: rcs } = await supabase.schema('menumaker')
          .from('recipe_components')
          .select('recipe_id, quantity, unit, recipes:recipe_id(name, menu_form_primary_component), components:component_id(slug,label), age_groups:age_group_id(slug)')
          .in('recipe_id', [...recipeIds])
        combosMap = buildCombos((rcs || []).map((r: any) => ({
          recipe_id: r.recipe_id, name: r.recipes?.name || '', quantity: r.quantity, unit: r.unit,
          comp_slug: r.components?.slug, comp_label: r.components?.label, age_slug: r.age_groups?.slug,
          primary_override: r.recipes?.menu_form_primary_component ?? null,
        })))
      }
      setCombos(combosMap)

      // Holidays for THIS center (small table → fetch all, key by full date).
      const { data: hols } = await supabase.schema('menumaker')
        .from('holidays')
        .select('year, month, day, name, type, close_time')
        .eq('center_id', center.id)
      const hmap: Record<string, Holiday> = {}
      for (const h of (hols || []) as any[])
        hmap[`${h.year}-${h.month}-${h.day}`] = { type: h.type, name: h.name, close_time: h.close_time }
      setHolidayByDate(hmap)

      // Latest published version for this center/month (for the Publish button label).
      if (year && month) {
        const { data: pub } = await supabase.schema('menumaker')
          .from('published_menus')
          .select('version')
          .eq('program', 'child').eq('center_id', center.id).eq('year', year).eq('month', month)
          .order('version', { ascending: false }).limit(1)
        setLatestVersion(pub?.[0]?.version ?? null)
      }

      setLoading(false)
    }
    load()
  }, [center, orgLoading, year, month])

  const publish = async () => {
    if (!center || !year || !month) return
    setPublishState('busy')
    const snapshot = { centerName: center.name, cycleStart, totalWeeks, lookup, holidayByDate, combos }
    const nextVersion = (latestVersion ?? 0) + 1
    const { error } = await supabase.schema('menumaker').from('published_menus').insert({
      org_id: org?.id ?? undefined,
      program: 'child',
      center_id: center.id,
      cycle_id: cycleId,
      year, month,
      version: nextVersion,
      snapshot,
      published_by: user?.id ?? null,
    })
    if (error) { setPublishState(`Error: ${error.message}`); return }
    setLatestVersion(nextVersion)
    setPublishState(`Published v${nextVersion} ✓`)
  }

  if (!year || !month || month < 1 || month > 12)
    return <Msg>Invalid month in URL. Use /menu/print-official/:center/:year/:month.</Msg>
  if (orgLoading || loading) return <Msg>Loading official menu…</Msg>
  if (!center) return <Msg>Center “{centerSlug}” not found or not accessible.</Msg>

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
          <button onClick={publish} disabled={publishState === 'busy'} title="Save this month as a published version (parents / website)" style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #0f4c35', background: '#fff', color: '#0f4c35', fontSize: 13, fontWeight: 600, cursor: publishState === 'busy' ? 'default' : 'pointer' }}>
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
