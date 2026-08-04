// DirectorHome.tsx — role landing page for a center director (Director Desktop).
//
// The director works inside the existing MenuMaker app (no separate portal). This
// is the start page for the director role: big tiles for exactly the sections a
// director owns — Children, Staff, Menu (view-only current menu), Enrollment
// Inbox, Documents — with a live pending counter on the Inbox. Everything else (Budget,
// org admin) is hidden here and in the permission-driven sidebar.

import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { warnIf } from '@/lib/queryError'
import { useAuth } from '@/hooks/useAuth'
import { useOrg } from '@/contexts/OrgContext'
import { DIRECTOR_ALERT_SENDER } from '@/lib/spokenLines'

// Как часто перечитывать тревоги окон. 45 секунд, и это НЕ произвол: ступень
// директора существует, чтобы он пошёл в класс, «пока еда на столах», а окно
// живёт 20-30 минут. Минутная задержка допустима, десятиминутная — уже нет.
//
// Почему опрос, а не Realtime: в публикации `supabase_realtime` состоит ровно
// одна таблица — safepass_sessions. Добавить туда internal_messages значит
// править боевую базу; опрос даёт то же обещание («видно без обновления
// страницы») и не трогает ничего.
const ALERT_POLL_MS = 45000

/** Тревоги старше этого не показываем: к обеду сигнал утреннего снека уже
 *  бесполезен, а красная полоса, которую нельзя отработать, учит её не замечать. */
const ALERT_WINDOW_MS = 3 * 60 * 60 * 1000

const DISMISS_KEY = 'mm_director_alert_seen'
const dismissed = (): string[] => {
  try { return JSON.parse(localStorage.getItem(DISMISS_KEY) || '[]') } catch { return [] }
}
const dismiss = (id: string) => {
  try { localStorage.setItem(DISMISS_KEY, JSON.stringify([id, ...dismissed()].slice(0, 60))) } catch { /* нет хранилища */ }
}

interface WindowAlert { id: string; body: string; created_at: string }

type Tile = {
  to: string
  label: string
  desc: string
  icon: string
  accent: string
  bg: string
  badge?: number
}

