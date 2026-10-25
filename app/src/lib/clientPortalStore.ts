import { db } from './db'
import { getAccount } from './accountsStore'
import {
  buildPortalView,
  hashPortalToken,
  isPortalToken,
  newPortalToken,
  portalAccessState,
  portalExpiry,
  portalLink,
  ratesFromSettings,
  type PortalInput,
  type PortalInvoiceRow,
  type PortalView,
} from './clientPortal'
import { listContracts, listPackages, listRequirements, listStages, listTimeEntries, listUsage } from './deliveryStore'
import { isMissingRelationError } from './errors'
import { listTickets } from './supportStore'
import { getSupabaseClient, isSupabaseConfigured } from './supabaseConfig'
import type { PortalAccess, PortalUpload } from './types'

const NOT_VALID = 'This link does not work any more. Ask Red Reach for a new one.'

export async function listPortalLinks(accountId: string): Promise<{ rows: PortalAccess[]; missingTable: boolean }> {
  const { data, error } = await db.from('portal_access').select('*').eq('account_id', accountId).order('created_at', { ascending: false })
  if (error) {
    if (isMissingRelationError(error)) return { rows: [], missingTable: true }
    throw error
  }
  return { rows: (data || []) as PortalAccess[], missingTable: false }
}

/** The app's own address, e.g. https://redreach-repo.github.io/RRCentral. */
export function appBaseUrl(): string {
  return `${window.location.origin}${import.meta.env.BASE_URL || '/'}`.replace(/\/$/, '')
}

/** Makes a new private link. The token is only ever in the returned link; the database keeps its hash. */
export async function createPortalLink(
  accountId: string,
  input: { contactId: string | null; label: string },
  by: string,
): Promise<string> {
  const token = newPortalToken()
  const { error } = await db.from('portal_access').insert({
    id: crypto.randomUUID(),
    account_id: accountId,
    contact_id: input.contactId,
    label: input.label.trim(),
    token_hash: await hashPortalToken(token),
    created_by: by,
    created_at: new Date().toISOString(),
    expires_at: portalExpiry(),
    revoked_at: null,
    last_used_at: null,
  })
  if (error) throw error
  return portalLink(appBaseUrl(), token)
}

