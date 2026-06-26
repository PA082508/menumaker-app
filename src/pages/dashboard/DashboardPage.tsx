import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useOrg } from '@/contexts/OrgContext'
import { format } from 'date-fns'
import ActionItemsWidget from '@/components/dashboard/ActionItemsWidget'
import OrganizationDashboard from './OrganizationDashboard'

interface DashboardStats {
  totalRecipes: number
  activeRecipes: number
  pendingRecipes: number
  currentCycle: { id: string; name: string; status: string } | null
  upcomingHolidays: Array<{ name: string; date: string; type: string }>
  sodiumFlags: number
  centers: Array<{ name: string; slug: string }>
}

interface TodayMenuItem {
  meal_type: string
  meal_order: number
  items: string[]
}

// Anchor: week of Jan 6, 2026 = cycle week 2
const ANCHOR_DATE = new Date(2026, 0, 6) // Jan 6 2026 (Monday)
const ANCHOR_CYCLE_WEEK = 2
const TOTAL_WEEKS = 4

function getCycleWeek(date: Date): number {
  const msPerWeek = 7 * 24 * 60 * 60 * 1000
  const monday = new Date(date)
  const day = monday.getDay()
  const diff = day === 0 ? -6 : 1 - day
  monday.setDate(monday.getDate() + diff)
  monday.setHours(0, 0, 0, 0)
  const weeksSinceAnchor = Math.round((monday.getTime() - ANCHOR_DATE.getTime()) / msPerWeek)
  const cycleWeek = ((weeksSinceAnchor + ANCHOR_CYCLE_WEEK - 1) % TOTAL_WEEKS + TOTAL_WEEKS) % TOTAL_WEEKS + 1
  return cycleWeek
}

function getDayOfWeek(date: Date): number {
  const day = date.getDay()
  return day === 0 ? 7 : day // 1=Mon ... 5=Fri, 6=Sat, 7=Sun
}

const MEAL_COLORS: Record<string, { bg: string; border: string; label: string; dot: string; icon: string }> = {
  Breakfast: { bg: '#fffbeb', border: '#fde68a', label: '#92400e', dot: '#f59e0b', icon: '🌅' },
  'AM Snack': { bg: '#f0fdf4', border: '#bbf7d0', label: '#166534', dot: '#22c55e', icon: '🍎' },
  Lunch:     { bg: '#eff6ff', border: '#bfdbfe', label: '#1e40af', dot: '#3b82f6', icon: '🍽️' },
  Supper:    { bg: '#fdf4ff', border: '#e9d5ff', label: '#6b21a8', dot: '#a855f7', icon: '🌙' },
}

// Route entry: org admins viewing "Organization" get the org-wide dashboard;
// otherwise the normal single-center dashboard. Branching in a thin wrapper
// keeps CenterDashboard's hooks from running in org view.
export default function DashboardPage() {
  const { viewMode } = useOrg()
  if (viewMode === 'org') return <OrganizationDashboard />
  return <CenterDashboard />
}

