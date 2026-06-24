/**
 * ActionItemsWidget.tsx
 *
 * Feature C — "Urgent Action Items" dashboard card.
 *
 * Self-contained widget that surfaces open action items for the current org.
 * On mount (and on manual refresh) it calls `refresh_action_items` to
 * recompute the org's action items, then reads the already-sorted list via
 * `open_action_items` (urgent → high → normal — never re-sorted here).
 *
 * Each row supports Dismiss and Snooze (inline date picker) actions; after any
 * action the list is re-read. Styling matches the MenuMaker dashboard cards.
 */
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useOrg } from '@/contexts/OrgContext'
import { format, parseISO } from 'date-fns'

type Severity = 'urgent' | 'high' | 'normal'

interface ActionItem {
  id: string
  category: string
  severity: Severity
  title: string
  detail: string | null
  due_date: string | null
}

const SEVERITY: Record<Severity, { emoji: string; bg: string; dot: string }> = {
  urgent: { emoji: '🔴', bg: '#fff0f0', dot: '#c0392b' },
  high:   { emoji: '🟠', bg: '#fff8f0', dot: '#e67e22' },
  normal: { emoji: '🟡', bg: '#fffef0', dot: '#f39c12' },
}

function severityMeta(sev: Severity) {
  return SEVERITY[sev] || SEVERITY.normal
}

function formatDue(due: string | null): string | null {
  if (!due) return null
  try {
    return `Due ${format(parseISO(due), 'MMM d')}`
  } catch {
    return `Due ${due}`
  }
}

export default function ActionItemsWidget() {
  const { org } = useOrg()
  const orgId = org?.id

  const [items, setItems] = useState<ActionItem[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [snoozeId, setSnoozeId] = useState<string | null>(null)

  const loadList = useCallback(async () => {
    if (!orgId) return
    const { data } = await (supabase.schema('menumaker').rpc as any)(
      'open_action_items',
      { p_org_id: orgId },
    )
    // Already sorted urgent → high → normal — do not re-sort.
    setItems((data as ActionItem[]) || [])
  }, [orgId])

  const refresh = useCallback(async () => {
    if (!orgId) return
    setLoading(true)
    try {
      await (supabase.schema('menumaker').rpc as any)('refresh_action_items', {
        p_org_id: orgId,
      })
      await loadList()
    } finally {
      setLoading(false)
    }
  }, [orgId, loadList])

  useEffect(() => {
    refresh()
  }, [refresh])

  const handleDismiss = useCallback(
    async (id: string) => {
      setBusyId(id)
      try {
        await (supabase.schema('menumaker').rpc as any)('dismiss_action_item', {
          p_id: id,
        })
        await loadList()
      } finally {
        setBusyId(null)
      }
    },
    [loadList],
  )

  const handleSnooze = useCallback(
    async (id: string, until: string) => {
      if (!until) return
      setBusyId(id)
      try {
        await (supabase.schema('menumaker').rpc as any)('snooze_action_item', {
          p_id: id,
          p_until: until,
        })
        setSnoozeId(null)
        await loadList()
      } finally {
        setBusyId(null)
      }
    },
    [loadList],
  )

  // ── Card shell ─────────────────────────────────────────────────────────
  const card = (children: React.ReactNode) => (
    <div
      style={{
        background: '#fff',
        border: '1px solid #e8ece9',
        borderRadius: 14,
        overflow: 'hidden',
        boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      <div
        style={{
          padding: '16px 20px',
          borderBottom: '1px solid #f0f0f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>🔴</span>
          <span style={{ fontWeight: 600, fontSize: 14, color: '#1a1a1a' }}>
            Urgent Action Items
          </span>
        </div>
        <button
          onClick={refresh}
          disabled={loading || !orgId}
          style={{
            fontSize: 11,
            fontWeight: 500,
            color: '#0f4c35',
            background: '#f0fff4',
            border: '1px solid #c0e0c0',
            borderRadius: 6,
            padding: '4px 10px',
            cursor: loading || !orgId ? 'default' : 'pointer',
            opacity: loading || !orgId ? 0.5 : 1,
          }}
        >
          ↻ Refresh
        </button>
      </div>
      <div style={{ padding: '8px 0' }}>{children}</div>
    </div>
  )

  if (!orgId) {
    return card(
      <div style={{ padding: '16px 20px', color: '#aaa', fontSize: 13 }}>Loading…</div>,
    )
  }

  if (loading) {
    return card(
      <div style={{ padding: '16px 20px', color: '#aaa', fontSize: 13 }}>Loading…</div>,
    )
  }

  if (items.length === 0) {
    return card(
      <div style={{ padding: '16px 20px', color: '#0f4c35', fontSize: 13 }}>
        ✓ All clear — no urgent actions
      </div>,
    )
  }

  return card(
    items.map((item, i) => {
      const meta = severityMeta(item.severity)
      const due = formatDue(item.due_date)
      const isBusy = busyId === item.id
      const isSnoozing = snoozeId === item.id
      return (
        <div
          key={item.id}
          style={{
            padding: '12px 20px',
            background: meta.bg,
            borderBottom: i < items.length - 1 ? '1px solid #f5f5f5' : 'none',
            opacity: isBusy ? 0.55 : 1,
          }}
        >
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <span style={{ fontSize: 16, marginTop: 1 }}>{meta.emoji}</span>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a1a' }}>
                {item.title}
              </div>
              {item.detail && (
                <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                  {item.detail}
                </div>
              )}

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginTop: 8,
                  flexWrap: 'wrap',
                }}
              >
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: 6,
                    background: '#f0f0f0',
                    color: '#666',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                  }}
                >
                  {item.category}
                </span>
                {due && (
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: 6,
                      background: '#fff',
                      color: meta.dot,
                      border: `1px solid ${meta.dot}40`,
                    }}
                  >
                    {due}
                  </span>
                )}
              </div>

              {/* Actions */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginTop: 10,
                }}
              >
                <button
                  onClick={() => handleDismiss(item.id)}
                  disabled={isBusy}
                  style={{
                    fontSize: 11,
                    fontWeight: 500,
                    color: '#555',
                    background: '#fff',
                    border: '1px solid #ddd',
                    borderRadius: 6,
                    padding: '4px 10px',
                    cursor: isBusy ? 'default' : 'pointer',
                  }}
                >
                  Dismiss
                </button>

                {isSnoozing ? (
                  <input
                    type="date"
                    autoFocus
                    onChange={(e) => handleSnooze(item.id, e.target.value)}
                    onBlur={() => setSnoozeId(null)}
                    disabled={isBusy}
                    style={{
                      fontSize: 11,
                      fontFamily: "'DM Sans', sans-serif",
                      color: '#555',
                      border: '1px solid #ddd',
                      borderRadius: 6,
                      padding: '3px 8px',
                    }}
                  />
                ) : (
                  <button
                    onClick={() => setSnoozeId(item.id)}
                    disabled={isBusy}
                    style={{
                      fontSize: 11,
                      fontWeight: 500,
                      color: '#0f4c35',
                      background: '#f0fff4',
                      border: '1px solid #c0e0c0',
                      borderRadius: 6,
                      padding: '4px 10px',
                      cursor: isBusy ? 'default' : 'pointer',
                    }}
                  >
                    Snooze
                  </button>
                )}
              </div>
            </div>

            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: meta.dot,
                marginTop: 4,
                flexShrink: 0,
              }}
            />
          </div>
        </div>
      )
    }),
  )
}
