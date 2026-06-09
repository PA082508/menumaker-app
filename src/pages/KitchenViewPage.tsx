import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { format, addDays } from 'date-fns'

// ─── Cycle week logic (anchor: Jan 6, 2026 = week 2) ─────────────────────────
const ANCHOR_DATE = new Date(2026, 0, 6)
const ANCHOR_CYCLE_WEEK = 2
const TOTAL_WEEKS = 4

function getCycleWeek(date: Date): number {
  const msPerWeek = 7 * 24 * 60 * 60 * 1000
  const monday = new Date(date)
  const day = monday.getDay()
  monday.setDate(monday.getDate() + (day === 0 ? -6 : 1 - day))
  monday.setHours(0, 0, 0, 0)
  const weeksSince = Math.round((monday.getTime() - ANCHOR_DATE.getTime()) / msPerWeek)
  return ((weeksSince + ANCHOR_CYCLE_WEEK - 1) % TOTAL_WEEKS + TOTAL_WEEKS) % TOTAL_WEEKS + 1
}

function getDayOfWeek(date: Date): number {
  const d = date.getDay()
  return d === 0 ? 7 : d
}

function isWeekday(date: Date): boolean {
  const d = date.getDay()
  return d >= 1 && d <= 5
}

// ─── Attendance (Pearl static averages) ──────────────────────────────────────
const ATTENDANCE: Record<string, Record<string, number>> = {
  Breakfast:   { '1-2y': 54, '3-5y': 91, '6-12y': 0  },
  'AM Snack':  { '1-2y': 54, '3-5y': 91, '6-12y': 0  },
  Lunch:       { '1-2y': 54, '3-5y': 91, '6-12y': 0  },
  Supper:      { '1-2y': 54, '3-5y': 91, '6-12y': 63 },
}

function totalForMeal(mealType: string): number {
  const att = ATTENDANCE[mealType] || {}
  return Object.values(att).reduce((a, b) => a + b, 0)
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface DayMenu {
  date: Date
  cycleWeek: number
  dayOfWeek: number
  meals: MealBlock[]
}

interface MealBlock {
  mealType: string
  mealOrder: number
  items: string[]
  totalCount: number
  status: 'idle' | 'prep' | 'ready'
}

type Period = 'today' | 'tomorrow' | '2days' | '3days' | 'week'

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: 'today',    label: 'Today' },
  { value: 'tomorrow', label: 'Tomorrow' },
  { value: '2days',    label: '2 Days' },
  { value: '3days',    label: '3 Days' },
  { value: 'week',     label: 'This Week' },
]

const MEAL_COLORS: Record<string, { bg: string; border: string; header: string; dot: string; icon: string }> = {
  Breakfast:  { bg: '#fffbeb', border: '#fde68a', header: '#92400e', dot: '#f59e0b', icon: '🌅' },
  'AM Snack': { bg: '#f0fdf4', border: '#bbf7d0', header: '#166534', dot: '#22c55e', icon: '🍎' },
  Lunch:      { bg: '#eff6ff', border: '#bfdbfe', header: '#1e40af', dot: '#3b82f6', icon: '🍽️' },
  Supper:     { bg: '#fdf4ff', border: '#e9d5ff', header: '#6b21a8', dot: '#a855f7', icon: '🌙' },
}

