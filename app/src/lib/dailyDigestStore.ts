import { format, startOfMonth, subMonths } from 'date-fns'
import { listAccounts } from './accountsStore'
import { listContractInvoices } from './contractBillingStore'
import { listDeals } from './ctrmStore'
import { listRecentLeads } from './leadIntakeStore'
import { buildDigest, type Digest } from './dailyDigest'
import type { NudgeDeal, NudgeQuote } from './quoteNudges'
import { db } from './db'
import { listContracts, listPackages, listTimeEntries } from './deliveryStore'
import { isMissingRelationError, isUndefinedColumnError } from './errors'
import { listTickets } from './supportStore'
import { getSupabaseClient, isSupabaseConfigured } from './supabaseConfig'
import { phoneDigits } from './usageImport'
import type { DigestRecipientRow, DigestRun } from './types'

/** Today's digest, built in the browser from what this user can see. */
export async function loadDigestPreview(now: Date = new Date()): Promise<Digest> {
  const since = format(startOfMonth(subMonths(now, 2)), 'yyyy-MM-dd')
  const [{ rows: accounts }, contracts, packages, entries, tickets, deals, contractInvoices] = await Promise.all([
    listAccounts(),
    listContracts(),
    listPackages(),
    listTimeEntries(undefined, since),
    listTickets(),
    listDeals(),
    listContractInvoices().catch(() => []),
  ])
  const { data: watch } = await db
    .from('watch_items')
    .select('kind, severity, title, reason, link, owner_label')
    .is('cleared_at', null)
  const dayAgo = now.getTime() - 24 * 60 * 60 * 1000
  const contractDrafts = contractInvoices.filter((r) => r.invoice_id && Date.parse(r.created_at) >= dayAgo).length
  const [sentQuotes, quoteDeals] = await Promise.all([
    db
      .from('quotations')
      .select('id, client, reference_number, division_code, amount, status, account_id, quotation_currency, sent_at, followed_up_at')
      .eq('status', 'Sent'),
    db.from('sales_deals').select('id, account_id, stage, quote_reference, monthly_fee, last_touch_at, quote_sent_at').eq('stage', 'quote_sent'),
  ])
  const leads = await listRecentLeads(new Date(dayAgo))
  return buildDigest({
    now,
    accounts,
    contracts,
    packages,
    entries,
    tickets,
    deals,
    contractDrafts,
    watch: watch || [],
    sentQuotes: sentQuotes.error ? [] : ((sentQuotes.data || []) as NudgeQuote[]),
    quoteDeals: quoteDeals.error ? [] : ((quoteDeals.data || []) as NudgeDeal[]),
    leads,
  })
}

export async function listRecipients(): Promise<{ rows: DigestRecipientRow[]; missingTable: boolean }> {
  const { data, error } = await db.from('digest_recipients').select('*').order('created_at', { ascending: true })
  if (error) {
    if (isMissingRelationError(error)) return { rows: [], missingTable: true }
    throw error
  }
  return { rows: (data || []) as DigestRecipientRow[], missingTable: false }
}

export type RecipientInput = Pick<DigestRecipientRow, 'name' | 'email' | 'whatsapp_phone' | 'by_email' | 'by_whatsapp' | 'active'>

/** Add or update someone on the digest list. Returns a problem to show, or null when saved. */
export async function saveRecipient(input: RecipientInput, by: string, id?: string): Promise<string | null> {
  const email = input.email.trim().toLowerCase()
  const phone = phoneDigits(input.whatsapp_phone)
  if (input.by_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Enter an email address, or untick Email'
  if (input.by_whatsapp && phone.length < 7) return 'Enter a WhatsApp number with the country code, or untick WhatsApp'
  if (!input.by_email && !input.by_whatsapp) return 'Tick Email, WhatsApp or both'
  const now = new Date().toISOString()
  const row = { ...input, name: input.name.trim(), email, whatsapp_phone: phone, updated_at: now }
  const { error } = id
    ? await db.from('digest_recipients').update(row).eq('id', id)
    : await db.from('digest_recipients').insert({ ...row, id: crypto.randomUUID(), created_by: by, created_at: now })
  if (error) throw error
  return null
}

export async function deleteRecipient(id: string): Promise<void> {
  const { error } = await db.from('digest_recipients').delete().eq('id', id)
  if (error) throw error
}

export async function listDigestRuns(limit = 5): Promise<DigestRun[]> {
  const { data, error } = await db.from('digest_runs').select('*').order('started_at', { ascending: false })
  if (error) {
    if (isMissingRelationError(error) || isUndefinedColumnError(error)) return []
    throw error
  }
  return ((data || []) as DigestRun[]).slice(0, limit)
}

type ChannelStatus = 'ok' | 'not_configured' | 'error' | 'no_recipients'

export type SendResult =
  | {
      ok: true
      items: number
      email: ChannelStatus
      whatsapp: ChannelStatus
      emailsSent: number
      whatsappSent: number
      message: string
    }
  | { ok: false; message: string }

/** Send today's digest to everyone on the list now, as the signed in manager or admin. */
export async function sendDigestNow(): Promise<SendResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, message: 'Local mode cannot send email or WhatsApp. The preview below is what would be sent.' }
  }
  const { data, error } = await getSupabaseClient().functions.invoke('daily-digest', { body: {} })
  if (error) {
    const status = (error as { context?: { status?: number } }).context?.status
    if (status === 404 || /Failed to send a request/i.test(String((error as Error).message))) {
      return { ok: false, message: 'The daily-digest function is not deployed yet. See docs/daily-digest.md.' }
    }
    let message = 'The digest was not sent.'
    try {
      const body = await (error as { context?: Response }).context?.json()
      if (body?.error) message = String(body.error)
    } catch {
      // keep the plain message
    }
    return { ok: false, message }
  }
  return { ok: true, ...(data as Omit<Extract<SendResult, { ok: true }>, 'ok'>) }
}

export const CHANNEL_STATUS_LABEL: Record<string, string> = {
  ok: 'sent',
  not_configured: 'not set up yet',
  error: 'failed',
  no_recipients: 'nobody on the list',
  '': 'not sent',
}
