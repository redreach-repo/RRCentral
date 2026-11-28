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
import { isAllowedLoginEmail, loginEmailDomainError } from '../lib/allowedLoginEmail'
import { normalizeUserRole } from '../lib/permissions'
import { DEMO_ROLE_EVENT, effectiveDemoRole } from '../lib/demo/demoRole'
import { isDemoBuild } from '../lib/demo/demoMode'
import type { UserRole } from '../lib/types'
import { isSalesLocked, hasUserPermission, type UserPermissionKey } from '../lib/userPermissions'
import { setCsvExportAllowed, setExportLogger } from '../lib/exportPolicy'
import { logExportOnServer, recordSignInOnce } from '../lib/securityLogStore'
import { isViewAsBrowser, signOutMeansStop, stopViewAs } from '../lib/viewAs'
import { TWO_STEP_ROLES, getAssuranceLevel } from '../lib/twoStep'

export const LOGIN_DOMAIN_REJECT_KEY = 'rrcentral_login_domain_reject'

interface AuthContextValue {
  user: User | null
  /** Effective role for the shell (demo build may override via presenter switcher). */
  userRole: UserRole
  /** Raw app_users role before any demo UI override. */
  membershipRole: UserRole
  /** app_users.id of the signed-in person (owner of accounts). Null in local mode or before lookup. */
  appUserId: string | null
  /** Tenant the signed-in member belongs to (RRCRM M1). */
  tenantId: string | null
  /** False when signed in but not an active member of app_users (cloud mode). */
  hasAccess: boolean
  /** Per-person switches (user_permissions) of the signed-in person. */
  permissions: string[]
  /** Sales without the "see company money" switch: own clients only, no money screens. */
  salesLocked: boolean
  /** Whether the signed-in person has a switch (admins and managers have all). */
  hasPermission: (key: UserPermissionKey) => boolean
  signInWithPassword: (email: string, password: string) => Promise<void>
  changePassword: (newPassword: string) => Promise<void>
  signOut: () => Promise<void>
  loading: boolean
  authMode: 'supabase' | 'local'
  isLocalMode: boolean
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

type Membership = {
  role: UserRole
  active: boolean
  id: string | null
  tenantId: string | null
  permissions: string[]
}

const NO_MEMBERSHIP: Membership = { role: 'sales', active: false, id: null, tenantId: null, permissions: [] }

/** Per-person switches. Before the Sales lockdown SQL the table is missing: no switches. */
async function lookupPermissions(userId: string | null): Promise<string[]> {
  if (!userId) return []
  try {
    const { data, error } = await db.from('user_permissions').select('permission').eq('user_id', userId)
    if (error || !data) return []
    return (data as { permission: string }[]).map((r) => String(r.permission))
  } catch {
    return []
  }
}

/**
 * Look up the signed-in user in app_users. In cloud mode RLS only returns the
 * row to active team members, so "no row" means "no access".
 */
async function lookupMembership(email: string | undefined): Promise<Membership> {
  if (!email) return NO_MEMBERSHIP

  const emailFilter = email.replace(/[\\%_]/g, '\\$&')
  let { data, error } = await db
    .from('app_users')
    .select('id, role, active, tenant_id')
    .ilike('email', emailFilter)
    .maybeSingle()

  // Pre-M1 databases may not have tenant_id yet — fall back so login still works.
  if (error) {
    const retry = await db
      .from('app_users')
      .select('id, role, active')
      .ilike('email', emailFilter)
      .maybeSingle()
    data = retry.data ? { ...retry.data, tenant_id: null } : null
    error = retry.error
  }

  if (error || !data) return NO_MEMBERSHIP
  const role = normalizeUserRole(data.role)
  const id = data.id ? String(data.id) : null
  return {
    role,
    active: data.active !== false,
    id,
    tenantId: data.tenant_id ? String(data.tenant_id) : null,
    // Switches only change anything for Sales; skip the lookup for everyone else.
    permissions: role === 'sales' ? await lookupPermissions(id) : [],
  }
}

async function rejectIfDisallowedDomain(user: User | null): Promise<User | null> {
  if (!user) return null
  if (isAllowedLoginEmail(user.email || '')) return user
  try {
    sessionStorage.setItem(LOGIN_DOMAIN_REJECT_KEY, loginEmailDomainError(user.email || ''))
  } catch {
    /* ignore */
  }
  await authApi.signOut()
  return null
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
        const currentUser = await rejectIfDisallowedDomain(session?.user ?? null)
        if (!mounted) return
        const nextMembership = await lookupMembership(currentUser?.email)
        if (!mounted) return
        setMembership(nextMembership)
        setUser(currentUser)
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
      void (async () => {
        try {
          const currentUser = await rejectIfDisallowedDomain(session?.user ?? null)
          if (!mounted) return
          const nextMembership = await lookupMembership(currentUser?.email)
          if (!mounted) return
          setMembership(nextMembership)
          setUser(currentUser)
        } finally {
          if (mounted) setLoading(false)
        }
      })()
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  const signInWithPassword = useCallback(async (email: string, password: string) => {
    if (!authApi.signInWithPassword) {
      throw new Error('Password sign-in is not available')
    }
    if (!isAllowedLoginEmail(email)) {
      throw new Error(loginEmailDomainError(email))
    }
    const { error } = await authApi.signInWithPassword(email, password)
    if (error) throw new Error(error.message)
  }, [])

  const changePassword = useCallback(async (newPassword: string) => {
    if (!authApi.updatePassword) {
      throw new Error('Change password is not available')
    }
    const { error } = await authApi.updatePassword(newPassword)
    if (error) throw new Error(error.message)
  }, [])

  const signOut = useCallback(async () => {
    // Admin View as: Sign out means Stop. A normal sign out here would end the
    // member's sign ins on all their own devices.
    if (isSupabaseConfigured() && (await signOutMeansStop())) {
      await stopViewAs()
      return
    }
    await authApi.signOut()
    setUser(null)
    setMembership(NO_MEMBERSHIP)
  }, [])

  // Demo presenter role switcher: re-read sessionStorage when the chrome fires DEMO_ROLE_EVENT.
  const [demoRoleTick, setDemoRoleTick] = useState(0)
  useEffect(() => {
    if (!isDemoBuild()) return
    const bump = () => setDemoRoleTick((n) => n + 1)
    window.addEventListener(DEMO_ROLE_EVENT, bump)
    return () => window.removeEventListener(DEMO_ROLE_EVENT, bump)
  }, [])

  const effectiveRole = effectiveDemoRole(membership.role)
  // Local mode has no database lock, so nothing is locked there either.
  const salesLocked = isSupabaseConfigured() && isSalesLocked(effectiveRole, membership.permissions)
  const canExportCsv =
    !isSupabaseConfigured() || effectiveRole !== 'sales' || membership.permissions.includes('export.csv')
  useEffect(() => {
    setCsvExportAllowed(canExportCsv)
  }, [canExportCsv])

  // Sales safeguards: CSV downloads go to the server log (and Sales' daily cap).
  useEffect(() => {
    setExportLogger(isSupabaseConfigured() && membership.active && membership.id ? logExportOnServer : null)
  }, [membership.active, membership.id])

  // Sign in history: once per tab, after two step where the role needs it.
  useEffect(() => {
    if (!isSupabaseConfigured() || !user || !membership.active || !membership.id) return
    // An admin viewing as this member is not the member signing in.
    if (isViewAsBrowser()) return
    const userId = membership.id
    const needsTwoStep = TWO_STEP_ROLES.includes(membership.role)
    void getAssuranceLevel()
      .then((level) => {
        const fullySignedIn = level.currentLevel === 'aal2'
        if (needsTwoStep && !fullySignedIn) return
        return recordSignInOnce(userId, fullySignedIn)
      })
      .catch(() => undefined)
  }, [user, membership.active, membership.id, membership.role])

  const hasPermission = useCallback(
    (key: UserPermissionKey) => hasUserPermission(effectiveRole, membership.permissions, key),
    [effectiveRole, membership.permissions],
  )

  const value = useMemo(
    () => ({
      user,
      userRole: effectiveRole,
      membershipRole: membership.role,
      appUserId: membership.id,
      tenantId: membership.tenantId,
      hasAccess: membership.active || !isSupabaseConfigured(),
      permissions: membership.permissions,
      salesLocked,
      hasPermission,
      signInWithPassword,
      changePassword,
      signOut,
      loading,
      authMode,
      isLocalMode: !isSupabaseConfigured(),
    }),
    // demoRoleTick forces a refresh when the presenter switches roles
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional tick dependency
    [user, membership, effectiveRole, salesLocked, hasPermission, signInWithPassword, changePassword, signOut, loading, demoRoleTick],
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
