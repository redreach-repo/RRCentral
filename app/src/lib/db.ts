import { isSupabaseConfigured, supabase } from './supabase'
import { localDb } from './localDb'

export { isSupabaseConfigured }

/**
 * Query client: Supabase when configured, IndexedDB otherwise.
 * Typed loosely so existing call sites (select/eq/maybeSingle chains) type-check
 * against both backends.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const db: any = isSupabaseConfigured ? supabase : localDb

export const authMode = isSupabaseConfigured ? ('supabase' as const) : ('local' as const)
