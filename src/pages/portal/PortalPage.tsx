// src/pages/portal/PortalPage.tsx
// Minimal staff portal — no sidebar, no main nav.
//
// TODO — после доработки Settings → Meal Schedule:
//   Видимость табов вынести в настройки (meal_schedule_role_access),
//   чтобы владелец конфигурировал доступ per-center per-role.

import { useEffect } from 'react'
import { useParams, Navigate } from 'react-router-dom'
import { useOrg } from '@/contexts/OrgContext'
import MealCountPage from '@/pages/meal-count/MealCountPage'

const CENTER_NAMES: Record<string, string> = {
  ridge: 'Wickliffe',
  pearl: 'Parma Heights',
  alpha: 'Mayfield Hills',
}

// cook role → Current Meal + Week View (без Director)
// director role → только Director таб
const PORTAL_ROLES: Record<string, string[]> = {
  teacher:  ['cook'],
  cook:     ['cook'],
  director: ['director'],
}

export default function PortalPage() {
  const { role: urlRole, center: urlCenter } = useParams<{ role: string; center?: string }>()
  const { centers, setCurrentCenter } = useOrg()

  const portalRole = urlRole?.toLowerCase() ?? ''
  const centerCode = urlCenter?.toLowerCase() ?? ''

  if (!PORTAL_ROLES[portalRole]) return <Navigate to="/login" replace />

  const roles = PORTAL_ROLES[portalRole]
  const centerName = CENTER_NAMES[centerCode] ?? null

  useEffect(() => {
    if (!centerCode || !centers.length) return
    const match = centers.find(c => c.slug?.toLowerCase() === centerCode)
    if (match) setCurrentCenter(match)
  }, [centerCode, centers])

  return (
    <div style={{ minHeight: '100vh', background: '#f4f7f4', fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{
        background: '#0a3320', padding: '10px 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: '#7ee8b0', fontWeight: 800, fontSize: 15 }}>ClickClaim CACFP</span>
          {centerName && (
            <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13 }}>· {centerName}</span>
          )}
        </div>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
          {portalRole === 'director' ? 'Director' : portalRole === 'cook' ? 'Cook' : 'Teacher'} View
        </span>
      </div>
      <MealCountPage portalRoles={roles} />
    </div>
  )
}