export async function revokePortalLink(id: string): Promise<void> {
  const { error } = await db.from('portal_access').update({ revoked_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}

const UPLOAD_COLUMNS = 'id, account_id, portal_access_id, filename, content_type, size_bytes, note, status, workdrive_id, workdrive_url, error, created_at'

/** Files the client sent from the portal, newest first (without their content). */
export async function listPortalUploads(accountId: string): Promise<{ rows: PortalUpload[]; missingTable: boolean }> {
  const { data, error } = await db.from('portal_uploads').select(UPLOAD_COLUMNS).eq('account_id', accountId).order('created_at', { ascending: false })
  if (error) {
    if (isMissingRelationError(error)) return { rows: [], missingTable: true }
    throw error
  }
  return { rows: (data || []) as PortalUpload[], missingTable: false }
}

/** Downloads a file that is still waiting in RR Central. */
export async function downloadPortalUpload(upload: PortalUpload): Promise<void> {
  const { data, error } = await db.from('portal_uploads').select('content_base64').eq('id', upload.id).maybeSingle()
  if (error) throw error
  const b64 = String((data as { content_base64?: string } | null)?.content_base64 || '')
  if (!b64) throw new Error('The file is no longer stored here. Look in the client’s WorkDrive folder.')
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  const url = URL.createObjectURL(new Blob([bytes], { type: upload.content_type || 'application/octet-stream' }))
  const a = document.createElement('a')
  a.href = url
  a.download = upload.filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

/** The team filed a waiting file by hand: note where, and clear the stored copy. */
export async function markPortalUploadFiled(id: string, workdriveUrl: string): Promise<void> {
  const { error } = await db
    .from('portal_uploads')
    .update({ status: 'in_workdrive', workdrive_url: workdriveUrl.trim(), content_base64: '', error: '' })
    .eq('id', id)
  if (error) throw error
}

export type PortalResult = { ok: true; view: PortalView } | { ok: false; message: string }

/** What the client sees. In the cloud the client-portal function answers; in local mode it is built here. */
export async function loadPortal(token: string, month: string | null): Promise<PortalResult> {
  if (!isPortalToken(token)) return { ok: false, message: NOT_VALID }
  if (isSupabaseConfigured()) {
    const { data, error } = await getSupabaseClient().functions.invoke('client-portal', { body: { token, month } })
    if (error) {
      let message = 'The portal could not load. Please try again later.'
      try {
        const body = await (error as { context?: Response }).context?.json()
        if (body?.error) message = String(body.error)
      } catch {
        // keep the plain message
      }
      return { ok: false, message }
    }
    return { ok: true, view: data as PortalView }
  }
  return loadLocalPortal(token, month)
}

export type PortalAction =
  | { action: 'quote_pdf'; quote_id: string }
  | { action: 'accept_quote'; quote_id: string; name: string; date: string; agreed: boolean }
  | { action: 'ticket_message'; ticket_id: string; message: string }
  | { action: 'upload'; filename: string; content_base64: string; note: string }

export type PortalActionResult = { ok: true; data: Record<string, unknown> } | { ok: false; message: string }

/** Something the client does in the portal. Only the client-portal function does these; never local mode. */
export async function portalAction(token: string, body: PortalAction): Promise<PortalActionResult> {
  if (!isPortalToken(token)) return { ok: false, message: NOT_VALID }
  if (!isSupabaseConfigured()) return { ok: false, message: 'This works once the portal is online.' }
  const { data, error } = await getSupabaseClient().functions.invoke('client-portal', { body: { token, ...body } })
  if (error) {
    let message = 'That did not work. Please try again later.'
    try {
      const b = await (error as { context?: Response }).context?.json()
      if (b?.error) message = String(b.error)
    } catch {
      // keep the plain message
    }
    return { ok: false, message }
  }
  return { ok: true, data: (data || {}) as Record<string, unknown> }
}

/** Reads a file as base64 (no data: prefix) for an upload. */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || '').replace(/^data:[^,]*,/, ''))
    reader.onerror = () => reject(reader.error || new Error('Could not read the file'))
    reader.readAsDataURL(file)
  })
}

async function loadLocalPortal(token: string, month: string | null): Promise<PortalResult> {
  const { data } = await db.from('portal_access').select('*').eq('token_hash', await hashPortalToken(token)).maybeSingle()
  const access = data as PortalAccess | null
  if (!access || portalAccessState(access) !== 'active') return { ok: false, message: NOT_VALID }
  const account = await getAccount(access.account_id)
  if (!account || account.type !== 'ai_crm_client') return { ok: false, message: NOT_VALID }
  const id = account.id
  const [contracts, packages, stages, requirements, tickets, usage, entries, settings, invoices, payments, buildTasks] = await Promise.all([
    listContracts(id),
    listPackages(),
    listStages(id),
    listRequirements(id),
    listTickets(id),
    listUsage(id),
    listTimeEntries(id),
    db.from('app_settings').select('key, value'),
    db.from('invoices').select('*').eq('account_id', id),
    db.from('payment_log').select('invoice_ref, amount'),
    db.from('build_tasks').select('*').eq('account_id', id),
  ])
  const map: Record<string, string> = {}
  for (const s of ((settings as { data: unknown }).data || []) as { key: string; value: string }[]) map[s.key] = s.value
  return {
    ok: true,
    view: buildPortalView({
      now: new Date(),
      month,
      companyName: map.companyName || 'Red Reach Middle East FZE',
      account,
      contracts,
      packages,
      stages,
      requirements,
      tickets,
      usage,
      entries,
      rates: ratesFromSettings(map),
      invoices: ((invoices as { data: unknown }).data || []) as PortalInvoiceRow[],
      payments: ((payments as { data: unknown }).data || []) as { invoice_ref: string; amount: number }[],
      goLive: (((buildTasks as { data: unknown }).data || []) as NonNullable<PortalInput['goLive']>).filter((t) => t.kind === 'golive'),
    }),
  }
}
