/**
 * Google Drive for RR Central (replaces Zoho WorkDrive). The google-drive Edge
 * Function holds the connection; the browser never sees a Google token.
 * An admin connects once in Settings; then client folders and uploads work for
 * admins, managers and sales.
 */

import { getSupabaseClient, isSupabaseConfigured } from './supabaseConfig'

export const DRIVE_STORAGE_PROVIDER = 'google_drive'

export type DriveStatus = {
  configured: boolean
  connected: boolean
  account_email: string
  root_url: string
  customers_url: string
  company_url: string
  redirect_uri: string
}

export const DRIVE_OFF: DriveStatus = {
  configured: false,
  connected: false,
  account_email: '',
  root_url: '',
  customers_url: '',
  company_url: '',
  redirect_uri: '',
}

/** Google Drive / Docs links (files, folders, Docs, Sheets, Slides). */
export function isGoogleDriveUrl(url: string): boolean {
  try {
    const u = new URL(String(url || '').trim())
    return u.protocol === 'https:' && (u.hostname === 'drive.google.com' || u.hostname === 'docs.google.com')
  } catch {
    return false
  }
}

/** The folder id in a Google Drive folder link (or a bare id). Same rules as the Edge Function. */
export function driveFolderId(url: string): string | null {
  const u = String(url || '').trim()
  if (!u) return null
  if (!u.includes('://')) return /^[A-Za-z0-9_-]{15,}$/.test(u) ? u : null
  let parsed: URL
  try {
    parsed = new URL(u)
  } catch {
    return null
  }
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'drive.google.com') return null
  const m = parsed.pathname.match(/\/folders\/([A-Za-z0-9_-]{15,})/)
  if (m) return m[1]
  const id = parsed.searchParams.get('id') || ''
  return /^[A-Za-z0-9_-]{15,}$/.test(id) ? id : null
}

async function callDrive<T>(body: Record<string, unknown>): Promise<T> {
  if (!isSupabaseConfigured()) throw new Error('Google Drive needs RR Central connected to Supabase')
  const { data, error } = await getSupabaseClient().functions.invoke('google-drive', { body })
  if (error) {
    // The function answers { error } with a 4xx/5xx; show that text, not "non-2xx".
    const ctx = (error as { context?: Response }).context
    const detail = ctx && typeof ctx.json === 'function' ? await ctx.json().catch(() => null) : null
    throw new Error((detail as { error?: string } | null)?.error || error.message || 'Google Drive did not answer')
  }
  const res = data as T & { error?: string }
  if (res?.error) throw new Error(res.error)
  return res
}

export async function getDriveStatus(): Promise<DriveStatus> {
  if (!isSupabaseConfigured()) return DRIVE_OFF
  return callDrive<DriveStatus>({ action: 'status' })
}

/** Sends the admin to Google to say yes; Google sends them back to this page. */
export async function startDriveConnect(returnTo = window.location.href): Promise<void> {
  const { url } = await callDrive<{ url: string }>({ action: 'connect', return_to: returnTo })
  window.location.assign(url)
}

export async function disconnectDrive(): Promise<void> {
  await callDrive<{ ok: true }>({ action: 'disconnect' })
}

/** The client's folder (made under RR Central / Customers on first use; saved on the CRM row). */
export async function ensureClientDriveFolder(crmId: string): Promise<{ id: string; url: string }> {
  return callDrive<{ id: string; url: string }>({ action: 'client-folder', crm_id: crmId })
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}

/** Puts a file in the client's folder. Returns the file link and the folder link. */
export async function uploadToClientDrive(opts: {
  crmId: string
  filename: string
  content: string | Uint8Array
  contentType?: string
}): Promise<{ id: string; url: string; folder_url: string }> {
  const bytes = typeof opts.content === 'string' ? new TextEncoder().encode(opts.content) : opts.content
  return callDrive({
    action: 'upload',
    crm_id: opts.crmId,
    filename: opts.filename,
    content_base64: toBase64(bytes),
    content_type: opts.contentType || 'application/octet-stream',
  })
}
