import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface MenuItem {
  id: string
  week_number: number
  day_of_week: number
  meal_type: string
  meal_order: number
  recipe_id: string | null
  recipe_name: string | null
  item_text: string
  is_extra: boolean
  sort_order: number
}

interface Cycle {
  id: string
  name: string
  total_weeks: number
  status: string
  start_date: string | null
}

// Default meal start times for the org-wide planner (no per-classroom schedule here).
// Used only to decide which slots fall after a short-day close time.
const SLOT_TIMES: Record<string, string> = {
  Breakfast: '08:00',
  'AM Snack': '09:30',
  Lunch: '11:30',
  Supper: '15:00',
}

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

interface Holiday {
  year: number
  month: number
  day: number
  name: string
  type: string
  close_time: string | null
}

const MONTH_LABELS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']

const MEAL_COLORS: Record<string, { bg: string; border: string; label: string; dot: string }> = {
  Breakfast: { bg: '#fffbeb', border: '#fde68a', label: '#92400e', dot: '#f59e0b' },
  'AM Snack': { bg: '#f0fdf4', border: '#bbf7d0', label: '#166534', dot: '#22c55e' },
  Lunch:     { bg: '#eff6ff', border: '#bfdbfe', label: '#1e40af', dot: '#3b82f6' },
  Supper:    { bg: '#fdf4ff', border: '#e9d5ff', label: '#6b21a8', dot: '#a855f7' },
}

const MEAL_ICONS: Record<string, string> = {
  Breakfast: '🌅',
  'AM Snack': '🍎',
  Lunch:     '🍽️',
  Supper:    '🌙',
}

