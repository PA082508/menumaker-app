// src/pages/portal/PortalPage.tsx
// Minimal staff portal — no sidebar, no main nav.
// Auto-logs in with a center-specific service account so the page works
// without any visible login UI (like /safepass/parent).
//
// TODO — после доработки Settings → Meal Schedule:
//   Видимость табов вынести в настройки (meal_schedule_role_access),
//   чтобы владелец конфигурировал доступ per-center per-role.

import { useEffect, useState } from 'react'
import { useParams, Navigate, useNavigate } from 'react-router-dom'
import { useOrg } from '@/contexts/OrgContext'
import { useAuth } from '@/hooks/useAuth'
import MealCountPage from '@/pages/meal-count/MealCountPage'
import PortalMessagesPanel from '@/pages/messages/PortalMessagesPanel'

const CENTER_NAMES: Record<string, string> = {
  ridge: 'Wickliffe',
  pearl: 'Parma Heights',
  alpha: 'Mayfield Hills',
}

// Service accounts per center — auto-login, invisible to user
const CENTER_CREDENTIALS: Record<string, { email: string; password: string }> = {
  ridge: { email: 'playacademyusa+ridge.cook@gmail.com', password: 'Ridge2026!' },
  pearl: { email: 'playacademyusa+pearl.cook@gmail.com', password: 'Pearl2026!' },
  alpha: { email: 'playacademyusa+alpha.cook@gmail.com', password: 'Alpha2026!' },
}

const PORTAL_ROLES: Record<string, string[]> = {
  teacher:  ['cook'],
  cook:     ['cook'],
  director: ['director'],
}

export default function PortalPage() {
  const navigate = useNavigate()
  const { role: urlRole, center: urlCenter } = useParams<{ role: string; center?: string }>()
  const { session, signIn } = useAuth()
  const { centers, setCurrentCenter } = useOrg()
  const [authReady, setAuthReady] = useState(false)
  const [authError, setAuthError] = useState('')

  const portalRole = urlRole?.toLowerCase() ?? ''
  const centerCode = urlCenter?.toLowerCase() ?? ''

  if (!PORTAL_ROLES[portalRole]) return <Navigate to="/login" replace />

  if (portalRole === 'cook' && !centerCode) {
    return <Navigate to="/portal/cook/ridge" replace />
  }

  const roles = PORTAL_ROLES[portalRole]
  const centerName = CENTER_NAMES[centerCode] ?? null
  const showCenterSwitcher = portalRole === 'cook'
  const creds = CENTER_CREDENTIALS[centerCode]

  // Auto-login with service account if no active session
  useEffect(() => {
    if (!centerCode || !creds) { setAuthReady(true); return }
    if (session) { setAuthReady(true); return }
    signIn(creds.email, creds.password).then(({ error }) => {
      if (error) setAuthError(error.message)
      setAuthReady(true)
    })
  }, [centerCode, session])

  // Set center in OrgContext once centers[] is loaded
  useEffect(() => {
    if (!centerCode || !centers.length) return
    const match = centers.find(c => c.slug?.toLowerCase() === centerCode)
    if (match) setCurrentCenter(match)
  }, [centerCode, centers])

  if (!authReady) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a3320', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: '#7ee8b0', fontSize: 14, fontFamily: "'DM Sans', sans-serif" }}>Loading…</span>
      </div>
    )
  }

  if (authError) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a3320', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: '#ff6b6b', fontSize: 14, fontFamily: "'DM Sans', sans-serif" }}>Error: {authError}</span>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f4f7f4', fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{
        background: '#0a3320', padding: '10px 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src="https://rkabxzqcikojcphwrkty.supabase.co/storage/v1/object/public/assets/PA-Logo-144x144.png"
            alt="Play Academy" style={{ width: 32, height: 32, borderRadius: 8, objectFit: 'contain', background: '#fff', padding: 2 }} />
          <span style={{ color: '#7ee8b0', fontWeight: 800, fontSize: 15 }}>ClickClaim CACFP</span>
          {centerName && (
            <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13 }}>· {centerName}</span>
          )}
        </div>

        {showCenterSwitcher && (
          <div style={{ display: 'flex', gap: 6 }}>
            {(['ridge', 'pearl', 'alpha'] as const).map(code => (
              <button key={code} onClick={() => navigate(`/portal/cook/${code}`)}
                style={{
                  padding: '5px 12px', borderRadius: 16, fontSize: 12, fontWeight: 600,
                  border: '1.5px solid rgba(126,232,176,0.35)', cursor: 'pointer', fontFamily: 'inherit',
                  background: centerCode === code ? '#7ee8b0' : 'transparent',
                  color: centerCode === code ? '#0a3320' : 'rgba(255,255,255,0.65)',
                }}>
                {CENTER_NAMES[code]}
              </button>
            ))}
          </div>
        )}

        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
          {portalRole === 'director' ? 'Director' : portalRole === 'cook' ? 'Cook' : 'Teacher'} View
        </span>
      </div>
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
        <MealCountPage portalRoles={roles} />
      </div>
      {(portalRole === 'teacher' || portalRole === 'cook') && (
        <PortalMessagesPanel centerCode={centerCode} portalRole={portalRole} />
      )}
    </div>
  )
}
