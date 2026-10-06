import type { Session, User } from '@supabase/supabase-js'
import { getSupabaseClient, isSupabaseConfigured } from './supabaseConfig'
import { initLocalDb, localDb, DEFAULT_ADMINS } from './localDb'
import { isAllowedLoginEmail, loginEmailDomainError, normalizeEmail } from './allowedLoginEmail'

const LOCAL_SESSION_KEY = 'rrcentral_local_session'
export const MIN_PASSWORD_LENGTH = 8

type AuthChangeCallback = (event: string, session: Session | null) => void

function makeLocalUser(email: string): User {
  const id = `local-${email.toLowerCase()}`
  const now = new Date().toISOString()
  return {
    id,
    app_metadata: { provider: 'local' },
    user_metadata: { email },
    aud: 'authenticated',
    created_at: now,
    email,
    role: 'authenticated',
    updated_at: now,
  } as User
}

function makeLocalSession(email: string): Session {
  const user = makeLocalUser(email)
  return {
    access_token: 'local',
    refresh_token: 'local',
    expires_in: 60 * 60 * 24 * 365,
    token_type: 'bearer',
    user,
  } as Session
}

function readLocalSession(): Session | null {
  try {
    const raw = localStorage.getItem(LOCAL_SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { email?: string }
    if (!parsed.email) return null
    return makeLocalSession(parsed.email)
  } catch {
    return null
  }
}

function writeLocalSession(email: string | null) {
  if (!email) {
    localStorage.removeItem(LOCAL_SESSION_KEY)
    return
  }
  localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify({ email }))
}

const localListeners = new Set<AuthChangeCallback>()

function notifyLocal(event: string, session: Session | null) {
  for (const cb of localListeners) {
    cb(event, session)
  }
}

