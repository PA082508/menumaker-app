import { useState, useRef, useEffect, Fragment } from 'react'
import { NavLink, Outlet, useNavigate, useLocation, Link } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { usePushNotifications } from '@/hooks/usePushNotifications'
import { useOrg } from '@/contexts/OrgContext'
import { routeForModule, KNOWN_MODULE_ROUTES, MODULE_ICON_FALLBACK } from '@/lib/modules'

type NavItem = {
  path: string
  label: string
  icon: string
  roles?: string[]
  badge?: string
  section?: string
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

// ── menu structure ────────────────────────────────────────────
type SubItem = { path: string; label: string; icon: string }
type Section = { id: string; label: string; icon: string; noFlyout?: boolean; items?: SubItem[] }

const SECTIONS: Section[] = [
  {
    id: 'dashboard', label: 'Dashboard', icon: '⊞', noFlyout: true,
  },
  {
    id: 'operations', label: 'Operations', icon: 'ti-report',
    items: [
      { path: '/meal-count',    label: 'Meal Count',     icon: 'ti-circle-check' },
      { path: '/safepass/teacher', label: 'SafePass',       icon: 'ti-shield-check' },
      { path: '/kitchen',       label: 'Kitchen View',   icon: 'ti-chef-hat' },
      { path: '/kitchen-report',label: 'Kitchen Report', icon: 'ti-report' },
      { path: '/delivery',      label: 'Delivery',       icon: 'ti-truck-delivery' },
      { path: '/receipt-review',label: 'Receipt Review', icon: 'ti-receipt' },
    ],
  },
  {
    id: 'planning', label: 'Planning', icon: '📅',
    items: [
      { path: '/menu',          label: 'Menu Planner',  icon: 'ti-calendar-month' },
      { path: '/menu/current',  label: 'Current Menu',  icon: 'ti-calendar-check' },
      { path: '/recipes',       label: 'Recipes',       icon: 'ti-meat' },
      { path: '/purchases',     label: 'Purchases',     icon: 'ti-shopping-cart' },
      { path: '/kitchen-stock', label: 'Kitchen Stock', icon: 'ti-building-store' },
      { path: '/inventory',     label: 'Inventory',     icon: 'ti-box' },
    ],
  },
  {
    id: 'people', label: 'People', icon: '👥',
    items: [
      { path: '/children',        label: 'Children',        icon: 'ti-baby-carriage' },
      { path: '/enrollment-inbox', label: 'Enrollment Inbox', icon: 'ti-inbox' },
      { path: '/children/import', label: 'Import Children',  icon: 'ti-file-upload' },
      { path: '/staff',           label: 'Staff',           icon: 'ti-id-badge' },
      { path: '/staff/time-log',  label: 'Daily Time Log',   icon: 'ti-clock' },
    ],
  },
  {
    id: 'reports', label: 'Reports', icon: '📋',
    items: [
      { path: '/claim-report',          label: 'Site Claim',         icon: 'ti-file-invoice' },
      { path: '/eligibility-reconciliation', label: 'Eligibility Recon', icon: 'ti-checklist' },
      { path: '/skeleton-reconciliation', label: 'Skeleton Recon', icon: 'ti-git-merge' },
      { path: '/reports',               label: 'Meal Count Summary', icon: 'ti-chart-bar' },
      { path: '/staff/time-log',        label: 'Time Log Summary',   icon: 'ti-clock' },
      { path: '/submissions',           label: 'Income Eligibility', icon: 'ti-forms' },
      { path: '/export',                label: 'Custom Export',      icon: 'ti-download' },
    ],
  },
  {
    id: 'documents', label: 'Documents', icon: '📁',
    items: [
      { path: '/documents',   label: 'Upload',           icon: 'ti-upload' },
      { path: '/submissions', label: 'Form Submissions', icon: 'ti-file-description' },
      { path: '/dispatch',    label: 'Q&A / Instructions', icon: 'ti-message-question' },
      { path: '/messages',    label: 'Messages', icon: 'ti-message' },
      { path: '/instructions',  label: 'Instructions',      icon: 'ti-book' },
      { path: '/document-hub',  label: 'Library',            icon: 'ti-books' },
      { path: '/byod-director', label: 'BYOD Signatures',    icon: 'ti-signature' },
      { path: '/policies',      label: 'Policies',           icon: 'ti-file-certificate' },
    ],
  },
  {
    id: 'budget', label: 'Budget', icon: '💰',
    items: [
      { path: '/finance',               label: 'Fiscal Year Plan',  icon: 'ti-calendar-stats' },
      { path: '/reimbursement-preview', label: 'YTD Results',       icon: 'ti-trending-up' },
      { path: '/reimbursement-preview', label: 'Reimbursements',    icon: 'ti-file-dollar' },
      { path: '/purchases',             label: 'Food Costs',        icon: 'ti-shopping-cart' },
      { path: '/staff/time-log',        label: 'Labor Costs',       icon: 'ti-users' },
    ],
  },
  {
    id: 'resources', label: 'Resources', icon: '🌐',
    items: [
      { path: '/instructions',              label: 'Instructions',  icon: 'ti-book' },
      { path: 'https://playacademyusa.com', label: 'Website',       icon: 'ti-world' },
      { path: '/children',                  label: 'Parent Portal', icon: 'ti-app-window' },
      { path: 'https://brightwheel.com',    label: 'Brightwheel',   icon: 'ti-link' },
    ],
  },
  { id: 'other', label: 'Other', icon: 'ti-dots', items: [
    { path: '/dispatch',        label: 'Dispatch',        icon: 'ti-send' },
    { path: '/finance',         label: 'Finance',         icon: 'ti-currency-dollar' },
    { path: '/cacfp-checklist', label: 'CACFP Checklist', icon: 'ti-checkbox' },
  ]},
  {
    id: 'settings', label: 'Settings', icon: '⚙️', noFlyout: true,
  },
]

// ── director desktop: curated section set ─────────────────────
// The director works inside the existing MenuMaker app. Their sidebar is limited
// to what they own: Director Home · Meal Count · Menu (VIEW ONLY — Current Menu +
// official print, NO planner) · Children · Enrollment Inbox · Staff · Documents.
// Budget / Reports / Policies / Settings are hidden. Admin and office_manager
// keep the full sidebar (this filter never touches them).
//
// Menu is view-only by design: the planner (/menu) is omitted here, blocked for
// directors at the route level (see MenuPlannerPage), AND enforced in the DB —
// RLS strips 'director' from the menu_cycles/menu_items/holidays write policies,
// so a director cannot fire a planner mutation even outside the UI.
const DIRECTOR_SECTION_IDS = new Set(['dashboard', 'operations', 'planning', 'people', 'documents'])
const DIRECTOR_PATHS = new Set([
  '/meal-count',                                     // Operations → Meal Count (director view)
  '/menu/current',                                   // Planning → Current Menu ONLY (no /menu planner)
  '/children', '/enrollment-inbox', '/staff',        // People
  '/documents', '/instructions', '/document-hub',    // Documents
])
// Relabel single-purpose sections so the director's flyouts read clearly and the
// dashboard reads as their home.
const DIRECTOR_SECTION_LABELS: Record<string, string> = {
  dashboard:  'Director Home',
  operations: 'Meal Count',
  planning:   'Menu',
}
function directorSections(secs: Section[]): Section[] {
  return secs
    .filter(s => DIRECTOR_SECTION_IDS.has(s.id))
    .map(s => {
      const label = DIRECTOR_SECTION_LABELS[s.id] ?? s.label
      return s.items
        ? { ...s, label, items: s.items.filter(it => DIRECTOR_PATHS.has(it.path)) }
        : { ...s, label }
    })
    .filter(s => s.noFlyout || (s.items != null && s.items.length > 0))
}

// ── legacy flat nav (used for cook/teacher fallback) ──────────
const NAV_ITEMS: NavItem[] = [
  { path: '/dashboard',         label: 'Dashboard',      icon: '⊞' },
  { path: '/meal-count',        label: 'Meal Count',     icon: '🍽️' },
  { path: '/delivery',          label: 'Delivery',       icon: '🚐', roles: ['director','driver'] },
  { path: '/instructions',      label: 'Instructions',   icon: '📖' },
]

export default function AppLayout() {
  usePushNotifications() // Auto-subscribe to push notifications
  const { user, role, signOut } = useAuth()
  const { modules, navModules } = useOrg()
  const navigate = useNavigate()
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(false)

  // flyout state
  const [flyId, setFlyId] = useState<string | null>(null)
  const [flyTop, setFlyTop] = useState(0)
  const sbRef = useRef<HTMLElement>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const SB_FULL = 240
  const SB_COLL = 58
  const sidebarWidth = collapsed ? SB_COLL : SB_FULL
  const OVERLAP = Math.round(sidebarWidth * 0.4)

  function openFly(id: string, triggerEl: HTMLElement) {
    if (hideTimer.current) clearTimeout(hideTimer.current)
    const sbRect = sbRef.current?.getBoundingClientRect()
    const trRect = triggerEl.getBoundingClientRect()
    if (sbRect) setFlyTop(trRect.top - sbRect.top)
    setFlyId(id)
  }

  function schedulHide(id: string) {
    hideTimer.current = setTimeout(() => {
      setFlyId(prev => prev === id ? null : prev)
    }, 120)
  }

  function cancelHide() {
    if (hideTimer.current) clearTimeout(hideTimer.current)
  }

  const isCook = role === 'cook'
  const isCookOrTeacher = isCook || (role as string) === 'teacher'

  const handleSignOut = async () => { await signOut(); navigate('/login') }

  const hasCACFP = modules.includes('cacfp')

  // Director desktop: a director sees only their curated sections; every other
  // role keeps the full sidebar unchanged.
  const directorMode = role === 'director'
  const sections = directorMode ? directorSections(SECTIONS) : SECTIONS

  // block check (kept from original)
  const usingPerms = Array.isArray(navModules) && navModules.length > 0
  const permItems = usingPerms
    ? [...navModules!].sort((a, b) => a.sort_order - b.sort_order)
        .map(m => ({ path: routeForModule(m.module_code), label: m.label, icon: m.icon || MODULE_ICON_FALLBACK[m.module_code] || '•' }))
    : []
  const allowedPaths = usingPerms ? new Set(permItems.map(i => i.path)) : null
  const basePath = '/' + (location.pathname.split('/')[1] || 'dashboard')
  const cookAllowed = isCookOrTeacher && (basePath === '/meal-count' || (isCook && basePath === '/delivery'))
  // Permission gate (Variant B): block only KNOWN module routes the user's
  // permission set doesn't include. Dashboard + Messages are always allowed;
  // cook/teacher meal-count/delivery handled by cookAllowed. When the RPC
  // returned no modules (usingPerms=false) we fall back to legacy role nav and
  // never block. Admin/office_manager hold all modules → never blocked.
  const blocked =
    usingPerms &&
    basePath !== '/dashboard' &&
    basePath !== '/messages' &&
    !cookAllowed &&
    KNOWN_MODULE_ROUTES.has(basePath) &&
    !allowedPaths!.has(basePath)

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f4f6f4', fontFamily: "'DM Sans', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Serif+Display&display=swap" rel="stylesheet"/>
      <link href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.19.0/dist/tabler-icons.min.css" rel="stylesheet"/>

      {/* Sidebar */}
      <aside ref={sbRef} style={{
        width: sidebarWidth, minHeight: '100vh', background: '#2d5a45',
        display: 'flex', flexDirection: 'column',
        transition: 'width 0.22s ease', position: 'fixed',
        left: 0, top: 0, bottom: 0, zIndex: 100, overflow: 'visible',
      }}>

        {/* Logo */}
        <div style={{
          padding: collapsed ? '16px 0' : '14px 14px 12px',
          borderBottom: '0.5px solid rgba(255,255,255,0.12)',
          display: 'flex', alignItems: 'center', gap: 10,
          justifyContent: collapsed ? 'center' : 'flex-start',
          overflow: 'hidden', whiteSpace: 'nowrap', minHeight: 52,
        }}>
          <i className="ti ti-tool-kitchen-2" style={{ fontSize: 20, color: '#a7f0d0', flexShrink: 0 }} />
          {!collapsed && (
            <div>
              <div style={{ color: '#fff', fontSize: 14, fontWeight: 500 }}>ClickClaim CACFP</div>
              <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11 }}>Play Academy</div>
            </div>
          )}
        </div>

        {/* Toggle button */}
        <button onClick={() => setCollapsed(c => !c)} style={{
          position: 'absolute', right: -11, top: 16,
          width: 22, height: 22, borderRadius: '50%',
          background: '#2d5a45', border: '0.5px solid rgba(255,255,255,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', color: 'rgba(255,255,255,0.8)', fontSize: 13, zIndex: 30,
        }}>
          <i className={collapsed ? 'ti ti-chevron-right' : 'ti ti-chevron-left'} />
        </button>

        {/* Organization switcher */}
        <CenterSwitcher collapsed={collapsed} onOpen={openFly} onLeave={schedulHide} onEnterFly={cancelHide} flyId={flyId} flyTop={flyTop} sidebarWidth={sidebarWidth} overlap={OVERLAP} />

        {/* Nav */}
        <nav style={{ flex: 1, padding: '6px 0', overflowY: 'auto', overflowX: 'visible' }}>
          {isCookOrTeacher ? (
            // Simple nav for cook/teacher
            NAV_ITEMS.filter(item => item.path === '/meal-count' || item.path === '/instructions' || (isCook && item.path === '/delivery')).map(item => (
              <NavLink key={item.path} to={item.path} style={({ isActive }) => navStyle(isActive, collapsed)}>
                <span style={{ fontSize: 16, flexShrink: 0 }}>{item.icon}</span>
                {!collapsed && <span style={{ fontSize: 14 }}>{item.label}</span>}
              </NavLink>
            ))
          ) : (
            sections.map((sec, si) => {
              const isDivided = si > 0 && (
                (sec.id === 'reports') ||
                (sec.id === 'settings')
              )
              const isActiveSec = sec.noFlyout
                ? location.pathname === (sec.id === 'dashboard' ? '/dashboard' : '/settings')
                : sec.items?.some(it => location.pathname.startsWith(it.path)) ?? false

              return (
                <Fragment key={sec.id}>
                  {isDivided && <div style={{ height: '0.5px', background: 'rgba(255,255,255,0.1)', margin: '4px 0' }} />}
                  <div
                    style={{ position: 'relative' }}
                    onMouseEnter={e => {
                      if (!sec.noFlyout) openFly(sec.id, e.currentTarget as HTMLElement)
                    }}
                    onMouseLeave={() => {
                      if (!sec.noFlyout) schedulHide(sec.id)
                    }}
                  >
                    {sec.noFlyout ? (
                      <NavLink
                        to={sec.id === 'dashboard' ? '/dashboard' : '/settings'}
                        style={({ isActive }) => navStyle(isActive, collapsed)}
                      >
                        {sec.icon.startsWith('ti-') ? <i className={`ti ${sec.icon}`} style={{ fontSize: 18, width: 20, textAlign: 'center', flexShrink: 0 }} /> : <span style={{ fontSize: 15, width: 20, textAlign: 'center', display: 'inline-block' }}>{sec.icon}</span>}
                        {!collapsed && <span style={{ fontSize: 14 }}>{sec.label}</span>}
                      </NavLink>
                    ) : (
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: collapsed ? '11px 0' : '11px 16px',
                        justifyContent: collapsed ? 'center' : 'flex-start',
                        cursor: 'pointer',
                        color: isActiveSec ? '#fff' : 'rgba(255,255,255,0.7)',
                        background: isActiveSec ? 'rgba(255,255,255,0.1)' : flyId === sec.id ? 'rgba(255,255,255,0.08)' : 'transparent',
                        borderLeft: isActiveSec ? '3px solid #a7f0d0' : '3px solid transparent',
                        fontSize: 14, whiteSpace: 'nowrap',
                        transition: 'background 0.12s, color 0.12s',
                      }}>
                        {sec.icon.startsWith('ti-') ? <i className={`ti ${sec.icon}`} style={{ fontSize: 18, width: 20, textAlign: 'center', flexShrink: 0 }} /> : <span style={{ fontSize: 15, width: 20, textAlign: 'center', display: 'inline-block' }}>{sec.icon}</span>}
                        {!collapsed && <span>{sec.label}</span>}
                        {!collapsed && <i className="ti ti-chevron-right" style={{ marginLeft: 'auto', fontSize: 13, color: 'rgba(255,255,255,0.25)' }} />}
                      </div>
                    )}
                  </div>
                </Fragment>
              )
            })
          )}
        </nav>

        {/* User row */}
        <div style={{ borderTop: '0.5px solid rgba(255,255,255,0.12)', padding: collapsed ? '12px 0' : '12px 14px' }}>
          {!collapsed && (
            <div style={{ marginBottom: 10 }}>
              <div style={{
                display: 'inline-block', padding: '3px 8px', borderRadius: 6,
                background: ((role && ROLE_COLORS[role]) || '#333') + '30',
                border: `1px solid ${(role && ROLE_COLORS[role]) || '#333'}50`,
                color: '#a7f0d0', fontSize: 10, fontWeight: 600,
                letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4,
              }}>
                {role ? (ROLE_LABELS[role] || role) : 'System Administrator'}
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user?.email}
              </div>
              <div title="deployed build" style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 3, fontFamily: 'monospace' }}>
                build {__BUILD_ID__}
              </div>
            </div>
          )}
          {collapsed && (
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
              <div style={{
                width: 30, height: 30, borderRadius: '50%', background: '#1a5c3f',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 500, color: '#a7f0d0',
              }}>
                {(user?.email?.[0] || 'A').toUpperCase()}
              </div>
            </div>
          )}
          <div style={{ display: 'flex', gap: 6, justifyContent: collapsed ? 'center' : 'flex-start' }}>
            {!collapsed && (
              <button onClick={handleSignOut} style={{
                flex: 1, padding: '6px 10px', borderRadius: 6,
                border: '1px solid rgba(255,255,255,0.15)', background: 'transparent',
                color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit',
              }}>
                Sign Out
              </button>
            )}
          </div>
        </div>

        {/* Flyout panels */}
        {sections.filter(s => !s.noFlyout && s.items).map(sec => (
          <div
            key={sec.id}
            onMouseEnter={cancelHide}
            onMouseLeave={() => schedulHide(sec.id)}
            style={{
              position: 'absolute',
              left: sidebarWidth - OVERLAP,
              top: flyTop,
              background: '#3d7a5e',
              border: '0.5px solid rgba(255,255,255,0.15)',
              borderRadius: 10,
              minWidth: 200,
              padding: '8px 0',
              opacity: flyId === sec.id ? 1 : 0,
              pointerEvents: flyId === sec.id ? 'all' : 'none',
              transition: 'opacity 0.15s, transform 0.15s',
              transform: flyId === sec.id ? 'translateX(0)' : 'translateX(-4px)',
              zIndex: 200,
              boxShadow: '6px 8px 28px rgba(0,0,0,0.28)',
            }}
          >
            <div style={{ padding: '8px 14px 6px', fontSize: 10, fontWeight: 500, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              {sec.label}
            </div>
            {sec.items!.map(item => (
              item.path.startsWith('http') ? (
                <a key={item.path} href={item.path} target="_blank" rel="noreferrer" style={flyItemStyle(false)}>
                  <i className={`ti ${item.icon}`} style={{ fontSize: 15, color: 'rgba(255,255,255,0.35)' }} />
                  {item.label}
                </a>
              ) : (
                <NavLink key={item.path + item.label} to={item.path} style={({ isActive }) => flyItemStyle(isActive)} onClick={() => setFlyId(null)}>
                  <i className={`ti ${item.icon}`} style={{ fontSize: 15, color: 'rgba(255,255,255,0.35)' }} />
                  {item.label}
                </NavLink>
              )
            ))}
          </div>
        ))}
      </aside>

      <main style={{ flex: 1, marginLeft: sidebarWidth, transition: 'margin-left 0.22s ease', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        {blocked ? <Forbidden /> : <Outlet />}
      </main>
    </div>
  )
}

function navStyle(isActive: boolean, collapsed: boolean): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: collapsed ? '11px 0' : '11px 16px',
    justifyContent: collapsed ? 'center' : 'flex-start',
    color: isActive ? '#fff' : 'rgba(255,255,255,0.7)',
    background: isActive ? 'rgba(255,255,255,0.1)' : 'transparent',
    borderLeft: isActive ? '3px solid #a7f0d0' : '3px solid transparent',
    textDecoration: 'none', fontSize: 14, whiteSpace: 'nowrap',
    transition: 'background 0.12s, color 0.12s',
  }
}

