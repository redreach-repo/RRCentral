import type { Session, User } from '@supabase/supabase-js'
import { getSupabaseClient, isSupabaseConfigured } from './supabaseConfig'
import { initLocalDb, localDb, DEFAULT_ADMINS } from './localDb'
import { isAllowedLoginEmail, loginEmailDomainError, normalizeEmail } from './allowedLoginEmail'

const LOCAL_SESSION_KEY = 'rrcentral_local_session'

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

export const localAuth = {
  async signInWithEmail(email: string) {
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
    return { data: { session, user: session.user, magicLinkSent: false }, error: null }
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
  /** Local: signs in immediately. Cloud: sends a magic link to Zoho mail. */
  signInWithEmail?: (email: string) => Promise<{
    data: { session: Session | null; user: User | null; magicLinkSent?: boolean }
    error: { message: string } | null
  }>
  listSeedEmails?: () => Promise<string[]>
}

function loginRedirectUrl(): string {
  const base = import.meta.env.BASE_URL || '/'
  const path = `${base.replace(/\/?$/, '/') }login`
  return new URL(path, window.location.origin).href
}

function supabaseAuthApi(): AuthApi {
  const supabase = getSupabaseClient()
  return {
    getSession: () => supabase.auth.getSession(),
    onAuthStateChange: (cb) => supabase.auth.onAuthStateChange(cb),
    signOut: () => supabase.auth.signOut(),
    signInWithEmail: async (email) => {
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
      const { error } = await supabase.auth.signInWithOtp({
        email: normalized,
        options: {
          emailRedirectTo: loginRedirectUrl(),
          shouldCreateUser: true,
        },
      })
      if (error) {
        const message =
          /rate limit|over_email_send_rate_limit/i.test(error.message)
            ? 'email rate limit exceeded'
            : error.message
        return { data: { session: null, user: null }, error: { message } }
      }
      return {
        data: { session: null, user: null, magicLinkSent: true },
        error: null,
      }
    },
  }
}

function localAuthApi(): AuthApi {
  return {
    getSession: () => localAuth.getSession(),
    onAuthStateChange: (cb) => localAuth.onAuthStateChange(cb),
    signOut: () => localAuth.signOut(),
    signInWithEmail: (email) => localAuth.signInWithEmail(email),
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
