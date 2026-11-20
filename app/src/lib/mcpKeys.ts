/**
 * AI connector (MCP) keys for the highmast-mcp Edge Function. Admin only (RLS).
 * The key is made in the browser, only its SHA-256 hash is saved, and the key
 * itself is shown once. Each key acts as one active sales, staff or viewer member.
 */
import { db } from './db'
import { isMissingRelationError } from './errors'
import { MCP_KEY_PREFIX, MCP_KEY_ROLES, type McpKeyRole } from './highmastMcp'
import { getSupabaseRuntimeConfig } from './supabaseConfig'

export type McpKeyRow = {
  id: string
  name: string
  key_prefix: string
  role: McpKeyRole
  acts_as_user_id: string
  created_by: string
  created_at: string
  last_used_at: string | null
  revoked_at: string | null
}

export type McpMember = { id: string; name: string; email: string; role: McpKeyRole }

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
export async function listMcpKeys(): Promise<McpKeyRow[] | null> {
  const { data, error } = await db
    .from('mcp_keys')
    .select('id, name, key_prefix, role, acts_as_user_id, created_by, created_at, last_used_at, revoked_at')
    .order('created_at', { ascending: false })
  if (error) {
    if (isMissingRelationError(error)) return null
    throw error
  }
  return (data || []) as McpKeyRow[]
}

/** Active members a key may act as (sales, staff or viewer). */
export async function listMcpMembers(): Promise<McpMember[]> {
  const { data, error } = await db
    .from('app_users')
    .select('id, name, email, role, active')
    .eq('active', true)
    .in('role', [...MCP_KEY_ROLES])
    .order('name')
  if (error) throw error
  return ((data || []) as (McpMember & { active: boolean })[]).map(({ id, name, email, role }) => ({ id, name, email, role }))
}

/** Creates a key and returns it. This is the only time the key can be seen. */
export async function createMcpKey(name: string, member: McpMember, createdBy: string): Promise<{ key: string; row: McpKeyRow }> {
  const key = generateMcpKey()
  const { data, error } = await db
    .from('mcp_keys')
    .insert({
      name: name.trim().slice(0, 80) || 'AI connector',
      key_prefix: key.slice(0, 10),
      key_hash: await sha256Hex(key),
      role: member.role,
      acts_as_user_id: member.id,
      created_by: createdBy,
    })
    .select('id, name, key_prefix, role, acts_as_user_id, created_by, created_at, last_used_at, revoked_at')
    .single()
  if (error) throw error
  return { key, row: data as McpKeyRow }
}

export async function revokeMcpKey(id: string): Promise<void> {
  const { error } = await db.from('mcp_keys').update({ revoked_at: new Date().toISOString() }).eq('id', id).is('revoked_at', null)
  if (error) throw error
}