function flyItemStyle(isActive: boolean): React.CSSProperties {
  return {
    padding: '9px 16px', fontSize: 13,
    color: isActive ? '#a7f0d0' : 'rgba(255,255,255,0.75)',
    background: isActive ? 'rgba(255,255,255,0.08)' : 'transparent',
    borderLeft: isActive ? '3px solid #a7f0d0' : '3px solid transparent',
    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 9,
    whiteSpace: 'nowrap', textDecoration: 'none',
    fontWeight: isActive ? 500 : 400,
    transition: 'color 0.1s, background 0.1s',
  }
}

// ── CenterSwitcher ────────────────────────────────────────────
function CenterSwitcher({ collapsed, onOpen, onLeave, onEnterFly, flyId, flyTop, sidebarWidth, overlap }: {
  collapsed: boolean
  onOpen: (id: string, el: HTMLElement) => void
  onLeave: (id: string) => void
  onEnterFly: () => void
  flyId: string | null
  flyTop: number
  sidebarWidth: number
  overlap: number
}) {
  const { isOrgAdmin, centers, currentCenter, viewMode, setCurrentCenter } = useOrg()
  const short = (n?: string | null) => (n ?? '').replace(/^Play Academy\s+/i, '').trim() || '—'

  if (!currentCenter && !isOrgAdmin) return null

  const label = viewMode === 'org' ? 'Organization' : short(currentCenter?.name)

  return (
    <div
      style={{ margin: '10px 10px 6px', position: 'relative' }}
      onMouseEnter={e => isOrgAdmin && onOpen('__org__', e.currentTarget as HTMLElement)}
      onMouseLeave={() => isOrgAdmin && onLeave('__org__')}
    >
      <div style={{
        display: 'flex', alignItems: 'center', gap: 9,
        padding: collapsed ? '9px 10px' : '9px 12px',
        background: '#3d7a5e', borderRadius: 8, cursor: 'pointer',
        border: '0.5px solid rgba(255,255,255,0.15)',
        justifyContent: collapsed ? 'center' : 'flex-start',
        whiteSpace: 'nowrap', transition: 'background 0.1s',
      }}>
        <i className="ti ti-building-community" style={{ fontSize: 17, color: '#a7f0d0', flexShrink: 0 }} />
        {!collapsed && <span style={{ color: '#fff', fontSize: 13, fontWeight: 500, flex: 1 }}>{label}</span>}
        {!collapsed && isOrgAdmin && <i className="ti ti-chevron-right" style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }} />}
      </div>

      {/* Flyout for org switcher */}
      {isOrgAdmin && (
        <div
          onMouseEnter={onEnterFly}
          onMouseLeave={() => onLeave('__org__')}
          style={{
            position: 'fixed',
            left: sidebarWidth - overlap,
            top: flyTop + (collapsed ? 10 : 10),
            background: '#3d7a5e',
            border: '0.5px solid rgba(255,255,255,0.15)',
            borderRadius: 10, minWidth: 200, padding: '8px 0',
            opacity: flyId === '__org__' ? 1 : 0,
            pointerEvents: flyId === '__org__' ? 'all' : 'none',
            transition: 'opacity 0.15s, transform 0.15s',
            transform: flyId === '__org__' ? 'translateX(0)' : 'translateX(-4px)',
            zIndex: 200, boxShadow: '6px 8px 28px rgba(0,0,0,0.28)',
          }}
        >
          <div style={{ padding: '8px 14px 6px', fontSize: 10, fontWeight: 500, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Center
          </div>
          <div
            onClick={() => setCurrentCenter(null)}
            style={{ ...orgItemStyle, color: viewMode === 'org' ? '#a7f0d0' : 'rgba(255,255,255,0.75)', fontWeight: viewMode === 'org' ? 500 : 400 }}
          >
            <i className="ti ti-building-community" style={{ fontSize: 15 }} /> Organization
          </div>
          <div style={{ height: '0.5px', background: 'rgba(255,255,255,0.1)', margin: '4px 0' }} />
          {centers.map(c => (
            <div
              key={c.id}
              onClick={() => setCurrentCenter(c)}
              style={{ ...orgItemStyle, color: currentCenter?.id === c.id && viewMode !== 'org' ? '#a7f0d0' : 'rgba(255,255,255,0.75)' }}
            >
              <i className="ti ti-building" style={{ fontSize: 15 }} /> {short(c.name)}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const orgItemStyle: React.CSSProperties = {
  padding: '9px 16px', fontSize: 13, cursor: 'pointer',
  display: 'flex', alignItems: 'center', gap: 9, whiteSpace: 'nowrap',
  transition: 'color 0.1s, background 0.1s',
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
        You don't have access to this section. If you think this is a mistake, ask an administrator
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
