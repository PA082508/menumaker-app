import { useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useOrg } from '@/contexts/OrgContext'

/**
 * Official printable CACFP weekly-menu form — port of docs/menu_week_print_template_v2.html.
 *
 * Layout эталон = the v2 HTML template. Three additions per spec:
 *   1. Green top ribbon:  Center | Month | Date 1 to <last>
 *   2. Red holiday column: type=holiday → full-height red column "HOLIDAY: <name>", no dishes
 *   3. Red month label over the day where the month crosses (date === 1)
 *
 * Data = same selection as Print Week on MenuPlannerPage (menu_cycles + weekly
 * menu_items + linked recipes). Each menu_item already carries component_id, so
 * dishes drop straight into the CACFP component rows. WG marks come from the
 * recipe is_whole_grain flag. Holidays are per center_id (form prints per center).
 *
 * A month expands into 4-6 weekly pages; rotation Week 1..N continues across
 * months, anchored to the cycle "Week 1 Monday" (menu_cycles.start_date).
 */

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

const MEAL_LABELS = ['Breakfast', 'AM Snack', 'Lunch', 'Supper'] as const
type MealLabel = typeof MEAL_LABELS[number]

// Static CACFP meal-pattern rows (component + age portions) — measured from the
// v2 template. comp = component slug used to look up dishes; '__notes' is a fixed
// blank row with no data source.
type Row = { comp: string; label: string; ages: [string, string, string] }
const MEAL_ROWS: Record<MealLabel, Row[]> = {
  Breakfast: [
    { comp: 'milk',      label: 'Milk',             ages: ['1/2 cup', '3/4 cup', '1 cup'] },
    { comp: 'meat_alt',  label: 'Meat&Alternates',  ages: ['1/2 oz eq1,2', '1/2 oz eq1,2', '1 oz eq1,2'] },
    { comp: 'grain',     label: 'Grain',            ages: ['1/2 oz eq2', '1/2 oz eq2', '1 oz eq2'] },
    { comp: 'vegetable', label: 'Vegetable',        ages: ['1/4 cup', '1/2 cup', '1/2 cup'] },
    { comp: 'fruit',     label: 'Fruit',            ages: ['1/4 cup', '1/2 cup', '1/2 cup'] },
    { comp: 'extra',     label: 'Extras',           ages: ['', '', ''] },
    { comp: '__notes',   label: 'Notes',            ages: ['', '', ''] },
  ],
  'AM Snack': [
    { comp: 'milk',      label: 'Milk',             ages: ['1/2 cup', '1/2 cup', '1 cup'] },
    { comp: 'meat_alt',  label: 'Meat&Alternates',  ages: ['1/2 oz', '1/2 oz', '1 oz'] },
    { comp: 'grain',     label: 'Grain',            ages: ['1/2 oz eq2', '1/2 oz eq2', '1 oz eq2'] },
    { comp: 'vegetable', label: 'Vegetable',        ages: ['1/2 cup', '1/2 cup', '3/4 cup'] },
    { comp: 'fruit',     label: 'Fruit',            ages: ['1/2 cup', '1/2 cup', '3/4 cup'] },
  ],
  Lunch: [
    { comp: 'milk',      label: 'Milk',             ages: ['1/2 cup', '3/4 cup', '1 cup'] },
    { comp: 'meat_alt',  label: 'Meat&Alternates',  ages: ['1 oz', '1 1/2 oz', '2 oz'] },
    { comp: 'grain',     label: 'Grain',            ages: ['1/2 oz eq2', '1/2 oz eq2', '1 oz eq2'] },
    { comp: 'vegetable', label: 'Vegetable',        ages: ['1/8 cup', '1/4 cup', '1/2 cup'] },
    { comp: 'fruit',     label: 'Fruit',            ages: ['1/8 cup', '1/4 cup', '1/4 cup'] },
    { comp: 'extra',     label: 'Extras',           ages: ['', '', ''] },
    { comp: '__notes',   label: 'Notes',            ages: ['', '', ''] },
  ],
  Supper: [
    { comp: 'milk',      label: 'Milk',             ages: ['1/2 cup', '3/4 cup', '1 cup'] },
    { comp: 'meat_alt',  label: 'Meat&Alternates',  ages: ['1 oz', '1 1/2 oz', '2 oz'] },
    { comp: 'grain',     label: 'Grain',            ages: ['1/2 oz eq2', '1/2 oz eq2', '1 oz eq2'] },
    { comp: 'vegetable', label: 'Vegetable',        ages: ['1/8 cup', '1/4 cup', '1/2 cup'] },
    { comp: 'fruit',     label: 'Fruit',            ages: ['1/8 cup', '1/4 cup', '1/4 cup'] },
    { comp: 'extra',     label: 'Extras',           ages: ['', '', ''] },
    { comp: '__notes',   label: 'Notes',            ages: ['', '', ''] },
  ],
}

