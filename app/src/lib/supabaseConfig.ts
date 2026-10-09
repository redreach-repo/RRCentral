import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const LS_URL = 'rrcentral_supabase_url'
const LS_KEY = 'rrcentral_supabase_anon_key'

export type SupabaseRuntimeConfig = {
  url: string
  anonKey: string
  source: 'env' | 'runtime' | 'none'
}

function clean(value: string | null | undefined): string {
  return String(value || '').trim()
}

function isPlaceholderUrl(url: string): boolean {
  return !url || url.includes('YOUR_PROJECT') || url.includes('placeholder.supabase')
}

/** Decode JWT `role` when the key is a legacy Supabase JWT; null for opaque publishable keys. */
export function supabaseJwtRole(token: string): string | null {
  try {
    const part = clean(token).split('.')[1]
    if (!part) return null
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/')
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
    const payload = JSON.parse(atob(padded)) as { role?: unknown }
    return typeof payload.role === 'string' ? payload.role : null
  } catch {
    return null
  }
}

/** service_role must never be used in the browser — it bypasses RLS. */
export function isUnsafeBrowserSupabaseKey(key: string): boolean {
  return supabaseJwtRole(key) === 'service_role'
}

function acceptClientKey(key: string): boolean {
  if (!key) return false
  if (isUnsafeBrowserSupabaseKey(key)) {
    console.error(
      '[RRCentral] Refusing service_role key in the browser. Use the anon/publishable key and rotate service_role.',
    )
    return false
  }
  return true
}

/** Env vars win; otherwise browser-saved Settings credentials. */
export function getSupabaseRuntimeConfig(): SupabaseRuntimeConfig {
  const envUrl = clean(import.meta.env.VITE_SUPABASE_URL as string)
  const envKey = clean(import.meta.env.VITE_SUPABASE_ANON_KEY as string)
  if (envUrl && envKey && !isPlaceholderUrl(envUrl) && acceptClientKey(envKey)) {
    return { url: envUrl, anonKey: envKey, source: 'env' }
  }

  if (typeof localStorage !== 'undefined') {
    const url = clean(localStorage.getItem(LS_URL))
    const anonKey = clean(localStorage.getItem(LS_KEY))
    if (url && anonKey && !isPlaceholderUrl(url) && acceptClientKey(anonKey)) {
      return { url, anonKey, source: 'runtime' }
    }
  }

  return { url: '', anonKey: '', source: 'none' }
}

export function saveSupabaseRuntimeConfig(url: string, anonKey: string): void {
  const key = clean(anonKey)
  if (isUnsafeBrowserSupabaseKey(key)) {
    throw new Error('Do not paste the service_role key. Use the anon (public) key from Supabase → API.')
  }
  localStorage.setItem(LS_URL, clean(url))
  localStorage.setItem(LS_KEY, key)
}

export function clearSupabaseRuntimeConfig(): void {
  localStorage.removeItem(LS_URL)
  localStorage.removeItem(LS_KEY)
}

export function isSupabaseConfigured(): boolean {
  return getSupabaseRuntimeConfig().source !== 'none'
}

let client: SupabaseClient | null = null
let clientKey = ''

export function getSupabaseClient(): SupabaseClient {
  const cfg = getSupabaseRuntimeConfig()
  const url = cfg.url || 'https://placeholder.supabase.co'
  const key = cfg.anonKey || 'placeholder-key'
  const stamp = `${cfg.source}|${url}|${key.slice(0, 12)}`
  if (!client || clientKey !== stamp) {
    client = createClient(url, key)
    clientKey = stamp
  }
  return client
}
