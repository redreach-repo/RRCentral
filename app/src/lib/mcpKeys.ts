/**
 * AI connector (MCP) keys for the highmast-mcp Edge Function. Admin only (RLS).
 * The key is made in the browser, only its SHA-256 hash is saved, and the key
 * itself is shown once. A standard key acts as one active sales, staff or viewer
 * member; an admin key acts as a dedicated AI Assistant admin member (never the
 * admin creating it) and also gets the admin tools.
 */
import { db } from './db'
import { isMissingRelationError, isUndefinedColumnError } from './errors'
import { MCP_KEY_PREFIX, MCP_KEY_ROLES, type McpKeyRole, type McpKeyScope } from './highmastMcp'
import { getSupabaseRuntimeConfig } from './supabaseConfig'

export type McpKeyRow = {
  id: string
  name: string
  key_prefix: string
  role: McpKeyRole | 'admin'
  /** 'admin' keys get the admin tools; missing before the admin SQL was run. */
  scope?: McpKeyScope
  acts_as_user_id: string
  created_by: string
  created_at: string
  last_used_at: string | null
  revoked_at: string | null
}

export type McpMember = { id: string; name: string; email: string; role: McpKeyRole | 'admin' }

function base64Url(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** hmk_ + 32 random bytes (43 base64url characters). */
export function generateMcpKey(random?: (a: Uint8Array<ArrayBuffer>) => Uint8Array): string {
  const bytes = new Uint8Array(32)
  return MCP_KEY_PREFIX + base64Url(random ? random(bytes) : crypto.getRandomValues(bytes))
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** The server URL to paste into Grok Bot (or any MCP client). */
export function mcpServerUrl(supabaseUrl = getSupabaseRuntimeConfig().url): string {
  const base = String(supabaseUrl || '').replace(/\/$/, '')
  return base ? `${base}/functions/v1/highmast-mcp` : 'https://<project-ref>.supabase.co/functions/v1/highmast-mcp'
}

/** Null when the SQL has not been run yet. */
const KEY_COLUMNS = 'id, name, key_prefix, role, acts_as_user_id, created_by, created_at, last_used_at, revoked_at'

/** Null when the SQL has not been run yet. Works before and after the admin SQL (scope column). */
export async function listMcpKeys(): Promise<McpKeyRow[] | null> {
  let res = await db.from('mcp_keys').select(`${KEY_COLUMNS}, scope`).order('created_at', { ascending: false })
  if (res.error && isUndefinedColumnError(res.error)) {
    res = await db.from('mcp_keys').select(KEY_COLUMNS).order('created_at', { ascending: false })
  }
  if (res.error) {
    if (isMissingRelationError(res.error)) return null
    throw res.error
  }
  return ((res.data || []) as McpKeyRow[]).map((r) => ({ ...r, scope: r.scope || 'standard' }))
}

/** True when the admin key SQL (scope column) is on the database. */
export async function mcpAdminKeysReady(): Promise<boolean> {
  const { error } = await db.from('mcp_keys').select('scope').limit(1)
  return !error
}

/**
 * Active members a key may act as: sales, staff or viewer for a standard key;
 * admin members other than yourself for an admin key (the AI Assistant).
 */
export async function listMcpMembers(scope: McpKeyScope = 'standard', selfEmail = ''): Promise<McpMember[]> {
  const roles = scope === 'admin' ? ['admin'] : [...MCP_KEY_ROLES]
  const { data, error } = await db
    .from('app_users')
    .select('id, name, email, role, active')
    .eq('active', true)
    .in('role', roles)
    .order('name')
  if (error) throw error
  return ((data || []) as (McpMember & { active: boolean })[])
    .filter((m) => scope !== 'admin' || m.email.toLowerCase() !== selfEmail.toLowerCase())
    .map(({ id, name, email, role }) => ({ id, name, email, role }))
}

/** Creates a key and returns it. This is the only time the key can be seen. */
export async function createMcpKey(
  name: string,
  member: McpMember,
  createdBy: string,
  scope: McpKeyScope = 'standard',
): Promise<{ key: string; row: McpKeyRow }> {
  if (scope === 'admin' && member.role !== 'admin') throw new Error('An admin key must act as an admin member (the AI Assistant).')
  if (scope === 'standard' && member.role === 'admin') throw new Error('A standard key cannot act as an admin member.')
  if (scope === 'admin' && member.email.toLowerCase() === createdBy.toLowerCase()) {
    throw new Error('An admin key acts as its own AI Assistant member, not as you.')
  }
  const key = generateMcpKey()
  const row: Record<string, unknown> = {
    name: name.trim().slice(0, 80) || 'AI connector',
    key_prefix: key.slice(0, 10),
    key_hash: await sha256Hex(key),
    role: member.role,
    acts_as_user_id: member.id,
    created_by: createdBy,
  }
  // Only send scope for admin keys, so standard keys still work before the admin SQL is run.
  if (scope === 'admin') row.scope = 'admin'
  const { data, error } = await db.from('mcp_keys').insert(row).select(KEY_COLUMNS).single()
  if (error) throw error
  return { key, row: { ...(data as McpKeyRow), scope } }
}

export async function revokeMcpKey(id: string): Promise<void> {
  const { error } = await db.from('mcp_keys').update({ revoked_at: new Date().toISOString() }).eq('id', id).is('revoked_at', null)
  if (error) throw error
}
