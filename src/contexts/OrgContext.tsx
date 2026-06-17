import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

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

interface OrgContextType {
  org: Org | null
  centers: Center[]
  orgRole: 'admin' | 'director' | null
  modules: string[]
  currentCenter: Center | null
  setCurrentCenter: (c: Center) => void
  loading: boolean
}

const OrgContext = createContext<OrgContextType | undefined>(undefined)

export function OrgProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const [org, setOrg]                       = useState<Org | null>(null)
  const [centers, setCenters]               = useState<Center[]>([])
  const [orgRole, setOrgRole]               = useState<'admin' | 'director' | null>(null)
  const [modules, setModules]               = useState<string[]>([])
  const [currentCenter, setCurrentCenter]   = useState<Center | null>(null)
  const [loading, setLoading]               = useState(true)

  useEffect(() => {
    if (!session) {
      setOrg(null)
      setCenters([])
      setOrgRole(null)
      setModules([])
      setCurrentCenter(null)
      setLoading(false)
      return
    }

    let cancelled = false
    ;(async () => {
      setLoading(true)
      const { data, error } = await (supabase.rpc as any)('app_bootstrap')
      if (cancelled) return
      if (!error && data) {
        const list: Center[] = data.centers ?? []
        setOrg(data.org ?? null)
        setCenters(list)
        setOrgRole(data.org_role ?? null)
        setModules(data.modules ?? [])
        setCurrentCenter(list[0] ?? null)
      }
      setLoading(false)
    })()

    return () => { cancelled = true }
  }, [session])

  return (
    <OrgContext.Provider value={{ org, centers, orgRole, modules, currentCenter, setCurrentCenter, loading }}>
      {children}
    </OrgContext.Provider>
  )
}

export function useOrg() {
  const ctx = useContext(OrgContext)
  if (!ctx) throw new Error('useOrg must be used within OrgProvider')
  return ctx
}
