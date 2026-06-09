import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'

type NavItem = {
  path: string
  label: string
  icon: string
  roles?: string[]
  badge?: string
}

const NAV_ITEMS: NavItem[] = [
  { path: '/dashboard',  label: 'Dashboard',      icon: '⊞',  },
  { path: '/menu',       label: 'Menu Planner',   icon: '📅', roles: ['director','cook','office_manager','cacfp_inspector'] },
  { path: '/recipes',    label: 'Recipes',        icon: '🍳', roles: ['director','cook','office_manager'] },
  { path: '/kitchen',    label: 'Kitchen View',   icon: '👨‍🍳', roles: ['director','cook'] },
  { path: '/delivery',   label: 'Delivery',       icon: '🚐', roles: ['director','driver'] },
  { path: '/purchases',  label: 'Purchases',      icon: '🛒', roles: ['director','purchaser'] },
  { path: '/inventory',  label: 'Inventory',      icon: '📦', roles: ['director','purchaser','cook'] },
  { path: '/reports',    label: 'CACFP Reports',  icon: '📋', roles: ['director','office_manager','cacfp_inspector'] },
  { path: '/finance',    label: 'Finance',        icon: '💰', roles: ['director','accountant'] },
  { path: '/settings',   label: 'Settings',       icon: '⚙️', roles: ['director'] },
]

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
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(false)

  const visibleItems = NAV_ITEMS.filter(item =>
    !item.roles || (role && item.roles.includes(role))
  )

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
        <Outlet />
      </main>
    </div>
  )
}