const STATUS_CONFIG = {
  idle:  { label: 'Not started', bg: '#f5f5f5', color: '#999',    next: 'prep'  as const },
  prep:  { label: 'In prep',     bg: '#fff8f0', color: '#e67e22', next: 'ready' as const },
  ready: { label: '✓ Ready',     bg: '#f0fff4', color: '#0f4c35', next: 'idle'  as const },
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function KitchenViewPage() {
  const [period, setPeriod]       = useState<Period>('2days')
  const [days, setDays]           = useState<DayMenu[]>([])
  const [loading, setLoading]     = useState(true)
  const [cycleId, setCycleId]     = useState<string | null>(null)
  const [statuses, setStatuses]   = useState<Record<string, 'idle' | 'prep' | 'ready'>>({})
  const [batchOpen, setBatchOpen] = useState<string | null>(null) // key = "mealType-date"

  // Get dates for selected period (weekdays only)
  function getDates(p: Period): Date[] {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const candidates: Date[] = []
    for (let i = 0; i < 14; i++) {
      const d = addDays(today, i)
      if (isWeekday(d)) candidates.push(d)
      if (p === 'today'    && candidates.length === 1) break
      if (p === 'tomorrow' && i > 0 && candidates.length === 1) break
      if (p === '2days'    && candidates.length === 2) break
      if (p === '3days'    && candidates.length === 3) break
      if (p === 'week'     && candidates.length === 5) break
    }
    // tomorrow: skip today
    if (p === 'tomorrow') return candidates.filter((_, i) => i > 0).slice(0, 1)
    return candidates
  }

  useEffect(() => {
    const init = async () => {
      const { data: cycles } = await supabase
        .schema('menumaker').from('menu_cycles')
        .select('id').eq('program', 'child')
        .order('created_at', { ascending: false }).limit(1)
      setCycleId(cycles?.[0]?.id || null)
      setLoading(false)
    }
    init()
  }, [])

  useEffect(() => {
    if (!cycleId) return
    const load = async () => {
      setLoading(true)
      const dates = getDates(period)
      const results: DayMenu[] = []

      for (const date of dates) {
        const dow = getDayOfWeek(date)
        const cw  = getCycleWeek(date)

        const { data } = await supabase
          .schema('menumaker').from('menu_items')
          .select('item_text, sort_order, meal_types:meal_type_id(label, sort_order)')
          .eq('cycle_id', cycleId)
          .eq('week_number', cw)
          .eq('day_of_week', dow)
          .order('sort_order')

        const grouped: Record<string, { order: number; items: string[] }> = {}
        ;(data || []).forEach((d: any) => {
          const lbl = d.meal_types?.label || 'Other'
          const ord = d.meal_types?.sort_order || 99
          if (!grouped[lbl]) grouped[lbl] = { order: ord, items: [] }
          grouped[lbl].items.push(d.item_text)
        })

        const meals: MealBlock[] = Object.entries(grouped)
          .sort((a, b) => a[1].order - b[1].order)
          .map(([mealType, val]) => ({
            mealType,
            mealOrder: val.order,
            items: val.items,
            totalCount: totalForMeal(mealType),
            status: 'idle',
          }))

        results.push({ date, cycleWeek: cw, dayOfWeek: dow, meals })
      }

      setDays(results)
      setStatuses({})
      setLoading(false)
    }
    load()
  }, [cycleId, period])

  const statusKey = (date: Date, mealType: string) =>
    `${format(date, 'yyyy-MM-dd')}-${mealType}`

  const toggleStatus = (date: Date, mealType: string) => {
    const key = statusKey(date, mealType)
    const cur = statuses[key] || 'idle'
    setStatuses(s => ({ ...s, [key]: STATUS_CONFIG[cur].next }))
  }

  const toggleBatch = (date: Date, mealType: string) => {
    const key = statusKey(date, mealType)
    setBatchOpen(b => b === key ? null : key)
  }

  if (loading) return (
    <div style={{ padding: 40, fontFamily: "'DM Sans', sans-serif", color: '#888' }}>Loading kitchen view...</div>
  )

  return (
    <div style={{ padding: '24px 32px', fontFamily: "'DM Sans', sans-serif", background: '#f4f6f4', minHeight: '100vh' }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Serif+Display&display=swap" rel="stylesheet"/>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 26, color: '#0a3320', marginBottom: 2 }}>
            Kitchen View
          </div>
          <div style={{ fontSize: 12, color: '#888' }}>
            Pearl Center · {format(new Date(), 'EEEE, MMMM d, yyyy')}
          </div>
        </div>

        {/* Period selector */}
        <div style={{ display: 'flex', gap: 6, background: '#fff', padding: '6px', borderRadius: 10, border: '1px solid #e0e0e0' }}>
          {PERIOD_OPTIONS.map(opt => (
            <button key={opt.value} onClick={() => setPeriod(opt.value)} style={{
              padding: '6px 14px', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit',
              border: 'none',
              background: period === opt.value ? '#0f4c35' : 'transparent',
              color: period === opt.value ? '#fff' : '#555',
              fontSize: 12, fontWeight: period === opt.value ? 600 : 400,
              transition: 'all 0.15s',
            }}>{opt.label}</button>
          ))}
        </div>
      </div>

      {/* Days */}
      {days.map(day => (
        <div key={format(day.date, 'yyyy-MM-dd')} style={{ marginBottom: 24 }}>

          {/* Day header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <div style={{
              fontFamily: "'DM Serif Display', serif",
              fontSize: 18, color: '#0a3320',
            }}>
              {format(day.date, 'EEEE, MMMM d')}
            </div>
            <div style={{
              fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 6,
              background: '#f0fff4', color: '#0f4c35', border: '1px solid #c0e0c0',
            }}>
              Cycle Week {day.cycleWeek}
            </div>
            {/* Day progress */}
            {day.meals.length > 0 && (() => {
              const ready = day.meals.filter(m => (statuses[statusKey(day.date, m.mealType)] || 'idle') === 'ready').length
              return (
                <div style={{ fontSize: 11, color: '#888', marginLeft: 'auto' }}>
                  {ready}/{day.meals.length} meals ready
                  <div style={{ display: 'inline-block', marginLeft: 8, width: 60, height: 6, borderRadius: 3, background: '#e0e0e0', verticalAlign: 'middle' }}>
                    <div style={{ width: `${(ready / day.meals.length) * 100}%`, height: '100%', borderRadius: 3, background: '#0f4c35', transition: 'width 0.3s' }} />
                  </div>
                </div>
              )
            })()}
          </div>

          {/* Meal blocks */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            {day.meals.map(meal => {
              const key    = statusKey(day.date, meal.mealType)
              const status = statuses[key] || 'idle'
              const sc     = STATUS_CONFIG[status]
              const mc     = MEAL_COLORS[meal.mealType] || { bg: '#f9f9f9', border: '#e0e0e0', header: '#555', dot: '#aaa', icon: '🍴' }
              const att    = ATTENDANCE[meal.mealType] || {}
              const isBatchOpen = batchOpen === key

              return (
                <div key={meal.mealType} style={{
                  background: '#fff', borderRadius: 12,
                  border: `1px solid ${status === 'ready' ? '#c0e0c0' : status === 'prep' ? '#fde68a' : '#e8e8e8'}`,
                  overflow: 'hidden',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                }}>
                  {/* Meal type header */}
                  <div style={{ padding: '10px 14px', background: mc.bg, borderBottom: `1px solid ${mc.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 14 }}>{mc.icon}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: mc.header, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                        {meal.mealType}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: mc.header }}>
                      {meal.totalCount} <span style={{ fontSize: 10, fontWeight: 400, color: '#888' }}>portions</span>
                    </div>
                  </div>

                  {/* Menu items */}
                  <div style={{ padding: '12px 14px' }}>
                    {meal.items.map((item, idx) => (
                      <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 5 }}>
                        <div style={{ width: 5, height: 5, borderRadius: '50%', background: idx === 0 ? mc.dot : '#ddd', flexShrink: 0, marginTop: 5 }} />
                        <span style={{ fontSize: 12, color: '#333', lineHeight: 1.4, fontWeight: idx === 0 ? 500 : 400 }}>{item}</span>
                      </div>
                    ))}
                  </div>

                  {/* Attendance breakdown */}
                  <div style={{ padding: '0 14px 10px', display: 'flex', gap: 8 }}>
                    {Object.entries(att).filter(([, v]) => v > 0).map(([ag, cnt]) => (
                      <div key={ag} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: '#f0f0f0', color: '#666' }}>
                        {ag}: <strong>{cnt}</strong>
                      </div>
                    ))}
                  </div>

                  {/* Actions */}
                  <div style={{ padding: '10px 14px', borderTop: '1px solid #f0f0f0', display: 'flex', gap: 8 }}>
                    {/* Status toggle */}
                    <button onClick={() => toggleStatus(day.date, meal.mealType)} style={{
                      flex: 1, padding: '7px 0', borderRadius: 7, cursor: 'pointer',
                      border: `1px solid ${sc.color}40`,
                      background: sc.bg, color: sc.color,
                      fontSize: 11, fontWeight: 600, fontFamily: 'inherit',
                      transition: 'all 0.15s',
                    }}>
                      {sc.label}
                    </button>

                    {/* Batch sheet toggle */}
                    <button onClick={() => toggleBatch(day.date, meal.mealType)} style={{
                      padding: '7px 10px', borderRadius: 7, cursor: 'pointer',
                      border: `1px solid ${isBatchOpen ? '#0f4c35' : '#e0e0e0'}`,
                      background: isBatchOpen ? '#0f4c35' : '#fff',
                      color: isBatchOpen ? '#fff' : '#555',
                      fontSize: 11, fontFamily: 'inherit',
                      transition: 'all 0.15s',
                    }}>
                      📋
                    </button>
                  </div>

                  {/* Inline batch sheet */}
                  {isBatchOpen && (
                    <BatchSheetInline
                      cycleId={cycleId!}
                      cycleWeek={day.cycleWeek}
                      dayOfWeek={day.dayOfWeek}
                      mealType={meal.mealType}
                      totalCount={meal.totalCount}
                      attendance={att}
                    />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}

      {days.length === 0 && !loading && (
        <div style={{ padding: 40, textAlign: 'center', color: '#aaa', fontSize: 14 }}>
          No menu data available for selected period
        </div>
      )}
    </div>
  )
}

// ─── Inline Batch Sheet ───────────────────────────────────────────────────────

interface BatchIngredient {
  name: string
  quantity: number
  unit: string
  notes: string | null
}

function BatchSheetInline({
  cycleId, cycleWeek, dayOfWeek, mealType, totalCount, attendance,
}: {
  cycleId: string
  cycleWeek: number
  dayOfWeek: number
  mealType: string
  totalCount: number
  attendance: Record<string, number>
}) {
  const [recipes, setRecipes]           = useState<Array<{ id: string; name: string; base_yield: number }>>([])
  const [selectedRecipe, setSelected]   = useState<string | null>(null)
  const [ingredients, setIngredients]   = useState<BatchIngredient[]>([])
  const [loadingBatch, setLoadingBatch] = useState(false)

  useEffect(() => {
    const load = async () => {
      // Get recipe_ids from menu_items for this meal
      const { data: menuItems } = await supabase
        .schema('menumaker').from('menu_items')
        .select('recipe_id, recipes:recipe_id(id, name, base_yield)')
        .eq('cycle_id', cycleId)
        .eq('week_number', cycleWeek)
        .eq('day_of_week', dayOfWeek)
        .not('recipe_id', 'is', null)

      const linked = (menuItems || [])
        .filter((d: any) => d.recipes)
        .map((d: any) => ({
          id: d.recipes.id,
          name: d.recipes.name,
          base_yield: d.recipes.base_yield,
        }))

      // Filter by meal type via meal_type_id join
      const { data: mealTypeData } = await supabase
        .schema('menumaker').from('meal_types')
        .select('id').eq('label', mealType).limit(1)

      const mtId = mealTypeData?.[0]?.id
      if (!mtId) { setRecipes(linked); return }

      const { data: filtered } = await supabase
        .schema('menumaker').from('menu_items')
        .select('recipe_id, recipes:recipe_id(id, name, base_yield)')
        .eq('cycle_id', cycleId)
        .eq('week_number', cycleWeek)
        .eq('day_of_week', dayOfWeek)
        .eq('meal_type_id', mtId)
        .not('recipe_id', 'is', null)

      const result = (filtered || [])
        .filter((d: any) => d.recipes)
        .map((d: any) => ({
          id: d.recipes.id,
          name: d.recipes.name,
          base_yield: d.recipes.base_yield,
        }))

      setRecipes(result)
      if (result.length === 1) setSelected(result[0].id)
    }
    load()
  }, [cycleId, cycleWeek, dayOfWeek, mealType])

  useEffect(() => {
    if (!selectedRecipe) return
    setLoadingBatch(true)
    const load = async () => {
      const { data } = await supabase
        .schema('menumaker').from('recipe_ingredients')
        .select('name_override, quantity, unit, notes, sort_order, products:product_id(name)')
        .eq('recipe_id', selectedRecipe)
        .order('sort_order')

      setIngredients((data || []).map((d: any) => ({
        name: d.name_override || d.products?.name || '—',
        quantity: d.quantity,
        unit: d.unit,
        notes: d.notes,
      })))
      setLoadingBatch(false)
    }
    load()
  }, [selectedRecipe])

  const recipe = recipes.find(r => r.id === selectedRecipe)
  const multiplier = recipe ? totalCount / recipe.base_yield : 1

  function scaleQty(q: number): string {
    const s = q * multiplier
    if (s >= 10) return Math.round(s).toString()
    if (s >= 1)  return (Math.round(s * 4) / 4).toFixed(2).replace(/\.?0+$/, '')
    return (Math.round(s * 100) / 100).toFixed(2).replace(/\.?0+$/, '')
  }

  return (
    <div style={{ borderTop: '2px solid #0f4c35', background: '#f8fffe', padding: '14px' }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#0f4c35', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
        📋 Batch Sheet · {totalCount} portions
      </div>

      {/* Attendance breakdown */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {Object.entries(attendance).filter(([,v]) => v > 0).map(([ag, cnt]) => (
          <div key={ag} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 5, background: '#e0f0e8', color: '#0f4c35', fontWeight: 500 }}>
            {ag}: {cnt}
          </div>
        ))}
      </div>

      {/* Recipe selector if multiple */}
      {recipes.length > 1 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 10, color: '#888', marginBottom: 4 }}>Select recipe:</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {recipes.map(r => (
              <button key={r.id} onClick={() => setSelected(r.id)} style={{
                padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11,
                border: `1px solid ${selectedRecipe === r.id ? '#0f4c35' : '#e0e0e0'}`,
                background: selectedRecipe === r.id ? '#0f4c35' : '#fff',
                color: selectedRecipe === r.id ? '#fff' : '#555',
                fontFamily: 'inherit',
              }}>{r.name}</button>
            ))}
          </div>
        </div>
      )}

      {recipes.length === 0 && (
        <div style={{ fontSize: 11, color: '#aaa', padding: '8px 0' }}>No linked recipes for this meal</div>
      )}

      {selectedRecipe && !loadingBatch && ingredients.length > 0 && recipe && (
        <>
          <div style={{ fontSize: 11, color: '#666', marginBottom: 8 }}>
            <strong style={{ color: '#0f4c35' }}>{recipe.name}</strong>
            {' · '}base {recipe.base_yield} → scaled ×{multiplier.toFixed(2)} → <strong style={{ color: '#0f4c35' }}>{totalCount}</strong>
          </div>
          <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid #d0e8d8' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 60px 70px 80px', background: '#0f4c35', padding: '6px 10px', gap: 6 }}>
              {['Ingredient', `Base`, `→ ${totalCount}`, 'Unit'].map((h, i) => (
                <div key={i} style={{ fontSize: 9, fontWeight: 600, color: '#a8d5b5', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: i > 0 ? 'right' : 'left' }}>{h}</div>
              ))}
            </div>
            {ingredients.map((ing, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 60px 70px 80px', padding: '6px 10px', gap: 6, background: i % 2 === 0 ? '#fff' : '#f5fdf8', borderBottom: i < ingredients.length - 1 ? '1px solid #e8f0e8' : 'none', alignItems: 'center' }}>
                <div style={{ fontSize: 11, color: '#1a1a1a', fontWeight: 500 }}>{ing.name}</div>
                <div style={{ fontSize: 11, color: '#888', textAlign: 'right' }}>{ing.quantity}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#0f4c35', textAlign: 'right' }}>{scaleQty(ing.quantity)}</div>
                <div style={{ fontSize: 11, color: '#666', textAlign: 'right' }}>{ing.unit}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {selectedRecipe && loadingBatch && (
        <div style={{ fontSize: 11, color: '#aaa', padding: '8px 0' }}>Loading ingredients...</div>
      )}

      {selectedRecipe && !loadingBatch && ingredients.length === 0 && (
        <div style={{ fontSize: 11, color: '#e67e22', padding: '8px 0' }}>⏳ No ingredients yet — RecipeAgent pending</div>
      )}
    </div>
  )
}