function assertPassword(password: string) {
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`
  }
  return null
}

export const localAuth = {
  async signInWithPassword(email: string, _password: string) {
    const normalized = normalizeEmail(email)
    if (!normalized || !normalized.includes('@')) {
      return { data: { session: null, user: null }, error: { message: 'Enter a valid email' } }
    }
    if (!isAllowedLoginEmail(normalized)) {
      return {
        data: { session: null, user: null },
        error: { message: loginEmailDomainError(normalized) },
      }
    }

    await initLocalDb()

    const { data: existing } = await localDb
      .from('app_users')
      .select('*')
      .eq('email', normalized)
      .maybeSingle()

    if (!existing) {
      const seed = DEFAULT_ADMINS.find((a) => a.email.toLowerCase() === normalized)
      await localDb.from('app_users').insert({
        email: normalized,
        name: seed?.name || normalized.split('@')[0],
        role: seed ? 'admin' : 'sales',
        active: true,
        created_at: new Date().toISOString(),
      })
    }

    writeLocalSession(normalized)
    const session = makeLocalSession(normalized)
    notifyLocal('SIGNED_IN', session)
    return { data: { session, user: session.user }, error: null }
  },

  /** Local mode has no real password store — treated as success. */
  async updatePassword(_newPassword: string) {
    return { error: null as { message: string } | null }
  },

  async getSession() {
    return { data: { session: readLocalSession() }, error: null }
  },

  onAuthStateChange(callback: AuthChangeCallback) {
    localListeners.add(callback)
    queueMicrotask(() => {
      callback('INITIAL_SESSION', readLocalSession())
    })
    return {
      data: {
        subscription: {
          unsubscribe() {
            localListeners.delete(callback)
          },
        },
      },
    }
  },

  async signOut() {
    writeLocalSession(null)
    notifyLocal('SIGNED_OUT', null)
    return { error: null }
  },

  async listSeedEmails(): Promise<string[]> {
    await initLocalDb()
    const { data } = await localDb.from('app_users').select('email').order('email')
    const rows = (data || []) as { email: string }[]
    const emails = rows
      .map((r) => normalizeEmail(r.email || ''))
      .filter((e) => isAllowedLoginEmail(e))
    const unique = [...new Set(emails)].sort((a, b) => a.localeCompare(b))
    if (unique.length > 0) return unique
    return DEFAULT_ADMINS.map((a) => a.email).filter(isAllowedLoginEmail)
  },
}

export type AuthApi = {
  getSession: () => Promise<{ data: { session: Session | null }; error: unknown }>
  onAuthStateChange: (callback: AuthChangeCallback) => {
    data: { subscription: { unsubscribe: () => void } }
  }
  signOut: () => Promise<{ error: unknown }>
  /** Email + password sign-in (cloud and local). */
  signInWithPassword?: (
    email: string,
    password: string,
  ) => Promise<{
    data: { session: Session | null; user: User | null }
    error: { message: string } | null
  }>
  /** Signed-in user changes their own password. */
  updatePassword?: (newPassword: string) => Promise<{ error: { message: string } | null }>
  /**
   * Admin sets / creates Auth password for a teammate (cloud: edge function).
   * Local mode is a no-op success.
   */
  adminSetPassword?: (
    email: string,
    password: string,
    name?: string,
  ) => Promise<{ error: { message: string } | null }>
  listSeedEmails?: () => Promise<string[]>
}

function supabaseAuthApi(): AuthApi {
  const supabase = getSupabaseClient()
  return {
    getSession: () => supabase.auth.getSession(),
    onAuthStateChange: (cb) => supabase.auth.onAuthStateChange(cb),
    signOut: () => supabase.auth.signOut(),
    signInWithPassword: async (email, password) => {
      const normalized = normalizeEmail(email)
      if (!normalized || !normalized.includes('@')) {
        return { data: { session: null, user: null }, error: { message: 'Enter a valid email' } }
      }
      if (!isAllowedLoginEmail(normalized)) {
        return {
          data: { session: null, user: null },
          error: { message: loginEmailDomainError(normalized) },
        }
      }
      const pwdErr = assertPassword(password)
      if (pwdErr) {
        return { data: { session: null, user: null }, error: { message: pwdErr } }
      }
      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalized,
        password,
      })
      if (error) {
        return { data: { session: null, user: null }, error: { message: error.message } }
      }
      return { data: { session: data.session, user: data.user }, error: null }
    },
    updatePassword: async (newPassword) => {
      const pwdErr = assertPassword(newPassword)
      if (pwdErr) return { error: { message: pwdErr } }
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      return { error: error ? { message: error.message } : null }
    },
    adminSetPassword: async (email, password, name) => {
      const normalized = normalizeEmail(email)
      if (!isAllowedLoginEmail(normalized)) {
        return { error: { message: loginEmailDomainError(normalized) } }
      }
      const pwdErr = assertPassword(password)
      if (pwdErr) return { error: { message: pwdErr } }

      const { data, error } = await supabase.functions.invoke('manage-auth-user', {
        body: { email: normalized, password, name: name || undefined },
      })
      if (error) {
        let detail = error.message || 'Could not set password'
        try {
          const ctx = (error as { context?: Response }).context
          if (ctx && typeof ctx.json === 'function') {
            const body = (await ctx.json()) as {
              error?: string
              message?: string
              code?: string
              hint?: string
            }
            if (body?.error) detail = body.error
            else if (body?.message) detail = body.message
            if (body?.code === 'INVALID_API_KEY' || /INVALID_API_KEY|sb_publishable/i.test(detail)) {
              detail =
                'manage-auth-user is using the wrong template. In Supabase → Edge Functions → manage-auth-user: paste the Deno.serve code from the repo, set Verify JWT = OFF, redeploy.'
            }
          }
        } catch {
          /* ignore */
        }
        if (/failed to send|404|not found|FunctionsFetchError|Failed to fetch/i.test(detail)) {
          return {
            error: {
              message:
                'Deploy manage-auth-user in Supabase (Verify JWT off), then try again.',
            },
          }
        }
        return { error: { message: detail } }
      }
      const payload = data as { error?: string; ok?: boolean } | null
      if (payload?.error) return { error: { message: payload.error } }
      return { error: null }
    },
  }
}

function localAuthApi(): AuthApi {
  return {
    getSession: () => localAuth.getSession(),
    onAuthStateChange: (cb) => localAuth.onAuthStateChange(cb),
    signOut: () => localAuth.signOut(),
    signInWithPassword: (email, password) => localAuth.signInWithPassword(email, password),
    updatePassword: (password) => localAuth.updatePassword(password),
    adminSetPassword: async () => ({ error: null }),
    listSeedEmails: () => localAuth.listSeedEmails(),
  }
}

/** Resolves to Supabase or local auth based on current config. */
export const authApi: AuthApi = new Proxy({} as AuthApi, {
  get(_t, prop) {
    const api = isSupabaseConfigured() ? supabaseAuthApi() : localAuthApi()
    const value = api[prop as keyof AuthApi]
    return typeof value === 'function' ? value.bind(api) : value
  },
})

export { isSupabaseConfigured }
