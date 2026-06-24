import { useState } from 'react'
import { NavLink, Outlet, useNavigate, useLocation, Link } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useOrg } from '@/contexts/OrgContext'
import { routeForModule, KNOWN_MODULE_ROUTES, MODULE_ICON_FALLBACK } from '@/lib/modules'

type NavItem = {
  path: string
  label: string
  icon: string
  roles?: string[]
  badge?: string
}

const ROLE_LABELS: Record<string, string> = {
  director:        'Director',
  cook:            'Cook',
  office_manager:  'Office Manager',
  cacfp_inspector: 'CACFP Inspector',
  accountant:      'Accountant',
  driver:          'Driver',
  purchaser:       'Purchaser',
}

const ROLE_COLORS: Record<string, string> = {
  director:        '#0f4c35',
  cook:            '#1a6b4a',
  office_manager:  '#2980b9',
  cacfp_inspector: '#8e44ad',
  accountant:      '#c0392b',
  driver:          '#e67e22',
  purchaser:       '#16a085',
}

export default function AppLayout() {
  const { user, role, signOut } = useAuth()
  const { modules, navModules } = useOrg()
  const hasCACFP = modules.includes('cacfp')
  const navigate = useNavigate()
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(false)

  const NAV_ITEMS: NavItem[] = [
    { path: '/dashboard',  label: 'Dashboard',      icon: '⊞' },
    { path: '/menu',       label: 'Menu Planner',   icon: '📅', roles: ['director','cook','office_manager','cacfp_inspector'] },
    { path: '/recipes',    label: 'Recipes',        icon: '🍳', roles: ['director','cook','office_manager'] },
    { path: '/kitchen',    label: 'Kitchen View',   icon: '👨‍🍳', roles: ['director','cook'] },
    { path: '/delivery',   label: 'Delivery',       icon: '🚐', roles: ['director','driver'] },
    { path: '/purchases',  label: 'Purchases',      icon: '🛒', roles: ['director','purchaser'] },
    { path: '/kitchen-stock', label: 'Kitchen Stock', icon: '🏪', roles: ['director','cook','purchaser'] },
    { path: '/inventory',  label: 'Inventory',      icon: '📦', roles: ['director','purchaser','cook'] },
    { path: '/meal-count', label: 'Meal Count', icon: '🍽️', roles: ['admin','director','cook','office_manager'] },
    { path: '/documents',  label: 'Documents',  icon: '📁', roles: ['admin','office_manager','director'] },
    { path: '/dispatch',   label: 'Dispatch',   icon: '📨', roles: ['admin','office_manager'] },
    { path: '/export',     label: 'Custom Export', icon: '📤', roles: ['admin','office_manager','director'] },
    ...(hasCACFP ? [
      { path: '/claim-report', label: 'Site Claim',    icon: '📋', roles: ['director','office_manager'] },
      { path: '/reports',      label: 'CACFP Reports', icon: '📊', roles: ['director','office_manager','cacfp_inspector'] },
    ] : []),
    { path: '/receipt-review', label: 'Receipt Review',  icon: '🧾', roles: ['director','office_manager'] },
    { path: '/kitchen-report', label: 'Kitchen Report', icon: '👨‍🍳', roles: ['director','cook','office_manager'] },
    { path: '/submissions', label: 'Form Submissions', icon: '📨', roles: ['director','office_manager','cacfp_inspector'] },
    { path: '/finance',    label: 'Finance',        icon: '💰', roles: ['director','accountant'] },
    { path: '/settings',   label: 'Settings',       icon: '⚙️', roles: ['director','admin','office_manager'] },
  ]

  // Variant B: build nav from user_modules when available; otherwise fall back
  // to the legacy role-based gating (keeps current behavior until the backend
  // returns modules for every user).
  const usingPerms = Array.isArray(navModules) && navModules.length > 0

  const permItems: NavItem[] = usingPerms
    ? [...navModules!]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map(m => ({
          path: routeForModule(m.module_code),
          label: m.label,
          icon: m.icon || MODULE_ICON_FALLBACK[m.module_code] || '•',
        }))
    : []

  const baseVisible = usingPerms
    ? permItems
    : NAV_ITEMS.filter(item => !item.roles || (role && item.roles.includes(role)))

  // Cook: sidebar shows Meal Count + Delivery (dispatch). Teacher: Meal Count only.
  // Sourced from NAV_ITEMS directly so it works regardless of permission-driven nav.
  const isCook = role === 'cook'
  const isCookOrTeacher = isCook || (role as string) === 'teacher'
  const visibleItems = isCookOrTeacher
    ? NAV_ITEMS.filter(item => item.path === '/meal-count' || (isCook && item.path === '/delivery'))
    : baseVisible

  // Route guard: if permissions are active and the user opened a guarded module
  // route that is not in their allowed set, show a 403. Dashboard is never
  // blocked (anti-lockout); unknown/utility routes pass through.
  const allowedPaths = usingPerms ? new Set(permItems.map(i => i.path)) : null
  const basePath = '/' + (location.pathname.split('/')[1] || 'dashboard')
  // Cook's two surfaced routes are never blocked (they're sidebar-allowed above).
  const cookAllowed = isCookOrTeacher && (basePath === '/meal-count' || (isCook && basePath === '/delivery'))
  const blocked =
    usingPerms &&
    basePath !== '/dashboard' &&
    !cookAllowed &&
    KNOWN_MODULE_ROUTES.has(basePath) &&
    !allowedPaths!.has(basePath)

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  const sidebarWidth = collapsed ? 64 : 220

  return (
    <div style={{
      display: 'flex',
      minHeight: '100vh',
      background: '#f4f6f4',
      fontFamily: "'DM Sans', sans-serif",
    }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Serif+Display&display=swap" rel="stylesheet"/>

      {/* Sidebar */}
      <aside style={{
        width: sidebarWidth,
        minHeight: '100vh',
        background: '#0a3320',
        display: 'flex',
        flexDirection: 'column',
        transition: 'width 0.2s ease',
        position: 'fixed',
        left: 0, top: 0, bottom: 0,
        zIndex: 100,
        overflow: 'hidden',
      }}>
        {/* Logo */}
        <div style={{
          padding: collapsed ? '20px 0' : '20px 20px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          justifyContent: collapsed ? 'center' : 'flex-start',
        }}>
          <span style={{ fontSize: 22, flexShrink: 0 }}>🍽️</span>
          {!collapsed && (
            <div>
              <div style={{
                fontFamily: "'DM Serif Display', serif",
                color: '#fff',
                fontSize: 18,
                lineHeight: 1,
              }}>
                MenuMaker
              </div>
              <div style={{
                fontSize: 9,
                color: 'rgba(255,255,255,0.4)',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                marginTop: 2,
              }}>
                Play Academy
              </div>
            </div>
          )}
        </div>

        {/* Active center / Organization switcher */}
        <CenterSwitcher collapsed={collapsed} />

        {/* Navigation */}
        <nav style={{ flex: 1, padding: '12px 0', overflowY: 'auto' }}>
          {visibleItems.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              style={({ isActive }) => ({
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: collapsed ? '10px 0' : '10px 16px',
                justifyContent: collapsed ? 'center' : 'flex-start',
                color: isActive ? '#7ee8b0' : 'rgba(255,255,255,0.6)',
                background: isActive ? 'rgba(126,232,176,0.1)' : 'transparent',
                borderLeft: isActive ? '2px solid #7ee8b0' : '2px solid transparent',
                textDecoration: 'none',
                fontSize: 13,
                fontWeight: isActive ? 600 : 400,
                transition: 'all 0.15s',
                borderRadius: collapsed ? 0 : '0 8px 8px 0',
                marginRight: collapsed ? 0 : 8,
              })}
            >
              <span style={{ fontSize: 16, flexShrink: 0 }}>{item.icon}</span>
              {!collapsed && <span>{item.label}</span>}
              {!collapsed && item.badge && (
                <span style={{
                  marginLeft: 'auto',
                  background: '#c0392b',
                  color: '#fff',
                  fontSize: 10,
                  fontWeight: 700,
                  padding: '2px 6px',
                  borderRadius: 10,
                }}>
                  {item.badge}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        {/* User info + collapse */}
        <div style={{
          borderTop: '1px solid rgba(255,255,255,0.08)',
          padding: collapsed ? '12px 0' : '12px 16px',
        }}>
          {!collapsed && role && (
            <div style={{ marginBottom: 10 }}>
              <div style={{
                display: 'inline-block',
                padding: '3px 8px',
                borderRadius: 6,
                background: (ROLE_COLORS[role] || '#333') + '30',
                border: `1px solid ${ROLE_COLORS[role] || '#333'}50`,
                color: '#7ee8b0',
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                marginBottom: 4,
              }}>
                {ROLE_LABELS[role] || role}
              </div>
              <div style={{
                fontSize: 11,
                color: 'rgba(255,255,255,0.45)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {user?.email}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 6, justifyContent: collapsed ? 'center' : 'flex-start' }}>
            <button
              onClick={() => setCollapsed(!collapsed)}
              style={{
                padding: '6px 8px',
                borderRadius: 6,
                border: '1px solid rgba(255,255,255,0.15)',
                background: 'transparent',
                color: 'rgba(255,255,255,0.5)',
                cursor: 'pointer',
                fontSize: 12,
              }}
            >
              {collapsed ? '→' : '←'}
            </button>
            {!collapsed && (
              <button
                onClick={handleSignOut}
                style={{
                  flex: 1,
                  padding: '6px 10px',
                  borderRadius: 6,
                  border: '1px solid rgba(255,255,255,0.15)',
                  background: 'transparent',
                  color: 'rgba(255,255,255,0.5)',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontFamily: 'inherit',
                }}
              >
                Sign Out
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main style={{
        flex: 1,
        marginLeft: sidebarWidth,
        transition: 'margin-left 0.2s ease',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {blocked ? <Forbidden /> : <Outlet />}
      </main>
    </div>
  )
}

// Header center switcher. Admin / office_manager get a dropdown of their
// accessible centers plus an "Organization" (org-wide) option. Center-mode
// users (director/cook/teacher) see a static, non-switchable center label.
function CenterSwitcher({ collapsed }: { collapsed: boolean }) {
  const { isOrgAdmin, centers, currentCenter, viewMode, setCurrentCenter } = useOrg()
  const short = (n?: string | null) => (n ?? '').replace(/^Play Academy\s+/i, '').trim() || '—'

  // Nothing to show until centers resolve (and center-mode users with no center).
  if (!currentCenter && !isOrgAdmin) return null

  if (collapsed) {
    const glyph = viewMode === 'org' ? '🏢' : short(currentCenter?.name).charAt(0).toUpperCase()
    return (
      <div
        title={viewMode === 'org' ? 'Organization' : currentCenter?.name ?? ''}
        style={{
          margin: '10px auto 4px', width: 34, height: 34, borderRadius: 8,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(126,232,176,0.12)', border: '1px solid rgba(126,232,176,0.25)',
          color: '#7ee8b0', fontSize: 13, fontWeight: 700,
        }}
      >
        {glyph}
      </div>
    )
  }

  return (
    <div style={{ padding: '12px 16px 4px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
      <div style={{
        fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase',
        color: 'rgba(255,255,255,0.4)', marginBottom: 6,
      }}>
        {viewMode === 'org' ? 'Viewing' : 'Center'}
      </div>

      {isOrgAdmin ? (
        <select
          value={viewMode === 'org' ? '__org__' : (currentCenter?.id ?? '')}
          onChange={e => {
            const v = e.target.value
            if (v === '__org__') { setCurrentCenter(null); return }
            const c = centers.find(c => c.id === v)
            if (c) setCurrentCenter(c)
          }}
          style={{
            width: '100%', padding: '8px 10px', borderRadius: 8,
            background: '#0f4c35', color: '#fff', fontSize: 13, fontWeight: 600,
            border: '1px solid rgba(126,232,176,0.3)', cursor: 'pointer',
            fontFamily: 'inherit', appearance: 'none',
          }}
        >
          {centers.map(c => <option key={c.id} value={c.id} style={{ background: '#0a3320' }}>{short(c.name)}</option>)}
          <option value="__org__" style={{ background: '#0a3320' }}>🏢 Organization</option>
        </select>
      ) : (
        <div style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>
          {short(currentCenter?.name)}
        </div>
      )}
    </div>
  )
}

function Forbidden() {
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 12,
      fontFamily: "'DM Sans', sans-serif", color: '#0a3320', padding: 40, textAlign: 'center',
    }}>
      <div style={{ fontSize: 44 }}>🔒</div>
      <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 24 }}>Access restricted</div>
      <div style={{ fontSize: 14, color: '#666', maxWidth: 420 }}>
        You don’t have access to this section. If you think this is a mistake, ask an administrator
        to grant it in Settings → Permissions.
      </div>
      <Link to="/dashboard" style={{
        marginTop: 8, padding: '8px 18px', borderRadius: 8, background: '#0f4c35',
        color: '#fff', textDecoration: 'none', fontSize: 13, fontWeight: 600,
      }}>
        ← Back to Dashboard
      </Link>
    </div>
  )
}
