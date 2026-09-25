/**
 * Zoho WorkDrive helpers — create customer folders, upload files, share links.
 * Requires OAuth scopes: WorkDrive.files.CREATE, WorkDrive.files.READ, WorkDrive.links.CREATE
 * (regenerate refresh token after adding scopes).
 */

import { getSupabaseClient, isSupabaseConfigured } from './supabaseConfig'
import {
  getZohoAccessToken,
  isZohoConfigured,
  type ZohoSettings,
} from './zoho'

function setting(settings: ZohoSettings, key: string, fallback = ''): string {
  return String(settings[key] ?? fallback).trim()
}

export function isZohoWorkDriveEnabled(settings: ZohoSettings): boolean {
  return (
    isZohoConfigured(settings) &&
    setting(settings, 'zohoWorkDriveEnabled', 'no').toLowerCase() === 'yes'
  )
}

export function workDriveApiBase(settings: ZohoSettings): string {
  const explicit = setting(settings, 'zohoWorkDriveApiDomain')
  if (explicit) return explicit.replace(/\/$/, '')
  const accounts = setting(settings, 'zohoAccountsDomain', 'https://accounts.zoho.com')
  if (accounts.includes('zoho.eu')) return 'https://www.zohoapis.eu'
  if (accounts.includes('zoho.in')) return 'https://www.zohoapis.in'
  if (accounts.includes('zoho.com.au')) return 'https://www.zohoapis.com.au'
  return 'https://www.zohoapis.com'
}

/** Extract WorkDrive folder/file resource id from a share or folder URL. */
export function parseWorkDriveResourceId(url: string): string | null {
  const u = String(url || '').trim()
  if (!u) return null
  const patterns = [
    /\/folder\/([a-zA-Z0-9_-]+)/i,
    /\/folders\/([a-zA-Z0-9_-]+)/i,
    /\/file\/([a-zA-Z0-9_-]+)/i,
    /\/files\/([a-zA-Z0-9_-]+)/i,
    /[?&]id=([a-zA-Z0-9_-]+)/i,
  ]
  for (const re of patterns) {
    const m = u.match(re)
    if (m?.[1] && m[1].length >= 8) return m[1]
  }
  // Bare resource id pasted by admin
  if (/^[a-zA-Z0-9_-]{10,}$/.test(u) && !u.includes('://')) return u
  return null
}

export function customersRootFolderId(settings: ZohoSettings): string {
  const explicit = setting(settings, 'zohoWorkDriveRootFolderId')
  if (explicit) return explicit
  const fromUrl = parseWorkDriveResourceId(
    setting(settings, 'customerWorkDriveRootUrl') || setting(settings, 'customerDriveRootUrl'),
  )
  return fromUrl || ''
}

async function workDriveFetch(
  settings: ZohoSettings,
  path: string,
  init: RequestInit = {},
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const token = await getZohoAccessToken(settings)
  const url = path.startsWith('http') ? path : `${workDriveApiBase(settings)}${path}`
  const headers = new Headers(init.headers || {})
  headers.set('Authorization', `Zoho-oauthtoken ${token}`)
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/vnd.api+json')
  }
  headers.set('Accept', 'application/vnd.api+json')

  if (isSupabaseConfigured()) {
    const headerObj: Record<string, string> = {}
    headers.forEach((v, k) => {
      headerObj[k] = v
    })
    const supabase = getSupabaseClient()
    const { data, error } = await supabase.functions.invoke('zoho-proxy', {
      body: {
        action: 'api',
        url,
        method: init.method || 'GET',
        headers: headerObj,
        body: typeof init.body === 'string' ? init.body : init.body ? String(init.body) : null,
      },
    })
    if (error) throw error instanceof Error ? error : new Error(String(error))
    const wrapped = data as { ok?: boolean; status?: number; body?: unknown }
    return {
      ok: Boolean(wrapped?.ok ?? (Number(wrapped?.status) || 200) < 400),
      status: Number(wrapped?.status) || 200,
      body: wrapped?.body !== undefined ? wrapped.body : data,
    }
  }

  const res = await fetch(url, { ...init, headers })
  const text = await res.text()
  let body: unknown = text
  try {
    body = JSON.parse(text)
  } catch {
    /* keep */
  }
  return { ok: res.ok, status: res.status, body }
}

