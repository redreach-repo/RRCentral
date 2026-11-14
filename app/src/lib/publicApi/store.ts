import { db } from '../db'
import { isMissingRelationError } from '../errors'
import type { ApiKeyRow, WebhookDeliveryRow, WebhookEndpointRow } from './publicApi'

const KEY_COLS = 'id,name,key_prefix,scopes,created_by,created_at,expires_at,last_used_at,revoked_at'
// Never select '*' on webhook_endpoints: the secret column is not granted to app users.
const ENDPOINT_COLS = 'id,url,description,events,active,created_at'

export type DeveloperData = {
  keys: ApiKeyRow[]
  endpoints: WebhookEndpointRow[]
  deliveries: WebhookDeliveryRow[]
  missingTable: boolean
}

export async function loadDeveloperData(): Promise<DeveloperData> {
  const [k, e, d] = await Promise.all([
    db.from('api_keys').select(KEY_COLS).order('created_at', { ascending: false }),
    db.from('webhook_endpoints').select(ENDPOINT_COLS).order('created_at', { ascending: false }),
    db.from('webhook_deliveries')
      .select('id,endpoint_id,event_type,status,attempts,last_status_code,last_error,created_at,delivered_at')
      .order('created_at', { ascending: false })
      .limit(50),
  ])
  for (const r of [k, e, d]) {
    if (r.error) {
      if (isMissingRelationError(r.error)) return { keys: [], endpoints: [], deliveries: [], missingTable: true }
      throw r.error
    }
  }
  return { keys: k.data || [], endpoints: e.data || [], deliveries: d.data || [], missingTable: false }
}

/** Returns the plain key: show it once, it cannot be read again. */
export async function createApiKey(name: string, scopes: string[], expiresAt: string | null): Promise<string> {
  const { data, error } = await db.rpc('rr_api_key_create', { p_name: name, p_scopes: scopes, p_expires_at: expiresAt })
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  return String(row?.api_key || '')
}

export async function revokeApiKey(id: string): Promise<void> {
  const { error } = await db.rpc('rr_api_key_revoke', { p_id: id })
  if (error) throw error
}

/** Returns the signing secret: show it once. */
export async function createWebhook(url: string, events: string[], description: string): Promise<string> {
  const { data, error } = await db.rpc('rr_webhook_endpoint_create', { p_url: url, p_events: events, p_description: description })
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  return String(row?.signing_secret || '')
}

export async function setWebhookActive(id: string, active: boolean): Promise<void> {
  const { error } = await db.from('webhook_endpoints').update({ active, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}
