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
  /** False when signed in but not an active member of app_users (cloud mode). */
  hasAccess: boolean
  signIn: () => Promise<void>
  signInWithEmail: (email: string) => Promise<void>
  signOut: () => Promise<void>
  loading: boolean
  authMode: 'supabase' | 'local'
  isLocalMode: boolean
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

type Membership = { role: UserRole; active: boolean }

const NO_MEMBERSHIP: Membership = { role: 'sales', active: false }

/**
 * Look up the signed-in user in app_users. In cloud mode RLS only returns the
 * row to active team members, so "no row" means "no access".
 */
async function lookupMembership(email: string | undefined): Promise<Membership> {
  if (!email) return NO_MEMBERSHIP

  const { data, error } = await db
    .from('app_users')
    .select('role, active')
    .ilike('email', email.replace(/[\\%_]/g, '\\$&'))
    .maybeSingle()

  if (error || !data) return NO_MEMBERSHIP
  return { role: data.role === 'admin' ? 'admin' : 'sales', active: data.active !== false }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [membership, setMembership] = useState<Membership>(NO_MEMBERSHIP)
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
        setMembership(await lookupMembership(currentUser?.email))
      } catch {
        if (!mounted) return
        setUser(null)
        setMembership(NO_MEMBERSHIP)
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
          setMembership(await lookupMembership(currentUser?.email))
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
    setMembership(NO_MEMBERSHIP)
  }, [])

  const value = useMemo(
    () => ({
      user,
      userRole: membership.role,
      hasAccess: membership.active || !isSupabaseConfigured(),
      signIn,
      signInWithEmail,
      signOut,
      loading,
      authMode,
      isLocalMode: !isSupabaseConfigured(),
    }),
    [user, membership, signIn, signInWithEmail, signOut, loading],
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