function pickAttr(obj: unknown, keys: string[]): string {
  if (!obj || typeof obj !== 'object') return ''
  const o = obj as Record<string, unknown>
  for (const k of keys) {
    const v = o[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  const attrs = o.attributes
  if (attrs && typeof attrs === 'object') {
    const a = attrs as Record<string, unknown>
    for (const k of keys) {
      const v = a[k]
      if (typeof v === 'string' && v.trim()) return v.trim()
    }
  }
  return ''
}

export type WorkDriveCreated = {
  resourceId: string
  name: string
  permalink: string
}

/** Create a subfolder under parent (Customers root or company folder). */
export async function createWorkDriveFolder(
  settings: ZohoSettings,
  opts: { parentId: string; name: string },
): Promise<WorkDriveCreated> {
  if (!isZohoWorkDriveEnabled(settings)) {
    throw new Error('Zoho WorkDrive is disabled in Settings — set WorkDrive to yes')
  }
  const parentId = opts.parentId.trim()
  const name = opts.name.trim()
  if (!parentId) throw new Error('WorkDrive parent folder ID is missing (set Customers root in Settings)')
  if (!name) throw new Error('Folder name is required')

  const res = await workDriveFetch(settings, '/workdrive/api/v1/files', {
    method: 'POST',
    body: JSON.stringify({
      data: {
        attributes: { parent_id: parentId, name },
        type: 'files',
      },
    }),
  })
  if (!res.ok) {
    const desc =
      pickAttr(res.body, ['title', 'detail', 'message']) ||
      (typeof res.body === 'object' && res.body && 'errors' in (res.body as object)
        ? JSON.stringify((res.body as { errors?: unknown }).errors)
        : '') ||
      `Create folder failed (${res.status})`
    throw new Error(desc)
  }

  const data = (res.body as { data?: unknown })?.data ?? res.body
  const resourceId =
    pickAttr(data, ['id', 'resource_id']) ||
    (Array.isArray(data) ? pickAttr(data[0], ['id', 'resource_id']) : '')
  const permalink =
    pickAttr(data, ['Permalink', 'permalink', 'webUrl', 'download_url', 'link']) ||
    (resourceId ? `https://workdrive.zoho.com/folder/${resourceId}` : '')
  if (!resourceId) throw new Error('WorkDrive created folder but returned no id')
  return { resourceId, name, permalink }
}

/** Create an external share link (downloadable) for a file/folder. */
export async function createWorkDriveShareLink(
  settings: ZohoSettings,
  opts: { resourceId: string; linkName: string },
): Promise<string> {
  const res = await workDriveFetch(settings, '/workdrive/api/v1/links', {
    method: 'POST',
    body: JSON.stringify({
      data: {
        attributes: {
          resource_id: opts.resourceId,
          link_name: opts.linkName.slice(0, 80) || 'share',
          request_user_data: false,
          allow_download: true,
          role_id: '5', // view+download for files (Zoho uses numeric role ids)
        },
        type: 'links',
      },
    }),
  })
  if (!res.ok) {
    // Fall back to permalink-style URL if share creation fails (scopes)
    return `https://workdrive.zoho.com/file/${opts.resourceId}`
  }
  const data = (res.body as { data?: unknown })?.data ?? res.body
  const link =
    pickAttr(data, ['link', 'Permalink', 'permalink', 'download_url', 'url']) ||
    `https://workdrive.zoho.com/file/${opts.resourceId}`
  return link
}

/** Upload a small file (HTML/EML) into a WorkDrive folder via zoho-proxy multipart. */
export async function uploadWorkDriveFile(
  settings: ZohoSettings,
  opts: {
    parentId: string
    filename: string
    content: string | Uint8Array
    contentType?: string
  },
): Promise<WorkDriveCreated> {
  if (!isZohoWorkDriveEnabled(settings)) {
    throw new Error('Zoho WorkDrive is disabled in Settings — set WorkDrive to yes')
  }
  const token = await getZohoAccessToken(settings)
  const parentId = opts.parentId.trim()
  if (!parentId) throw new Error('WorkDrive parent folder ID is missing')

  const bytes =
    typeof opts.content === 'string' ? new TextEncoder().encode(opts.content) : opts.content
  // base64 encode without Buffer (browser-safe)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  const contentBase64 = btoa(binary)

  const uploadUrl = `${workDriveApiBase(settings)}/workdrive/api/v1/upload`

  if (!isSupabaseConfigured()) {
    throw new Error(
      'WorkDrive upload needs Supabase cloud mode (zoho-proxy). Connect Supabase in Settings.',
    )
  }

  const supabase = getSupabaseClient()
  const { data, error } = await supabase.functions.invoke('zoho-proxy', {
    body: {
      action: 'upload',
      url: uploadUrl,
      authorization: `Zoho-oauthtoken ${token}`,
      parentId,
      filename: opts.filename,
      contentBase64,
      contentType: opts.contentType || 'text/html;charset=utf-8',
    },
  })
  if (error) throw error instanceof Error ? error : new Error(String(error))
  const wrapped = data as { ok?: boolean; status?: number; body?: unknown; error?: string }
  if (wrapped?.error) throw new Error(wrapped.error)
  if (!wrapped?.ok) {
    throw new Error(
      pickAttr(wrapped?.body, ['title', 'detail', 'message']) ||
        `WorkDrive upload failed (${wrapped?.status || '?'})`,
    )
  }

  // Upload responses are often { data: [ { attributes: { resource_id, Permalink, FileName } } ] }
  const body = wrapped.body as { data?: unknown }
  const row = Array.isArray(body?.data) ? body.data[0] : body?.data
  const resourceId = pickAttr(row, ['resource_id', 'id', 'resourceId'])
  const permalink =
    pickAttr(row, ['Permalink', 'permalink', 'DownloadUrl', 'download_url']) ||
    (resourceId ? `https://workdrive.zoho.com/file/${resourceId}` : '')
  if (!resourceId) throw new Error('WorkDrive upload succeeded but returned no file id')
  return {
    resourceId,
    name: pickAttr(row, ['FileName', 'name', 'filename']) || opts.filename,
    permalink,
  }
}
