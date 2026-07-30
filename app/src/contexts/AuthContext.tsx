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
import { authApi, isSupabaseConfigured } from '../lib/authApi'
import { authMode } from '../lib/db'
import { db } from '../lib/db'
import { tryAutoImportSheetsDump } from '../lib/migrateFromSheets'
import type { UserRole } from '../lib/types'

interface AuthContextValue {
  user: User | null
  userRole: UserRole
  signIn: () => Promise<void>
  signInWithEmail: (email: string) => Promise<void>
  signOut: () => Promise<void>
  loading: boolean
  authMode: 'supabase' | 'local'
  isLocalMode: boolean
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

async function lookupUserRole(email: string | undefined): Promise<UserRole> {
  if (!email) return 'sales'

  const { data, error } = await db
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

    void (async () => {
      try {
        await Promise.race([
          tryAutoImportSheetsDump(),
          new Promise<void>((resolve) => setTimeout(resolve, 8000)),
        ])
      } catch {
        // ignore — empty seed is fine
      }

      try {
        const {
          data: { session },
        } = await authApi.getSession()
        if (!mounted) return
        const currentUser = session?.user ?? null
        setUser(currentUser)
        setUserRole(await lookupUserRole(currentUser?.email))
      } catch {
        if (!mounted) return
        setUser(null)
        setUserRole('sales')
      } finally {
        if (mounted) setLoading(false)
      }
    })()

    const {
      data: { subscription },
    } = authApi.onAuthStateChange((_event, session) => {
      const currentUser = session?.user ?? null
      setUser(currentUser)
      void (async () => {
        try {
          setUserRole(await lookupUserRole(currentUser?.email))
        } finally {
          setLoading(false)
        }
      })()
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  const signIn = useCallback(async () => {
    if (!authApi.signInWithOAuth) {
      throw new Error('Google sign-in is only available with Supabase')
    }
    await authApi.signInWithOAuth({ provider: 'google' })
  }, [])

  const signInWithEmail = useCallback(async (email: string) => {
    if (!authApi.signInWithEmail) {
      throw new Error('Email sign-in is only available in local mode')
    }
    const { error } = await authApi.signInWithEmail(email)
    if (error) throw new Error(error.message)
  }, [])

  const signOut = useCallback(async () => {
    await authApi.signOut()
    setUser(null)
    setUserRole('sales')
  }, [])

  const value = useMemo(
    () => ({
      user,
      userRole,
      signIn,
      signInWithEmail,
      signOut,
      loading,
      authMode,
      isLocalMode: !isSupabaseConfigured,
    }),
    [user, userRole, signIn, signInWithEmail, signOut, loading],
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
