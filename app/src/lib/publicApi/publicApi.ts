/** Public API + webhooks helpers for the admin page (docs/modules/public-api.md). */

export const API_SCOPES = [
  { scope: 'accounts:read', label: 'Read accounts' },
  { scope: 'invoices:read', label: 'Read invoices' },
  { scope: 'quotations:read', label: 'Read quotations' },
] as const

export type ApiScope = (typeof API_SCOPES)[number]['scope']

export type ApiKeyRow = {
  id: string
  name: string
  key_prefix: string
  scopes: string[]
  created_by: string
  created_at: string
  expires_at: string | null
  last_used_at: string | null
  revoked_at: string | null
}

export type WebhookEndpointRow = {
  id: string
  url: string
  description: string
  events: string[]
  active: boolean
  created_at: string
}

export type WebhookDeliveryRow = {
  id: string
  endpoint_id: string
  event_type: string
  status: 'pending' | 'sending' | 'succeeded' | 'failed' | 'dead'
  attempts: number
  last_status_code: number | null
  last_error: string
  created_at: string
  delivered_at: string | null
}

export function keyState(k: ApiKeyRow, now = new Date()): 'active' | 'revoked' | 'expired' {
  if (k.revoked_at) return 'revoked'
  if (k.expires_at && Date.parse(k.expires_at) <= now.getTime()) return 'expired'
  return 'active'
}

/** Mirrors the SQL check (https only) plus the dispatcher's internal-address guard. */
export function webhookUrlProblem(raw: string): string | null {
  let u: URL
  try {
    u = new URL(raw.trim())
  } catch {
    return 'Enter a full https:// address'
  }
  if (u.protocol !== 'https:') return 'Webhooks must use https://'
  const host = u.hostname.toLowerCase()
  if (host === 'localhost' || /^(10|127)\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host)) {
    return 'Internal addresses are not allowed'
  }
  return null
}

/** "mark_paid, create_crm" → ['mark_paid','create_crm']; blank → ['*'] (every event). */
export function parseEventList(raw: string): string[] {
  const list = raw
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  return list.length ? Array.from(new Set(list)) : ['*']
}

/** Base URL for callers, from the Supabase project URL. */
export function publicApiBase(supabaseUrl: string): string {
  return `${supabaseUrl.replace(/\/$/, '')}/functions/v1/hm-public-api/v1`
}
