import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { User, Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

type UserRole =
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
  role: UserRole | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [role, setRole] = useState<UserRole | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchUserRole = async (userId: string) => {
    const { data } = await supabase
      .schema('menumaker')
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .single()
    return (data?.role as UserRole) || null
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session)
      if (session?.user) {
        const userRole = await fetchUserRole(session.user.id)
        setUser({ ...session.user, role: userRole ?? undefined })
        setRole(userRole)
      }
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session)
        if (session?.user) {
          const userRole = await fetchUserRole(session.user.id)
          setUser({ ...session.user, role: userRole ?? undefined })
          setRole(userRole)
        } else {
          setUser(null)
          setRole(null)
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
    <AuthContext.Provider value={{ user, session, role, loading, signIn, signOut }}>
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