export default function DirectorHome() {
  const { user } = useAuth()
  const { org, currentCenter } = useOrg()
  const [pending, setPending] = useState<number | null>(null)
  const today = new Date()

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!org?.id) return
      let q = supabase.schema('menumaker').from('enrollment_submissions')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending')
      q = currentCenter?.id ? q.eq('center_id', currentCenter.id) : q.eq('org_id', org.id)
      const { count } = await q
      if (!cancelled) setPending(count ?? 0)
    })()
    return () => { cancelled = true }
  }, [org?.id, currentCenter?.id])

  // ─── Окна без отметок: тревога 15-й минуты ────────────────────────────────
  // Приходит от планшета класса рельсом internal_messages (роль director +
  // центр). Здесь она попадает НА ГЛАВНУЮ директора, а не только в «Сообщения»:
  // в ящик заходят раз в день, а этот сигнал живёт двадцать минут.
  const [alerts, setAlerts] = useState<WindowAlert[]>([])
  const loadAlerts = useCallback(async () => {
    if (!org?.id) return
    const since = new Date(Date.now() - ALERT_WINDOW_MS).toISOString()
    const { data, error } = await supabase.schema('menumaker')
      .from('internal_messages')
      .select('id, body, created_at')
      .eq('org_id', org.id)
      .eq('recipient_value', 'director')
      .eq('sender_name', DIRECTOR_ALERT_SENDER)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(10)
    // Отказ чтения здесь = «тревог нет» на главной директора. Пустой экран в
    // этом месте — худший вид пустоты, поэтому он обязан оставить след.
    if (warnIf(error, 'DirectorHome/window-alerts')) return
    const seen = new Set(dismissed())
    setAlerts(((data ?? []) as WindowAlert[]).filter(a => !seen.has(a.id)))
  }, [org?.id])

  useEffect(() => {
    loadAlerts()
    const t = setInterval(loadAlerts, ALERT_POLL_MS)
    return () => clearInterval(t)
  }, [loadAlerts])

  const tiles: Tile[] = [
    { to: '/children',         label: 'Children',        desc: 'Roster, enrollment records, add & reactivate', icon: 'ti-baby-carriage', accent: '#0f4c35', bg: '#f0fff4' },
    { to: '/enrollment-inbox', label: 'Enrollment Inbox', desc: 'Review & approve incoming enrollment forms',   icon: 'ti-inbox',         accent: '#1e40af', bg: '#eff6ff', badge: pending ?? undefined },
    { to: '/staff',            label: 'Staff',           desc: 'Teachers & staff records',                     icon: 'ti-id-badge',      accent: '#6b21a8', bg: '#faf5ff' },
    // Menu is view-only for directors (planner belongs to the central kitchen);
    // link straight to the current published menu — no planner tile.
    { to: '/menu/current',     label: 'Current Menu',    desc: "This week's published menu — view & print",    icon: 'ti-calendar-check', accent: '#166534', bg: '#f0fdf4' },
    { to: '/documents',        label: 'Documents',       desc: 'Upload & track required documents',            icon: 'ti-folder',        accent: '#334155', bg: '#f8fafc' },
  ]

  return (
    <div style={{ padding: '32px 40px', fontFamily: "'DM Sans', sans-serif", maxWidth: 1100 }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Serif+Display&display=swap" rel="stylesheet" />
      <link href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.19.0/dist/tabler-icons.min.css" rel="stylesheet" />

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 13, color: '#888', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 500, marginBottom: 4 }}>
          {format(today, 'EEEE, MMMM d, yyyy')}
        </div>
        <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 30, color: '#0a3320', lineHeight: 1.1 }}>
          Good {today.getHours() < 12 ? 'morning' : today.getHours() < 17 ? 'afternoon' : 'evening'}
        </div>
        <div style={{ fontSize: 14, color: '#666', marginTop: 4 }}>
          {currentCenter?.name ?? org?.name ?? 'Your center'} · Director
        </div>
      </div>

      {/* Окна без отметок — ВЫШЕ всего остального: это единственная полоса на
          этой странице, у которой есть срок годности в минутах. */}
      {alerts.map(a => (
        <div key={a.id} role="alert" style={{
          display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 18px', marginBottom: 12,
          background: '#fef2f2', border: '2px solid #dc2626', borderRadius: 12, color: '#7f1d1d',
        }}>
          <span style={{ fontSize: 22, lineHeight: 1.1 }}>🍽️</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 2 }}>Meal window needs you now</div>
            <div style={{ fontSize: 13, whiteSpace: 'pre-line', lineHeight: 1.45 }}>{a.body}</div>
            <div style={{ fontSize: 11, color: '#9b6b6b', marginTop: 4 }}>
              {format(new Date(a.created_at), 'HH:mm')} · <Link to="/instructions?doc=director-desktop" style={{ color: '#b91c1c' }}>what to do →</Link>
            </div>
          </div>
          <button onClick={() => { dismiss(a.id); setAlerts(list => list.filter(x => x.id !== a.id)) }}
            style={{ border: '1px solid #dc2626', background: '#fff', color: '#b91c1c', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
            I'm going
          </button>
        </div>
      ))}

      {/* Pending strip — one-glance "what needs me now" */}
      {pending != null && pending > 0 && (
        <Link to="/enrollment-inbox" style={{ textDecoration: 'none' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', marginBottom: 22,
            background: '#0f4c35', color: '#fff', borderRadius: 12, boxShadow: '0 4px 14px rgba(15,76,53,0.25)',
          }}>
            <span style={{ fontSize: 20 }}>📥</span>
            <span style={{ fontWeight: 700, fontSize: 15 }}>{pending} enrollment {pending === 1 ? 'form' : 'forms'} awaiting your review</span>
            <span style={{ marginLeft: 'auto', fontSize: 13, color: '#a7f0d0', fontWeight: 600 }}>Open Inbox →</span>
          </div>
        </Link>
      )}

      {/* Section tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
        {tiles.map(t => (
          <Link key={t.to + t.label} to={t.to} style={{ textDecoration: 'none' }}>
            <div style={{
              background: '#fff', border: '1px solid #e8ece9', borderRadius: 16, padding: '20px',
              display: 'flex', gap: 16, alignItems: 'flex-start', transition: 'box-shadow 0.15s, transform 0.15s',
              boxShadow: '0 1px 4px rgba(0,0,0,0.05)', position: 'relative', minHeight: 96,
            }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.10)'; e.currentTarget.style.transform = 'translateY(-2px)' }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.05)'; e.currentTarget.style.transform = 'translateY(0)' }}
            >
              <div style={{ width: 46, height: 46, borderRadius: 12, background: t.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <i className={`ti ${t.icon}`} style={{ fontSize: 22, color: t.accent }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#0a3320', display: 'flex', alignItems: 'center', gap: 8 }}>
                  {t.label}
                  {typeof t.badge === 'number' && t.badge > 0 && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', background: '#dc2626', borderRadius: 999, padding: '1px 8px', minWidth: 20, textAlign: 'center' }}>{t.badge}</span>
                  )}
                </div>
                <div style={{ fontSize: 12.5, color: '#888', marginTop: 4, lineHeight: 1.4 }}>{t.desc}</div>
              </div>
            </div>
          </Link>
        ))}
      </div>

      <div style={{ marginTop: 26, fontSize: 12, color: '#9ca3af' }}>
        Signed in as {user?.email}. Need another section? Ask an administrator to adjust your permissions.
      </div>
    </div>
  )
}
