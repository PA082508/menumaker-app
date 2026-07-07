import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { User, Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

type UserRole =
  | 'owner'
  | 'admin'
  | 'director'
  | 'cook'
  | 'office_manager'
  | 'cacfp_inspector'
  | 'accountant'
  | 'driver'
  | 'purchaser'

interface AuthUser extends User {
  role?: UserRole
}

interface AuthContextType {
  user: AuthUser | null
  session: Session | null
  role: UserRole | null      // most-privileged single role (for default landing/tab)
  roles: UserRole[]          // ALL roles the user holds (for union-based gating)
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [role, setRole] = useState<UserRole | null>(null)
  const [roles, setRoles] = useState<UserRole[]>([])
  const [loading, setLoading] = useState(true)

  // Privilege ranking — most privileged first. When a user holds several roles
  // we surface the most privileged one (NOT the first alphabetically).
  const ROLE_RANK: Record<string, number> = {
    owner:          -1,
    admin:           0,
    office_manager:  1,
    director:        2,
    cacfp_inspector: 3,
    accountant:      4,
    purchaser:       5,
    cook:            6,
    driver:          7,
  }

  // Returns ALL roles the user holds, plus the most-privileged one.
  const fetchUserRoles = async (userId: string): Promise<{ all: UserRole[]; top: UserRole | null }> => {
    const { data } = await supabase
      .schema('menumaker')
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
    if (!data?.length) return { all: [], top: null }
    const all = data.map((r) => r.role as UserRole)
    const top = [...all].sort(
      (a, b) => (ROLE_RANK[a] ?? 99) - (ROLE_RANK[b] ?? 99)
    )[0] ?? null
    return { all, top }
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session)
      if (session?.user) {
        const { all, top } = await fetchUserRoles(session.user.id)
        setUser({ ...session.user, role: top ?? undefined })
        setRole(top)
        setRoles(all)
      }
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session)
        if (session?.user) {
          const { all, top } = await fetchUserRoles(session.user.id)
          setUser({ ...session.user, role: top ?? undefined })
          setRole(top)
          setRoles(all)
        } else {
          setUser(null)
          setRole(null)
          setRoles([])
        }
        setLoading(false)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ user, session, role, roles, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}

// Role-based access helpers
export const canManageMenu = (role: UserRole | null) =>
  role === 'director' || role === 'cook'

export const canViewFinance = (role: UserRole | null) =>
  role === 'director' || role === 'accountant'

export const canManagePurchases = (role: UserRole | null) =>
  role === 'director' || role === 'purchaser'

export const isDriver = (role: UserRole | null) => role === 'driver'
export const isInspector = (role: UserRole | null) => role === 'cacfp_inspector'