// Flattened body rows (26 total) with meal-label rowspan info.
type FlatRow = Row & { meal: MealLabel; mealFirst: boolean; mealSpan: number }
const FLAT_ROWS: FlatRow[] = MEAL_LABELS.flatMap(meal =>
  MEAL_ROWS[meal].map((r, i) => ({ ...r, meal, mealFirst: i === 0, mealSpan: MEAL_ROWS[meal].length })))
const TOTAL_ROWS = FLAT_ROWS.length

interface Dish { text: string; wg: boolean }
// lookup[week][day(1-5)][mealLabel][compSlug] = Dish[]
type Lookup = Record<number, Record<number, Record<string, Record<string, Dish[]>>>>

interface Holiday { type: string; name: string; close_time: string | null }

const dkey = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
const mondayOfWeekWith = (d: Date) => {
  const x = new Date(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x
}

export default function MenuPrintOfficialPage() {
  const { center: centerSlug, year: yearStr, month: monthStr } = useParams()
  const { centers, loading: orgLoading } = useOrg()
  const year = parseInt(yearStr || '', 10)
  const month = parseInt(monthStr || '', 10) // 1-12

  const [loading, setLoading] = useState(true)
  const [cycleName, setCycleName] = useState('')
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
        .select('id, name, total_weeks, start_date')
        .eq('program', 'child')
        .order('created_at', { ascending: false })
        .limit(1)
      const cycle = cycles?.[0]
      if (!cycle) { setLoading(false); return }
      setCycleName(cycle.name)
      setCycleStart(cycle.start_date ?? null)
      if (cycle.total_weeks) setTotalWeeks(cycle.total_weeks)

      const { data: items } = await supabase.schema('menumaker')
        .from('menu_items')
        .select(`week_number, day_of_week, item_text, is_extra, sort_order,
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
        const w = it.week_number, d = it.day_of_week
        ;((((lk[w] ??= {})[d] ??= {})[meal] ??= {})[comp] ??= []).push({
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

  // Rotation week number for a given Monday, anchored to the cycle Week-1 Monday.
  const rotationWeek = (monday: Date): number => {
    if (!cycleStart) return ((Math.max(0, 0)) % totalWeeks) + 1
    const start = mondayOfWeekWith(new Date(cycleStart + 'T12:00:00'))
    const weeks = Math.round((monday.getTime() - start.getTime()) / (7 * 86400000))
    return (((weeks % totalWeeks) + totalWeeks) % totalWeeks) + 1
  }

  // Build the list of week pages for this month (эталон spread logic).
  const weekPages = useMemo(() => {
    if (!year || !month) return []
    const m = month - 1
    const pages: { monday: Date; weekNum: number }[] = []
    let mon = mondayOfWeekWith(new Date(year, m, 1, 12))
    for (let i = 0; i < 6; i++) {
      let inMonth = false
      for (let k = 0; k < 5; k++) {
        const d = new Date(mon); d.setDate(mon.getDate() + k)
        if (d.getMonth() === m) { inMonth = true; break }
      }
      if (!inMonth) break
      pages.push({ monday: new Date(mon), weekNum: rotationWeek(new Date(mon)) })
      mon = new Date(mon); mon.setDate(mon.getDate() + 7)
    }
    return pages
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month, cycleStart, totalWeeks])

  if (!year || !month || month < 1 || month > 12)
    return <Msg>Invalid month in URL. Use /menu/print-official/:center/:year/:month.</Msg>
  if (orgLoading || loading) return <Msg>Loading official menu…</Msg>
  if (!center) return <Msg>Center “{centerSlug}” not found or not accessible.</Msg>

  const lastDay = new Date(year, month, 0).getDate()
  const monthName = MONTHS[month - 1]

  return (
    <div className="menu-official">
      <style>{PRINT_CSS}</style>

      {/* No-print toolbar */}
      <div className="no-print" style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '14px 16px', background: '#f4f6f4', flexWrap: 'wrap', fontFamily: "'DM Sans',sans-serif" }}>
        <Link to="/menu" style={{ fontSize: 13, color: '#0f4c35', textDecoration: 'none' }}>← Back to Menu Planner</Link>
        <button onClick={() => window.print()} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #0f4c35', background: '#0f4c35', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          🖨 Print / Save PDF
        </button>
        <span style={{ fontSize: 12, color: '#666' }}>
          {center.name} · {monthName} {year} · {weekPages.length} week page{weekPages.length !== 1 ? 's' : ''}
        </span>
      </div>

      {weekPages.length === 0 && <Msg>No weeks fall in {monthName} {year}.</Msg>}

      {weekPages.map((pg, i) => (
        <div className="week-block" key={i}>
          {/* Addition 1 — green ribbon */}
          <div className="green-ribbon">
            <span>Center: {center.name.replace(/^Play Academy\s+/i, '')}</span>
            <span>Month: {monthName}</span>
            <span>Date: 1 to {lastDay}</span>
          </div>
          <WeekTable
            monday={pg.monday}
            weekNum={pg.weekNum}
            reportMonth={month - 1}
            monthName={monthName}
            monthLast={lastDay}
            lookup={lookup}
            holidayByDate={holidayByDate}
          />
          <div className="wk-footer">
            This institution is an equal opportunity provider.<br />
            1 Meat and meat alternates may be used to substitute the entire grains component a maximum of three times per week.<br />
            2 oz eq = ounce equivalents &nbsp;·&nbsp; ** Select 2 of the 5 components for snack.
          </div>
        </div>
      ))}
    </div>
  )
}

function WeekTable({ monday, weekNum, reportMonth, monthName, monthLast, lookup, holidayByDate }: {
  monday: Date; weekNum: number; reportMonth: number; monthName: string; monthLast: number
  lookup: Lookup; holidayByDate: Record<string, Holiday>
}) {
  const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
  const days = [0, 1, 2, 3, 4].map(k => {
    const d = new Date(monday); d.setDate(monday.getDate() + k)
    const h = holidayByDate[dkey(d)]
    return {
      date: d,
      num: d.getDate(),
      // Addition 3 — red month label over the day where the month crosses (date === 1)
      cross: d.getDate() === 1 ? MONTHS[d.getMonth()] : null,
      holiday: h?.type === 'holiday' ? h : null,
      short: h?.type === 'short_day' ? h : null,
    }
  })

  const cellDishes = (comp: string, meal: MealLabel, dayIdx: number): Dish[] =>
    comp === '__notes' ? [] : (lookup[weekNum]?.[dayIdx + 1]?.[meal]?.[comp] ?? [])

  return (
    <table className="menu">
      <colgroup>
        <col className="c-meal" /><col className="c-comp" />
        <col className="c-a1" /><col className="c-a2" /><col className="c-a3" />
        {days.map((_, k) => <col key={k} className="c-day" />).flatMap((el, k) => [el, <col key={`n${k}`} className="c-num" />])}
      </colgroup>
      <tbody>
        {/* Header row 1 */}
        <tr>
          <td className="hdr-blue" />
          <td className="hdr-week">Week {weekNum}</td>
          <td className="hdr-blue">AGES</td><td className="hdr-blue">AGES</td><td className="hdr-blue">AGES</td>
          <td className="hdr-blue pair-l" style={{ textAlign: 'right' }}>Month:</td><td className="hdr-blue pair-r" />
          <td className="hdr-month pair-l">{monthName}</td><td className="hdr-blue pair-r" />
          <td className="hdr-blue pair-l" style={{ textAlign: 'right' }}>Date:</td><td className="hdr-green pair-r">1</td>
          <td className="hdr-blue pair-l" style={{ textAlign: 'right' }}>to</td><td className="hdr-green pair-r">{monthLast}</td>
        </tr>
        {/* Header row 2 — day names + red date numbers (+ month-crossover label) */}
        <tr>
          <td className="hdr-blue" />
          <td className="hdr-blue">COMPONENT</td>
          <td className="hdr-blue">1-2</td><td className="hdr-blue">3-5</td><td className="hdr-blue">6-12</td>
          {days.map((di, k) => [
            <td key={`d${k}`} className="hdr-blue pair-l">
              {di.cross && <div className="month-cross">{di.cross}</div>}
              {DAY_NAMES[k]}
              {di.short && <div className="short-note">Short Day{di.short.close_time ? ` · closes ${di.short.close_time.slice(0, 5)}` : ''}</div>}
            </td>,
            <td key={`n${k}`} className="num-red hdr-blue pair-r">{di.num}</td>,
          ])}
        </tr>

        {/* Body — component rows */}
        {FLAT_ROWS.map((row, ri) => (
          <tr key={ri} className={row.mealFirst ? 'meal-top' : undefined}>
            {row.mealFirst && <td className="vlabel" rowSpan={row.mealSpan}>{row.meal}{row.meal === 'AM Snack' ? '**' : ''}</td>}
            <td className="comp">{row.label}</td>
            <td className="age1">{row.ages[0]}</td>
            <td className="age2">{row.ages[1]}</td>
            <td className="age3">{row.ages[2]}</td>
            {days.map((di, k) => {
              // Addition 2 — full-height red holiday column (one merged cell on the first row)
              if (di.holiday) {
                if (ri !== 0) return null
                return (
                  <td key={k} className="holiday-cell" colSpan={2} rowSpan={TOTAL_ROWS}>
                    <div className="holiday-text">HOLIDAY: {di.holiday.name}</div>
                  </td>
                )
              }
              const dishes = cellDishes(row.comp, row.meal, k)
              return (
                <td key={k} className="dish" colSpan={2}>
                  {dishes.map((d, j) => (
                    <span key={j}>
                      {j > 0 && <br />}
                      {d.text}
                      {d.wg && !/\(wg\)/i.test(d.text) && <sup className="wg">WG</sup>}
                    </span>
                  ))}
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Msg({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: 40, fontFamily: "'DM Sans',sans-serif", color: '#666', fontSize: 14 }}>{children}</div>
}

const PRINT_CSS = `
@page { size: letter landscape; margin: 0.3in; }
.menu-official { font-family: Arial, Helvetica, sans-serif; font-size: 9.5px; color: #000; background: #fff; }
.menu-official table.menu { border-collapse: collapse; width: 100%; table-layout: fixed; }
.menu-official .menu td { border: 1px solid #000; padding: 2px 4px; vertical-align: middle; overflow: hidden; }
.menu-official col.c-meal { width: 2.3%; } .menu-official col.c-comp { width: 8.3%; }
.menu-official col.c-a1 { width: 6.0%; } .menu-official col.c-a2 { width: 6.2%; } .menu-official col.c-a3 { width: 5.4%; }
.menu-official col.c-day { width: 12.8%; } .menu-official col.c-num { width: 1.5%; }
.menu-official .hdr-week { background: #b32f19; color: #fff; font-weight: 800; font-size: 12px; text-align: center; }
.menu-official .hdr-blue { background: #abc3e5; font-weight: 700; text-align: center; }
.menu-official .hdr-month { background: #abc3e5; color: #e13e22; font-weight: 800; font-size: 12px; text-align: center; }
.menu-official .hdr-green { background: #abc3e5; color: #e13e22; font-weight: 800; text-align: left; padding: 0 0 0 2px; font-size: 9.5px; overflow: visible !important; white-space: nowrap; }
.menu-official .pair-l { border-right: none !important; } .menu-official .pair-r { border-left: none !important; }
.menu-official .num-red { color: #e13e22; font-weight: 800; text-align: left; padding: 0 0 0 2px; font-size: 9.5px; overflow: visible !important; white-space: nowrap; }
.menu-official .month-cross { color: #e13e22; font-weight: 800; font-size: 9px; }
.menu-official .short-note { color: #92400e; font-weight: 700; font-size: 7.5px; }
.menu-official .vlabel { writing-mode: vertical-rl; transform: rotate(180deg); text-align: center; font-weight: 800; font-size: 10px; background: #fff; padding: 1px 0; white-space: nowrap; overflow: visible !important; }
.menu-official .comp { font-weight: 400; background: #fff; text-align: left; }
.menu-official .age1 { background: #d9def2; text-align: center; white-space: nowrap; }
.menu-official .age2 { background: #f6e0c8; text-align: center; white-space: nowrap; }
.menu-official .age3 { background: #cfd8ee; text-align: center; white-space: nowrap; }
.menu-official .dish { background: #fff; min-height: 13px; text-align: left; }
.menu-official .wg { color: #0f7a3d; font-weight: 800; font-size: 7px; margin-left: 2px; }
.menu-official .holiday-cell { background: #e13e22; color: #fff; text-align: center; vertical-align: middle; }
.menu-official .holiday-text { writing-mode: vertical-rl; transform: rotate(180deg); font-weight: 800; font-size: 11px; letter-spacing: 0.04em; white-space: nowrap; margin: 0 auto; }
.menu-official .meal-top td { border-top: 3px solid #000; }
.menu-official .green-ribbon { background: #0f4c35; color: #fff; font-weight: 800; font-size: 11px; display: flex; gap: 28px; justify-content: center; padding: 4px 8px; margin-bottom: 3px; }
.menu-official .week-block { margin-bottom: 14px; padding: 6px; }
.menu-official .wk-footer { margin: 5px 0 0; font-size: 8.5px; line-height: 1.35; }
@media print {
  .no-print { display: none !important; }
  .menu-official .week-block { page-break-after: always; padding: 0; }
  .menu-official .week-block:last-child { page-break-after: auto; }
}
`
