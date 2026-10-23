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
  type PortalView,
} from './clientPortal'
import { listContracts, listPackages, listRequirements, listStages, listTimeEntries, listUsage } from './deliveryStore'
import { isMissingRelationError } from './errors'
import { listTickets } from './supportStore'
import { getSupabaseClient, isSupabaseConfigured } from './supabaseConfig'
import type { PortalAccess } from './types'

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

async function loadLocalPortal(token: string, month: string | null): Promise<PortalResult> {
  const { data } = await db.from('portal_access').select('*').eq('token_hash', await hashPortalToken(token)).maybeSingle()
  const access = data as PortalAccess | null
  if (!access || portalAccessState(access) !== 'active') return { ok: false, message: NOT_VALID }
  const account = await getAccount(access.account_id)
  if (!account || account.type !== 'ai_crm_client') return { ok: false, message: NOT_VALID }
  const id = account.id
  const [contracts, packages, stages, requirements, tickets, usage, entries, settings] = await Promise.all([
    listContracts(id),
    listPackages(),
    listStages(id),
    listRequirements(id),
    listTickets(id),
    listUsage(id),
    listTimeEntries(id),
    db.from('app_settings').select('key, value'),
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
    }),
  }
}