export default function MenuPlannerPage() {
  const [cycle, setCycle]         = useState<Cycle | null>(null)
  const [items, setItems]         = useState<MenuItem[]>([])
  const [loading, setLoading]     = useState(true)
  const [selectedWeek, setSelectedWeek] = useState(1)
  const [totalWeeks, setTotalWeeks]     = useState(4)
  const [holidays, setHolidays]         = useState<Holiday[]>([])
  const [holidayMap, setHolidayMap]     = useState<Record<string, Holiday>>({})
  const [cycleStart, setCycleStart]     = useState<string | null>(null)
  const [savingDate, setSavingDate]     = useState(false)

  const handlePrint = () => {
    const weekItems = items.filter(i => i.week_number === selectedWeek)

    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(`
      <html><head><title>Menu — Week ${selectedWeek}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 24px; }
        h1 { font-size: 18px; margin-bottom: 4px; color: #0a3320; }
        .meta { font-size: 11px; color: #888; margin-bottom: 16px; }
        table { width: 100%; border-collapse: collapse; }
        th { background: #0f4c35; color: white; padding: 8px 10px; text-align: left; font-size: 12px; }
        .footer { margin-top: 16px; font-size: 10px; color: #aaa; }
      </style></head><body>
      <h1>🍽️ Child Menu — Week ${selectedWeek} of ${totalWeeks}</h1>
      <div class="meta">${cycle?.name || ''} · Week ${selectedWeek} · Printed: ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</div>
      <table>
        <thead>
          <tr>
            <th>Day</th>
            <th>🌅 Breakfast</th>
            <th>🍎 AM Snack</th>
            <th>🍽️ Lunch</th>
            <th>🌙 Supper</th>
          </tr>
        </thead>
        <tbody>
          ${DAYS.map((day, di) => {
            const dayNum = di + 1
            const cells = ['Breakfast', 'AM Snack', 'Lunch', 'Supper'].map(mealType => {
              const mealItems = weekItems
                .filter(i => i.day_of_week === dayNum && i.meal_type === mealType)
                .sort((a, b) => a.sort_order - b.sort_order)
                .map(i => i.item_text)
                .join('<br>')
              return `<td style="padding:6px 10px;border:1px solid #ddd;font-size:11px;vertical-align:top">${mealItems || '—'}</td>`
            }).join('')
            return `<tr><td style="padding:6px 10px;border:1px solid #ddd;font-weight:600;font-size:12px;background:#f9f9f9">${day}</td>${cells}</tr>`
          }).join('')}
        </tbody>
      </table>
      <div class="footer">MenuMaker · Play Academy · CACFP Child Program</div>
      </body></html>`)
    w.document.close()
    w.print()
  }

  useEffect(() => {
    const load = async () => {
      setLoading(true)

      const { data: cycles } = await supabase
        .schema('menumaker')
        .from('menu_cycles')
        .select('id, name, total_weeks, status, start_date')
        .eq('program', 'child')
        .order('created_at', { ascending: false })
        .limit(1)

      const activeCycle = cycles?.[0] || null
      setCycle(activeCycle)
      if (activeCycle?.total_weeks) setTotalWeeks(activeCycle.total_weeks)
      setCycleStart(activeCycle?.start_date ?? null)

      if (!activeCycle) { setLoading(false); return }

      const { data: menuData } = await supabase
        .schema('menumaker')
        .from('menu_items')
        .select(`
          id, week_number, day_of_week, meal_type_id,
          recipe_id, item_text, is_extra, sort_order,
          meal_types:meal_type_id(label, sort_order),
          recipes:recipe_id(name)
        `)
        .eq('cycle_id', activeCycle.id)
        .order('week_number')
        .order('day_of_week')
        .order('sort_order')

      setItems((menuData || []).map((d: any) => ({
        id: d.id,
        week_number: d.week_number,
        day_of_week: d.day_of_week,
        meal_type: d.meal_types?.label || '',
        meal_order: d.meal_types?.sort_order || 0,
        recipe_id: d.recipe_id,
        recipe_name: d.recipes?.name || null,
        item_text: d.item_text || d.recipes?.name || '',
        is_extra: d.is_extra,
        sort_order: d.sort_order,
      })))

      // Upcoming closures (holidays + short days). Per-center rows → dedupe by date.
      const today = new Date()
      const yr = today.getFullYear()
      const { data: hols } = await supabase
        .schema('menumaker')
        .from('holidays')
        .select('year, month, day, name, type, close_time')
        .in('year', [yr, yr + 1])
      const seen = new Set<string>()
      const upcoming: Holiday[] = []
      const map: Record<string, Holiday> = {}
      for (const h of (hols || []) as Holiday[]) {
        map[ymd(new Date(h.year, h.month - 1, h.day))] = h  // date-keyed for grid overlay
        const key = `${h.year}-${h.month}-${h.day}-${h.name}`
        if (seen.has(key)) continue
        seen.add(key)
        const d = new Date(h.year, h.month - 1, h.day)
        if (d >= new Date(today.getFullYear(), today.getMonth(), today.getDate())) upcoming.push(h)
      }
      upcoming.sort((a, b) =>
        new Date(a.year, a.month - 1, a.day).getTime() - new Date(b.year, b.month - 1, b.day).getTime())
      setHolidays(upcoming)
      setHolidayMap(map)

      setLoading(false)
    }
    load()
  }, [])

  const weekItems = items.filter(i => i.week_number === selectedWeek)
  const mealTypes = ['Breakfast', 'AM Snack', 'Lunch', 'Supper']

  // Persist the cycle anchor (Monday of Week 1) so weeks map to real calendar dates.
  const saveCycleStart = async (value: string) => {
    if (!cycle) return
    setCycleStart(value || null)
    setSavingDate(true)
    await supabase.schema('menumaker').from('menu_cycles')
      .update({ start_date: value || null }).eq('id', cycle.id)
    setSavingDate(false)
  }

  // Calendar date of a given day column in the selected cycle week (null if no anchor set).
  const cellDate = (dayIndex: number): Date | null => {
    if (!cycleStart) return null
    const base = new Date(cycleStart + 'T12:00:00')
    base.setDate(base.getDate() + (selectedWeek - 1) * 7 + dayIndex)
    return base
  }
  const holidayFor = (dayIndex: number): Holiday | null => {
    const d = cellDate(dayIndex)
    return d ? holidayMap[ymd(d)] ?? null : null
  }
  // A meal slot is blocked on a short day when its (default) start time is at/after close.
  const slotClosed = (h: Holiday | null, mealType: string): boolean =>
    !!h && h.type === 'short_day' && !!h.close_time &&
    (SLOT_TIMES[mealType] ?? '99:99') >= h.close_time.slice(0, 5)

  if (loading) return (
    <div style={{ padding: 40, fontFamily: "'DM Sans', sans-serif", color: '#888' }}>
      Loading menu...
    </div>
  )

  if (!cycle) return (
    <div style={{ padding: 40, fontFamily: "'DM Sans', sans-serif", color: '#888' }}>
      No active menu cycle found.
    </div>
  )

  return (
    <div style={{ padding: '28px 32px', fontFamily: "'DM Sans', sans-serif", background: '#f4f6f4', minHeight: '100vh' }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Serif+Display&display=swap" rel="stylesheet"/>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 26, color: '#0a3320', marginBottom: 4 }}>
            Menu Planner
          </div>
          <div style={{ fontSize: 12, color: '#888' }}>
            {cycle.name} · {totalWeeks}-week cycle · Child Program
            <span style={{
              marginLeft: 8, fontSize: 10, padding: '2px 8px', borderRadius: 4,
              background: cycle.status === 'approved' ? '#f0fff4' : '#fff8f0',
              color: cycle.status === 'approved' ? '#0f4c35' : '#b45309',
              fontWeight: 600, textTransform: 'uppercase',
            }}>
              {cycle.status}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#888' }}>
            Cycle starts (Week 1 Mon):
            <input type="date" value={cycleStart ?? ''} onChange={e => saveCycleStart(e.target.value)}
              style={{
                padding: '6px 8px', borderRadius: 8, border: '1px solid #d0d5d0',
                fontSize: 12, fontFamily: 'inherit', color: '#333',
              }} />
            {savingDate && <span style={{ fontSize: 10, color: '#aaa' }}>saving…</span>}
          </label>
          <button onClick={handlePrint} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 16px', borderRadius: 8,
            border: '1px solid #0f4c35', background: '#0f4c35',
            color: '#fff', fontSize: 12, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit',
          }}>
            🖨️ Print Week {selectedWeek}
          </button>
        </div>
      </div>

      {/* Week selector */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {Array.from({ length: totalWeeks }, (_, i) => i + 1).map(w => (
          <button
            key={w}
            onClick={() => setSelectedWeek(w)}
            style={{
              padding: '8px 20px', borderRadius: 8, cursor: 'pointer',
              border: `1.5px solid ${selectedWeek === w ? '#0f4c35' : '#d0d5d0'}`,
              background: selectedWeek === w ? '#0f4c35' : '#fff',
              color: selectedWeek === w ? '#fff' : '#555',
              fontSize: 13, fontWeight: selectedWeek === w ? 600 : 400,
              fontFamily: 'inherit',
            }}
          >
            Week {w}
          </button>
        ))}

        {/* Meal type legend */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, alignItems: 'center' }}>
          {mealTypes.map(mt => (
            <div key={mt} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: MEAL_COLORS[mt]?.dot || '#ccc' }} />
              <span style={{ fontSize: 11, color: '#666' }}>{MEAL_ICONS[mt]} {mt}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Upcoming closures (holidays / short days) — planning awareness */}
      {holidays.length > 0 && (
        <div style={{
          marginBottom: 20, padding: '12px 16px', borderRadius: 10,
          background: '#fff8f0', border: '1px solid #fcd9b6',
          display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center',
        }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#b45309', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            ⚠️ Upcoming closures
          </span>
          {holidays.slice(0, 10).map(h => {
            const isShort = h.type === 'short_day'
            return (
              <div key={`${h.year}-${h.month}-${h.day}-${h.name}`} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '4px 10px', borderRadius: 6,
                background: isShort ? '#fffbeb' : '#fff1f1',
                border: `1px solid ${isShort ? '#fde68a' : '#fbc5c5'}`,
              }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: isShort ? '#92400e' : '#b91c1c' }}>
                  {MONTH_LABELS[h.month]} {h.day}
                </span>
                <span style={{ fontSize: 11, color: '#555' }}>{h.name}</span>
                <span style={{
                  fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em',
                  padding: '1px 6px', borderRadius: 4,
                  background: isShort ? '#fde68a' : '#fbc5c5',
                  color: isShort ? '#92400e' : '#b91c1c',
                }}>
                  {isShort ? `Short · closes ${h.close_time ? h.close_time.slice(0, 5) : '—'}` : 'Closed'}
                </span>
              </div>
            )
          })}
          {holidays.length > 10 && (
            <span style={{ fontSize: 11, color: '#aaa' }}>+{holidays.length - 10} more</span>
          )}
        </div>
      )}

      {/* Grid: days × meal types */}
      <div style={{ display: 'grid', gridTemplateColumns: '80px repeat(5, 1fr)', gap: 8 }}>

        {/* Column headers (days) */}
        <div />
        {DAYS.map((day, i) => {
          const h = holidayFor(i)
          const isHoliday = h?.type === 'holiday'
          const isShort = h?.type === 'short_day'
          const d = cellDate(i)
          return (
            <div key={day} style={{
              textAlign: 'center', padding: '8px 4px', borderRadius: 8,
              background: isHoliday ? '#f3f4f6' : isShort ? '#fffbeb' : '#fff',
              border: `1px solid ${isHoliday ? '#d1d5db' : isShort ? '#fde68a' : '#e4e8e4'}`,
            }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: isHoliday ? '#6b7280' : '#0f4c35', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {DAY_SHORT[i]}
              </div>
              <div style={{ fontSize: 10, color: '#aaa' }}>{d ? `${d.getMonth() + 1}/${d.getDate()}` : day}</div>
              {isHoliday && (
                <div title={h?.name} style={{ marginTop: 3, fontSize: 8, fontWeight: 700, letterSpacing: '0.04em', color: '#b91c1c' }}>
                  CLOSED
                </div>
              )}
              {isShort && (
                <div title={h?.name} style={{ marginTop: 3, fontSize: 8, fontWeight: 700, letterSpacing: '0.03em', color: '#92400e' }}>
                  CLOSES {h?.close_time ? h.close_time.slice(0, 5) : '—'}
                </div>
              )}
            </div>
          )
        })}

        {/* Meal type rows */}
        {mealTypes.map(mealType => {
          const colors = MEAL_COLORS[mealType] || { bg: '#f9f9f9', border: '#e0e0e0', label: '#555', dot: '#aaa' }

          return [
            <div key={`label-${mealType}`} style={{
              display: 'flex', flexDirection: 'column', justifyContent: 'center',
              alignItems: 'center', padding: '8px 4px',
              background: colors.bg, borderRadius: 8,
              border: `1px solid ${colors.border}`,
            }}>
              <div style={{ fontSize: 16 }}>{MEAL_ICONS[mealType]}</div>
              <div style={{ fontSize: 9, fontWeight: 600, color: colors.label, textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center', marginTop: 2 }}>
                {mealType}
              </div>
            </div>,

            ...DAYS.map((_, di) => {
              const dayNum = di + 1
              const cellItems = weekItems
                .filter(i => i.day_of_week === dayNum && i.meal_type === mealType)
                .sort((a, b) => a.sort_order - b.sort_order)

              const h = holidayFor(di)
              const closed = h?.type === 'holiday' || slotClosed(h, mealType)
              if (closed) {
                const isHoliday = h?.type === 'holiday'
                return (
                  <div key={`${mealType}-${dayNum}`} title={h?.name ?? ''} style={{
                    background: isHoliday ? '#f3f4f6' : '#fff8ec', borderRadius: 8,
                    border: `1px dashed ${isHoliday ? '#d1d5db' : '#fcd9b6'}`,
                    padding: '10px 12px', minHeight: 80,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <span style={{ fontSize: 14, opacity: 0.5 }}>{isHoliday ? '🚫' : '🌙'}</span>
                    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.04em', marginTop: 3, color: isHoliday ? '#b91c1c' : '#92400e' }}>
                      {isHoliday ? 'CLOSED' : `AFTER ${h?.close_time ? h.close_time.slice(0, 5) : 'CLOSE'}`}
                    </span>
                  </div>
                )
              }

              return (
                <div key={`${mealType}-${dayNum}`} style={{
                  background: '#fff', borderRadius: 8,
                  border: `1px solid ${cellItems.length ? colors.border : '#eee'}`,
                  padding: '10px 12px',
                  minHeight: 80,
                }}>
                  {cellItems.length === 0 ? (
                    <div style={{ fontSize: 11, color: '#ddd', textAlign: 'center', marginTop: 12 }}>—</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      {cellItems.map((item, idx) => (
                        <div key={item.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 5 }}>
                          <div style={{
                            width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
                            background: idx === 0 ? colors.dot : '#ddd',
                            marginTop: 5,
                          }} />
                          <span style={{
                            fontSize: 11,
                            color: item.recipe_id ? '#0f4c35' : '#333',
                            fontWeight: item.recipe_id ? 600 : 400,
                            lineHeight: 1.35,
                          }}>
                            {item.item_text}
                            {item.recipe_id && (
                              <span style={{ fontSize: 9, marginLeft: 4, color: '#0f4c35', opacity: 0.6 }}>●</span>
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })
          ]
        })}
      </div>

      {/* Summary bar */}
      <div style={{
        marginTop: 20, padding: '12px 20px', borderRadius: 10,
        background: '#fff', border: '1px solid #e8ece9',
        display: 'flex', gap: 24, alignItems: 'center',
      }}>
        <div style={{ fontSize: 11, color: '#888' }}>Week {selectedWeek} summary:</div>
        {mealTypes.map(mt => {
          const count = weekItems.filter(i => i.meal_type === mt).length
          const days = new Set(weekItems.filter(i => i.meal_type === mt).map(i => i.day_of_week)).size
          return (
            <div key={mt} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: MEAL_COLORS[mt]?.dot || '#ccc' }} />
              <span style={{ fontSize: 12, color: '#555' }}>
                {MEAL_ICONS[mt]} <strong>{count}</strong> items · {days} days
              </span>
            </div>
          )
        })}
        <div style={{ marginLeft: 'auto', fontSize: 11, color: '#aaa' }}>
          ● linked recipe &nbsp;· &nbsp;plain text items shown without dot
        </div>
      </div>
    </div>
  )
}
