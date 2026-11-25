import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { pdfRenderToken } from './pdfRenderSession'

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
  // New-style secret keys (sb_secret_...) bypass RLS just like service_role.
  return /^sb_secret_/.test(String(key || '').trim()) || supabaseJwtRole(key) === 'service_role'
}

/** Whether the browser may use this key. service_role is always refused. */
function acceptClientKey(key: string): boolean {
  if (!key) return false
  if (isUnsafeBrowserSupabaseKey(key)) {
    console.error(
      '[RRCentral] Refusing a service_role or secret key in the browser (it bypasses RLS). Set VITE_SUPABASE_ANON_KEY to the publishable (or anon) key.',
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
    throw new Error('Do not paste the service_role or secret key. Use the publishable (or anon) key from Supabase → API Keys.')
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
    // PDF render page only (AI connector): act as the render login, never store a session.
    const render = pdfRenderToken()
    client = render
      ? createClient(url, key, {
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'hm-pdf-render' },
          global: { headers: { Authorization: `Bearer ${render}` } },
        })
      : createClient(url, key)
    clientKey = stamp
  }
  return client
}

/**
 * Headers for a direct call to Supabase (REST or an Edge Function). The new
 * publishable key is not a JWT and goes on `apikey` only; a signed-in user's
 * token (or a legacy anon JWT) goes on Authorization.
 */
export function supabaseRequestHeaders(publicKey: string, accessToken?: string): Record<string, string> {
  const bearer = accessToken || (supabaseJwtRole(publicKey) ? publicKey : '')
  return bearer ? { apikey: publicKey, Authorization: `Bearer ${bearer}` } : { apikey: publicKey }
}
