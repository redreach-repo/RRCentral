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

/** Env vars win; otherwise browser-saved Settings credentials. */
export function getSupabaseRuntimeConfig(): SupabaseRuntimeConfig {
  const envUrl = clean(import.meta.env.VITE_SUPABASE_URL as string)
  const envKey = clean(import.meta.env.VITE_SUPABASE_ANON_KEY as string)
  if (envUrl && envKey && !isPlaceholderUrl(envUrl)) {
    return { url: envUrl, anonKey: envKey, source: 'env' }
  }

  if (typeof localStorage !== 'undefined') {
    const url = clean(localStorage.getItem(LS_URL))
    const anonKey = clean(localStorage.getItem(LS_KEY))
    if (url && anonKey && !isPlaceholderUrl(url)) {
      return { url, anonKey, source: 'runtime' }
    }
  }

  return { url: '', anonKey: '', source: 'none' }
}

export function saveSupabaseRuntimeConfig(url: string, anonKey: string): void {
  localStorage.setItem(LS_URL, clean(url))
  localStorage.setItem(LS_KEY, clean(anonKey))
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
