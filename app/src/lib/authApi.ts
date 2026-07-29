import type { Session, User } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabase } from './supabase'
import { initLocalDb, localDb, DEFAULT_ADMINS } from './localDb'

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

/**
 * Local-mode auth: passwordless email picker for demos / GitHub Pages.
 * Seeds sales users on first sign-in if the email is not already in app_users.
 */
export const localAuth = {
  async signInWithEmail(email: string) {
    const normalized = email.trim().toLowerCase()
    if (!normalized || !normalized.includes('@')) {
      return { data: { session: null, user: null }, error: { message: 'Enter a valid email' } }
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

  async getSession() {
    return { data: { session: readLocalSession() }, error: null }
  },

  onAuthStateChange(callback: AuthChangeCallback) {
    localListeners.add(callback)
    // Fire current session asynchronously, matching Supabase timing
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
    if (rows.length > 0) return rows.map((r) => r.email)
    return DEFAULT_ADMINS.map((a) => a.email)
  },
}

export type AuthApi = {
  getSession: () => Promise<{ data: { session: Session | null }; error: unknown }>
  onAuthStateChange: (callback: AuthChangeCallback) => {
    data: { subscription: { unsubscribe: () => void } }
  }
  signOut: () => Promise<{ error: unknown }>
  signInWithOAuth?: (opts: { provider: 'google' }) => Promise<{ error: unknown }>
  signInWithEmail?: (email: string) => Promise<{
    data: { session: Session | null; user: User | null }
    error: { message: string } | null
  }>
  listSeedEmails?: () => Promise<string[]>
}

export const authApi: AuthApi = isSupabaseConfigured
  ? {
      getSession: () => supabase.auth.getSession(),
      onAuthStateChange: (cb) => supabase.auth.onAuthStateChange(cb),
      signOut: () => supabase.auth.signOut(),
      signInWithOAuth: (opts) => supabase.auth.signInWithOAuth(opts),
    }
  : {
      getSession: () => localAuth.getSession(),
      onAuthStateChange: (cb) => localAuth.onAuthStateChange(cb),
      signOut: () => localAuth.signOut(),
      signInWithEmail: (email) => localAuth.signInWithEmail(email),
      listSeedEmails: () => localAuth.listSeedEmails(),
    }

export { isSupabaseConfigured }
