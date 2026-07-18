// Shared SafePass presentational pieces — theme, time helpers, and the queue /
// roster / stat views used by the kiosk. Authored prop-driven (no data fetching,
// no auth, no device/account coupling) so the account-based SafePassTeacherPage
// can migrate onto these in a later pass WITHOUT changing its behavior. Nothing
// here writes; callers own data + the Accept/Release action.
import type { KioskSession } from '@/lib/safepassDevice'

export const C = {
  bg: '#0f1117', surface: '#1a1d27', surface2: '#22263a', border: '#2e3350',
  text: '#f0f2ff', muted: '#7b82a6',
  green: '#00e896', greenDim: 'rgba(0,232,150,0.12)',
  amber: '#ffb740', amberDim: 'rgba(255,183,64,0.12)',
  red: '#ff4d6a', redDim: 'rgba(255,77,106,0.12)',
  blue: '#5b8bff', blueDim: 'rgba(91,139,255,0.12)',
}

export const hhmm = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }) : '--:--'

export function elapsed(fromISO: string, now: number): string {
  const secs = Math.max(0, Math.floor((now - new Date(fromISO).getTime()) / 1000))
  const m = Math.floor(secs / 60), s = secs % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

const personLabel = (s: KioskSession): string =>
  s.trusted_person_name || s.parent_name || 'Parent'

// A waiting request — Accept (drop_off) or Release (pick_up).
export function QueueCard({ session, now, onAct }: {
  session: KioskSession
  now: number
  onAct: (s: KioskSession) => void
}) {
  const isDrop = session.action_type === 'drop_off'
  const accent = isDrop ? C.green : C.amber
  const stale = now - new Date(session.person_initiated_at).getTime() > 30_000
  return (
    <div style={{
      background: C.surface2, border: `1px solid ${stale ? C.red : C.border}`,
      borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: C.text, fontWeight: 700, fontSize: 16 }}>{session.child_name}</div>
        <div style={{ color: C.muted, fontSize: 12.5, marginTop: 2 }}>
          {isDrop ? 'Drop-off' : 'Pick-up'} · {personLabel(session)} · waiting {elapsed(session.person_initiated_at, now)}
          {stale && <span style={{ color: C.red, fontWeight: 700 }}> · overdue</span>}
        </div>
      </div>
      <button onClick={() => onAct(session)} style={{
        padding: '10px 20px', borderRadius: 10, border: 'none', cursor: 'pointer',
        background: accent, color: '#06210f', fontSize: 14, fontWeight: 800, fontFamily: 'inherit',
        whiteSpace: 'nowrap',
      }}>
        {isDrop ? '✓ Accept' : '→ Release'}
      </button>
    </div>
  )
}

export type ChildState = 'present' | 'released' | 'none'

export function RosterList({ children, stateByName }: {
  children: { roster_id: string; child_name: string }[]
  stateByName: Record<string, ChildState>
}) {
  const dot: Record<ChildState, string> = { present: C.green, released: C.muted, none: C.border }
  const label: Record<ChildState, string> = { present: 'In', released: 'Out', none: '—' }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {children.map(ch => {
        const st = stateByName[ch.child_name.toLowerCase()] ?? 'none'
        return (
          <div key={ch.roster_id} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8,
          }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: dot[st], flexShrink: 0 }} />
            <span style={{ color: C.text, fontSize: 14, flex: 1 }}>{ch.child_name}</span>
            <span style={{ color: st === 'present' ? C.green : C.muted, fontSize: 11.5, fontWeight: 700 }}>{label[st]}</span>
          </div>
        )
      })}
      {children.length === 0 && <div style={{ color: C.muted, fontSize: 13, padding: 10 }}>No children on this roster.</div>}
    </div>
  )
}

export function StatTiles({ present, pending, released }: { present: number; pending: number; released: number }) {
  const tiles: [number, string, string][] = [
    [present, 'Present', C.green],
    [pending, 'Waiting', C.amber],
    [released, 'Released', C.muted],
  ]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
      {tiles.map(([n, lbl, col]) => (
        <div key={lbl} style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 10px', textAlign: 'center' }}>
          <div style={{ color: col, fontSize: 26, fontWeight: 800 }}>{n}</div>
          <div style={{ color: C.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4 }}>{lbl}</div>
        </div>
      ))}
    </div>
  )
}
