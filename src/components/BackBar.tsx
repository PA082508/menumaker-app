import { useNavigate } from 'react-router-dom'

// Standard return control for hidden pages (Inbox, Import) reached from a People
// hub. A prominent, sticky, high-contrast bar — never a small link in a plaque —
// so the way back is always obvious. `label` names the hub ("Children" / "Staff").
export default function BackBar({ to, label }: { to: string; label: string }) {
  const navigate = useNavigate()
  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 50,
      background: '#0f4c35', color: '#fff', padding: '9px 20px',
      display: 'flex', alignItems: 'center', boxShadow: '0 2px 10px rgba(15,76,53,0.25)',
    }}>
      <button
        onClick={() => navigate(to)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.28)',
          color: '#fff', padding: '7px 16px', borderRadius: 9, cursor: 'pointer',
          fontSize: 14, fontWeight: 700, fontFamily: 'inherit',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.24)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.14)')}
      >
        ← Back to {label}
      </button>
    </div>
  )
}
