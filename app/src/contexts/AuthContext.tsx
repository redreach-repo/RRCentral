import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { UserRole } from '../lib/types'

interface AuthContextValue {
  user: User | null
  userRole: UserRole
  signIn: () => Promise<void>
  signOut: () => Promise<void>
  loading: boolean
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

async function lookupUserRole(email: string | undefined): Promise<UserRole> {
  if (!email) return 'sales'

  const { data, error } = await supabase
    .from('app_users')
    .select('role')
    .eq('email', email)
    .maybeSingle()

  if (error || !data?.role) return 'sales'
  return data.role === 'admin' ? 'admin' : 'sales'
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [userRole, setUserRole] = useState<UserRole>('sales')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!mounted) return
      const currentUser = session?.user ?? null
      setUser(currentUser)
      setUserRole(await lookupUserRole(currentUser?.email))
      setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const currentUser = session?.user ?? null
      setUser(currentUser)
      void (async () => {
        setUserRole(await lookupUserRole(currentUser?.email))
        setLoading(false)
      })()
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  const signIn = useCallback(async () => {
    await supabase.auth.signInWithOAuth({ provider: 'google' })
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setUser(null)
    setUserRole('sales')
  }, [])

  const value = useMemo(
    () => ({ user, userRole, signIn, signOut, loading }),
    [user, userRole, signIn, signOut, loading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
