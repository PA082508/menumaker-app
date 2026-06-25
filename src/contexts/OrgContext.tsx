import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { NavModule } from '@/lib/modules'

export interface Center {
  id: string
  slug: string
  name: string
  is_active: boolean
}

export interface Org {
  id: string
  slug: string
  name: string
}

// 'center' = a single concrete center is active (currentCenter set).
// 'org'    = Organization view (admin/office_manager only; currentCenter null).
export type ViewMode = 'center' | 'org'

interface OrgContextType {
  org: Org | null
  centers: Center[]                 // centers THIS user can access (admin = all org centers)
  orgRole: 'admin' | 'director' | null
  isOrgAdmin: boolean               // admin / office_manager → Organization Mode available
  modules: string[]
  navModules: NavModule[] | null    // Variant B: permission-driven nav (null = not loaded → role fallback)
  currentCenter: Center | null      // active center; null = Organization view
  viewMode: ViewMode                // 'org' iff currentCenter is null (only reachable when isOrgAdmin)
  setCurrentCenter: (c: Center | null) => void   // pass null → Organization view
  loading: boolean
}

const OrgContext = createContext<OrgContextType | undefined>(undefined)

export function OrgProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const [org, setOrg]                       = useState<Org | null>(null)
  const [centers, setCenters]               = useState<Center[]>([])
  const [orgRole, setOrgRole]               = useState<'admin' | 'director' | null>(null)
  const [isOrgAdmin, setIsOrgAdmin]         = useState(false)
  const [modules, setModules]               = useState<string[]>([])
  const [navModules, setNavModules]         = useState<NavModule[] | null>(null)
  const [currentCenter, setCurrentCenter]   = useState<Center | null>(null)
  const [loading, setLoading]               = useState(true)

  useEffect(() => {
    if (!session) {
      setOrg(null)
      setCenters([])
      setOrgRole(null)
      setIsOrgAdmin(false)
      setModules([])
      setNavModules(null)
      setCurrentCenter(null)
      setLoading(false)
      return
    }

    let cancelled = false
    ;(async () => {
      setLoading(true)
      const { data, error } = await (supabase.rpc as any)('app_bootstrap')
      if (cancelled) return
      let orgId: string | null = null
      if (!error && data) {
        const allCenters: Center[] = data.centers ?? []
        const oRole: 'admin' | 'director' | null = data.org_role ?? null
        const funcRoles: string[] = data.functional_roles ?? []
        const orgAdmin =
          oRole === 'admin' ||
          funcRoles.includes('admin') ||
          funcRoles.includes('office_manager')
        orgId = data.org?.id ?? null

        // Access-filter the centers: admin/office_manager → all org centers,
        // director/cook/teacher → only their assigned center(s). Without this,
        // app_bootstrap returns ALL org centers and a center-mode user would be
        // pinned to the wrong center (and pages could leak other centers' data).
        let accessible = allCenters
        if (orgId) {
          const { data: ac } = await (supabase.schema('menumaker').rpc as any)(
            'accessible_centers', { p_org_id: orgId }
          )
          if (!cancelled && Array.isArray(ac)) {
            const ids = new Set((ac as { center_id: string }[]).map(r => r.center_id))
            accessible = allCenters.filter(c => ids.has(c.id))
          }
        }
        if (cancelled) return

        setOrg(data.org ?? null)
        setOrgRole(oRole)
        setIsOrgAdmin(orgAdmin)
        setModules(data.modules ?? [])
        setCenters(accessible)
        // Org admins / office managers land in the Organization view by default
        // (currentCenter = null); they can pick a concrete center from the header.
        // Everyone else defaults to their (first) accessible center so center-scoped
        // pages (Meal Count, Reports, Menu…) filter correctly out of the box.
        setCurrentCenter(orgAdmin ? null : (accessible[0] ?? null))
      }

      // Variant B — permission-driven navigation. On failure leave navModules
      // null so AppLayout falls back to the legacy role-based gating.
      if (orgId) {
        const { data: mods, error: mErr } =
          await (supabase.schema('menumaker').rpc as any)('user_modules', { p_org_id: orgId })
        if (!cancelled && !mErr && Array.isArray(mods)) {
          setNavModules(mods as NavModule[])
        }
      }

      if (!cancelled) setLoading(false)
    })()

    return () => { cancelled = true }
  }, [session])

  const viewMode: ViewMode = currentCenter ? 'center' : 'org'

  return (
    <OrgContext.Provider value={{
      org, centers, orgRole, isOrgAdmin, modules, navModules,
      currentCenter, viewMode, setCurrentCenter, loading,
    }}>
      {children}
    </OrgContext.Provider>
  )
}

export function useOrg() {
  const ctx = useContext(OrgContext)
  if (!ctx) throw new Error('useOrg must be used within OrgProvider')
  return ctx
}
