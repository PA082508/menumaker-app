// Button — the one button of the top action rows.
//
// Before this file there were ~9 button styles and no component: BTN_PRI/BTN_SEC existed
// as FIVE byte-identical copies in five files, plus btnPri/btnSec in four more, plus a
// handful of one-offs. Rows drifted apart in the small ways that only show up side by
// side — fontWeight 700 here and 600 there, padding 8 vs 9, radius 8 vs 9, rem vs px.
//
// Shape: outlined and rounded, one height, one typography. Colour is the PLATFORM green
// (#0f4c35), not the indigo of the sample — override only on Nikolay's explicit word.
//
// Variants:
//   'default'  outlined green on white — the ordinary action
//   'primary'  filled green — the one action the row is FOR (at most one per row)
//   'onDark'   outlined white — for rows sitting on the green header strip
// State:
//   disabled   pale and unclickable; never merely faded-but-live
//
// Counter badges (the red Enrollment "2") are passed as `badge` and keep their existing
// look — they were never the problem.
import type { CSSProperties, ReactNode } from 'react'

const GREEN = '#0f4c35'
const GREEN_INK = '#1a5c3f'

export type ButtonVariant = 'default' | 'primary' | 'onDark'

/** One height, one typography — every top-row button is the same object but for colour. */
const BASE: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  height: 38,                 // the "one height" — not padding-derived, so it cannot drift
  padding: '0 16px',
  borderRadius: 9,
  fontSize: 13,
  fontWeight: 600,
  fontFamily: 'inherit',
  lineHeight: 1,
  whiteSpace: 'nowrap',
  cursor: 'pointer',
  transition: 'background 0.15s, border-color 0.15s, color 0.15s',
  boxSizing: 'border-box',
}

function paint(variant: ButtonVariant, hover: boolean, disabled: boolean): CSSProperties {
  if (disabled) {
    // Pale and inert. A disabled button that only dims still invites the tap.
    return variant === 'onDark'
      ? { background: 'transparent', border: '1px solid rgba(255,255,255,0.25)', color: 'rgba(255,255,255,0.45)' }
      : { background: '#fafafa', border: '1px solid #e5e7eb', color: '#b6bcb6' }
  }
  if (variant === 'primary') {
    return { background: hover ? '#0c3d2a' : GREEN, border: `1px solid ${hover ? '#0c3d2a' : GREEN}`, color: '#fff' }
  }
  if (variant === 'onDark') {
    return {
      background: hover ? 'rgba(255,255,255,0.14)' : 'transparent',
      border: '1px solid rgba(255,255,255,0.6)', color: '#fff',
    }
  }
  return {
    background: hover ? '#f0f7f4' : '#fff',
    border: `1px solid ${hover ? GREEN : '#c0d8c0'}`,
    color: GREEN_INK,
  }
}

export default function Button({
  children, onClick, variant = 'default', disabled = false, badge, title, style, type = 'button',
}: {
  children: ReactNode
  onClick?: () => void
  variant?: ButtonVariant
  disabled?: boolean
  /** Counter pill (e.g. pending enrolments). Rendered only when truthy and > 0. */
  badge?: number | null
  title?: string
  style?: CSSProperties
  type?: 'button' | 'submit'
}) {
  return (
    <button
      type={type} onClick={disabled ? undefined : onClick} disabled={disabled} title={title}
      // Hover via a real listener rather than a stylesheet: these styles are inline, and
      // a :hover rule in index.css would be a second place the row could drift from.
      onMouseEnter={e => Object.assign(e.currentTarget.style, paint(variant, true, disabled))}
      onMouseLeave={e => Object.assign(e.currentTarget.style, paint(variant, false, disabled))}
      style={{ ...BASE, ...paint(variant, false, disabled), ...(disabled ? { cursor: 'default' } : null), ...style }}
    >
      {children}
      {badge != null && badge > 0 && (
        <span style={{
          minWidth: 19, height: 19, padding: '0 6px', borderRadius: 20,
          background: '#c62a1f', color: '#fff', fontSize: 11, fontWeight: 800,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}>{badge}</span>
      )}
    </button>
  )
}

/** The row itself — so gap and wrapping are also one decision, not fifteen. */
export function ButtonRow({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', ...style }}>
      {children}
    </div>
  )
}