function CenterDashboard() {
  const { user, role } = useAuth()
  const { org } = useOrg()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [todayMenu, setTodayMenu] = useState<TodayMenuItem[]>([])
  const [cycleWeek, setCycleWeek] = useState(1)
  const [loading, setLoading] = useState(true)
  const today = new Date()
  const dayOfWeek = getDayOfWeek(today) // 1-7

  useEffect(() => {
    const week = getCycleWeek(today)
    setCycleWeek(week)

    const fetchAll = async () => {
      // Recipes
      const { data: recipes } = await supabase
        .schema('menumaker').from('recipes')
        .select('id, is_active, source_notes')
        .eq('program', 'child')

      // Current menu cycle
      const { data: cycles } = await supabase
        .schema('menumaker').from('menu_cycles')
        .select('id, name, status')
        .eq('program', 'child')
        .order('created_at', { ascending: false })
        .limit(1)

      const cycleId = cycles?.[0]?.id

      // Upcoming holidays — the table has one row per center, so fetch this year
      // + next (for the Dec→Jan rollover), dedup, then keep only today..+45 days.
      const yr = today.getFullYear()
      const { data: holRows } = await supabase
        .schema('menumaker').from('holidays')
        .select('name, day, month, year, type')
        .in('year', [yr, yr + 1])
        .order('year').order('month').order('day')
      const holStart = new Date(yr, today.getMonth(), today.getDate())
      const holEnd = new Date(holStart); holEnd.setDate(holEnd.getDate() + 45)
      type HolRow = { name: string; day: number; month: number; year: number; type: string }
      const seenHol = new Set<string>()
      const holidays = ((holRows ?? []) as HolRow[]).filter((h) => {
        const key = `${h.year}-${h.month}-${h.day}-${h.name}`
        if (seenHol.has(key)) return false
        seenHol.add(key)
        const hd = new Date(h.year, h.month - 1, h.day)
        return hd >= holStart && hd <= holEnd
      }).slice(0, 5)

      // Sodium flags
      const { data: sodiumData } = await supabase
        .schema('menumaker').from('product_nutrients')
        .select('id').eq('sodium_flag', true)

      // Centers
      const { data: centers } = await supabase
        .schema('menumaker').from('centers')
        .select('name, slug').eq('is_active', true)

      // Today's menu — only on weekdays
      if (cycleId && dayOfWeek >= 1 && dayOfWeek <= 5) {
        const { data: menuData } = await supabase
          .schema('menumaker')
          .from('menu_items')
          .select('item_text, sort_order, meal_types:meal_type_id(label, sort_order)')
          .eq('cycle_id', cycleId)
          .eq('week_number', week)
          .eq('day_of_week', dayOfWeek)
          .order('sort_order')

        if (menuData) {
          const grouped: Record<string, { order: number; items: string[] }> = {}
          menuData.forEach((d: any) => {
            const label = d.meal_types?.label || 'Other'
            const order = d.meal_types?.sort_order || 99
            if (!grouped[label]) grouped[label] = { order, items: [] }
            grouped[label].items.push(d.item_text)
          })
          const sorted = Object.entries(grouped)
            .sort((a, b) => a[1].order - b[1].order)
            .map(([meal_type, val]) => ({
              meal_type,
              meal_order: val.order,
              items: val.items,
            }))
          setTodayMenu(sorted)
        }
      }

      setStats({
        totalRecipes: recipes?.length || 0,
        activeRecipes: recipes?.filter(r => r.is_active).length || 0,
        pendingRecipes: recipes?.filter(r => r.source_notes?.includes('pending')).length || 0,
        currentCycle: cycles?.[0] || null,
        upcomingHolidays: holidays?.map(h => ({
          name: h.name,
          date: `${h.month}/${h.day}/${h.year}`,
          type: h.type,
        })) || [],
        sodiumFlags: sodiumData?.length || 0,
        centers: centers || [],
      })
      setLoading(false)
    }

    fetchAll()
  }, [])

  if (loading) {
    return (
      <div style={{ padding: 40, fontFamily: "'DM Sans', sans-serif", color: '#888' }}>
        Loading dashboard...
      </div>
    )
  }

  const isWeekend = dayOfWeek > 5

  return (
    <div style={{ padding: '32px 40px', fontFamily: "'DM Sans', sans-serif", maxWidth: 1200 }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Serif+Display&display=swap" rel="stylesheet"/>

      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 13, color: '#888', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 500, marginBottom: 4 }}>
          {format(today, 'EEEE, MMMM d, yyyy')}
        </div>
        <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 30, color: '#0a3320', lineHeight: 1.1 }}>
          Good {today.getHours() < 12 ? 'morning' : today.getHours() < 17 ? 'afternoon' : 'evening'}
        </div>
        <div style={{ fontSize: 14, color: '#666', marginTop: 4 }}>
          {org?.name ?? 'ClickClaim'} · {role ? role.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()) : ''}
        </div>
      </div>

      {/* Stats cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 28 }}>
        {[
          { label: 'Active Recipes', value: stats?.activeRecipes, sub: `${stats?.pendingRecipes} pending RecipeAgent`, color: '#0f4c35', bg: '#f0fff4', icon: '🍳' },
          { label: 'Menu Cycle', value: stats?.currentCycle?.status === 'approved' ? '✓ Active' : 'Draft', sub: stats?.currentCycle?.name || 'No cycle', color: stats?.currentCycle?.status === 'approved' ? '#0f4c35' : '#e67e22', bg: stats?.currentCycle?.status === 'approved' ? '#f0fff4' : '#fff8f0', icon: '📅' },
          { label: 'Sodium Flags', value: stats?.sodiumFlags, sub: 'recipes > 400mg/100g', color: stats?.sodiumFlags && stats.sodiumFlags > 0 ? '#c0392b' : '#0f4c35', bg: stats?.sodiumFlags && stats.sodiumFlags > 0 ? '#fff0f0' : '#f0fff4', icon: '⚠️' },
          { label: 'Centers', value: stats?.centers.length, sub: stats?.centers.map(c => c.name.replace('Play Academy ', '')).join(' · '), color: '#1a4a7a', bg: '#f0f6ff', icon: '🏫' },
        ].map((card, i) => (
          <div key={i} style={{ background: card.bg, border: `1px solid ${card.color}20`, borderRadius: 14, padding: '20px', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 16, right: 16, fontSize: 24, opacity: 0.3 }}>{card.icon}</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#666', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>{card.label}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: card.color, lineHeight: 1, marginBottom: 6 }}>{card.value}</div>
            <div style={{ fontSize: 11, color: '#888' }}>{card.sub}</div>
          </div>
        ))}
      </div>

      {/* ── TODAY'S MENU ── */}
      <div style={{ background: '#fff', border: '1px solid #e8ece9', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', marginBottom: 20 }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>🍴</span>
            <span style={{ fontWeight: 600, fontSize: 14, color: '#1a1a1a' }}>Today's Menu</span>
            <span style={{ fontSize: 11, color: '#888' }}>— {format(today, 'EEEE, MMMM d')}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 6,
              background: '#f0fff4', color: '#0f4c35', border: '1px solid #c0e0c0',
            }}>
              Cycle Week {cycleWeek}
            </span>
            <span style={{
              fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 6,
              background: '#f0f6ff', color: '#1a4a7a', border: '1px solid #bfdbfe',
            }}>
              Child Program
            </span>
          </div>
        </div>

        {isWeekend ? (
          <div style={{ padding: '24px 20px', color: '#aaa', fontSize: 13, textAlign: 'center' }}>
            🏖️ Weekend — no service today
          </div>
        ) : todayMenu.length === 0 ? (
          <div style={{ padding: '24px 20px', color: '#aaa', fontSize: 13, textAlign: 'center' }}>
            No menu data for today
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0 }}>
            {todayMenu.map((meal, i) => {
              const colors = MEAL_COLORS[meal.meal_type] || { bg: '#f9f9f9', border: '#e0e0e0', label: '#555', dot: '#aaa', icon: '🍴' }
              return (
                <div key={meal.meal_type} style={{
                  padding: '16px 20px',
                  borderRight: i < todayMenu.length - 1 ? '1px solid #f0f0f0' : 'none',
                  background: colors.bg,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                    <span style={{ fontSize: 14 }}>{colors.icon}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: colors.label, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                      {meal.meal_type}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {meal.items.map((item, idx) => (
                      <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                        <div style={{ width: 5, height: 5, borderRadius: '50%', background: idx === 0 ? colors.dot : '#ddd', flexShrink: 0, marginTop: 5 }} />
                        <span style={{ fontSize: 12, color: '#333', lineHeight: 1.35, fontWeight: idx === 0 ? 500 : 400 }}>
                          {item}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Two column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

        {/* Upcoming Holidays */}
        <div style={{ background: '#fff', border: '1px solid #e8ece9', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>🗓️</span>
            <span style={{ fontWeight: 600, fontSize: 14, color: '#1a1a1a' }}>Upcoming Holidays</span>
          </div>
          <div style={{ padding: '8px 0' }}>
            {stats?.upcomingHolidays.length === 0 ? (
              <div style={{ padding: '16px 20px', color: '#aaa', fontSize: 13 }}>No holidays in the next 45 days</div>
            ) : (
              stats?.upcomingHolidays.map((h, i) => (
                <div key={i} style={{ padding: '10px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: i < (stats.upcomingHolidays.length - 1) ? '1px solid #f5f5f5' : 'none' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#1a1a1a' }}>{h.name}</div>
                    <div style={{ fontSize: 11, color: '#888' }}>{h.date}</div>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 6, background: h.type === 'holiday' ? '#fff0f0' : '#fff8f0', color: h.type === 'holiday' ? '#c0392b' : '#e67e22', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {h.type === 'holiday' ? 'Closed' : 'Short Day'}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Action Required — live action items (feature C) */}
        <ActionItemsWidget />

        {/* Centers Overview */}
        <div style={{ background: '#fff', border: '1px solid #e8ece9', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', gridColumn: '1 / -1' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #f0f0f0', fontWeight: 600, fontSize: 14, color: '#1a1a1a' }}>
            🏫 Centers — Quick Overview
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0 }}>
            {stats?.centers.map((center, i) => (
              <div key={i} style={{ padding: '20px', borderRight: i < (stats.centers.length - 1) ? '1px solid #f0f0f0' : 'none' }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: '#f0fff4', border: '1px solid #c0e0c0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, marginBottom: 10 }}>🏫</div>
                <div style={{ fontWeight: 600, color: '#0a3320', fontSize: 14 }}>{center.name}</div>
                <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{center.slug.charAt(0).toUpperCase() + center.slug.slice(1)} Center</div>
                <div style={{ marginTop: 10, display: 'flex', gap: 6 }}>
                  {['Child Menu', 'Infant Menu'].map(tag => (
                    <span key={tag} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, background: '#f0f0f0', color: '#666' }}>{tag}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function ActionItem({ icon, title, sub, priority }: { icon: string; title: string; sub: string; priority: 'high' | 'medium' | 'low' }) {
  const colors = {
    high:   { bg: '#fff0f0', dot: '#c0392b' },
    medium: { bg: '#fff8f0', dot: '#e67e22' },
    low:    { bg: '#fffef0', dot: '#f39c12' },
  }
  const c = colors[priority]
  return (
    <div style={{ padding: '12px 20px', display: 'flex', gap: 12, alignItems: 'flex-start', background: c.bg, borderBottom: '1px solid #f5f5f5' }}>
      <span style={{ fontSize: 16, marginTop: 1 }}>{icon}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: '#1a1a1a' }}>{title}</div>
        <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{sub}</div>
      </div>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: c.dot, marginTop: 4, flexShrink: 0 }}/>
    </div>
  )
}