import { getSupabaseClient, isSupabaseConfigured } from './supabaseConfig'
import { localDb } from './localDb'

export { isSupabaseConfigured }

/**
 * Query client: Supabase when configured (env or Settings), IndexedDB otherwise.
 */
function createDbProxy() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new Proxy({} as any, {
    get(_target, prop) {
      const backend = isSupabaseConfigured() ? getSupabaseClient() : localDb
      const value = (backend as Record<string | symbol, unknown>)[prop]
      return typeof value === 'function' ? value.bind(backend) : value
    },
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const db: any = createDbProxy()

export const authMode = isSupabaseConfigured() ? ('supabase' as const) : ('local' as const)

export function currentAuthMode(): 'supabase' | 'local' {
  return isSupabaseConfigured() ? 'supabase' : 'local'
}
