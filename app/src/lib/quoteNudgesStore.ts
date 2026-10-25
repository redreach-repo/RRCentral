import { listAccounts, listContacts } from './accountsStore'
import { findCrmByCompany } from './crmSync'
import { db } from './db'
import { isMissingRelationError, isUndefinedColumnError } from './errors'
import { quoteNudges, type MessageTemplate, type NudgeDeal, type NudgeQuote, type QuoteNudge } from './quoteNudges'

export async function listTemplates(): Promise<{ rows: MessageTemplate[]; missingTable: boolean }> {
  const { data, error } = await db.from('message_templates').select('*').order('name')
  if (error) {
    if (isMissingRelationError(error)) return { rows: [], missingTable: true }
    throw error
  }
  return { rows: (data || []) as MessageTemplate[], missingTable: false }
}

export type TemplateInput = Omit<MessageTemplate, 'id'>

export async function saveTemplate(input: TemplateInput, by: string, id?: string): Promise<void> {
  const now = new Date().toISOString()
  const row = { ...input, name: input.name.trim(), subject: input.subject.trim(), updated_at: now }
  const { error } = id
    ? await db.from('message_templates').update(row).eq('id', id)
    : await db.from('message_templates').insert({ ...row, id: crypto.randomUUID(), created_by: by, created_at: now })
  if (error) throw error
}

export async function deleteTemplate(id: string): Promise<void> {
  const { error } = await db.from('message_templates').delete().eq('id', id)
  if (error) throw error
}

/** Quotes and AI CRM deals waiting for a reply. Empty until the "Follow up templates" SQL has run. */
export async function loadQuoteNudges(now: Date = new Date()): Promise<QuoteNudge[]> {
  const [quotes, deals, accounts] = await Promise.all([
    db
      .from('quotations')
      .select('id, client, reference_number, division_code, amount, status, account_id, quotation_currency, sent_at, followed_up_at')
      .eq('status', 'Sent'),
    db.from('sales_deals').select('id, account_id, stage, quote_reference, monthly_fee, last_touch_at, quote_sent_at').eq('stage', 'quote_sent'),
    listAccounts().catch(() => ({ rows: [] as { id: string; name: string }[] })),
  ])
  if (quotes.error && !(isUndefinedColumnError(quotes.error) || isMissingRelationError(quotes.error))) throw quotes.error
  return quoteNudges({
    quotes: quotes.error ? [] : ((quotes.data || []) as NudgeQuote[]),
    deals: deals.error ? [] : ((deals.data || []) as NudgeDeal[]),
    accountNames: new Map(accounts.rows.map((a) => [a.id, a.name])),
    now,
  })
}

export type NudgeContact = { name: string; phone: string; email: string }

/** Who to write to: the account's primary contact, else the CRM row for the client. */
export async function contactForNudge(n: QuoteNudge): Promise<NudgeContact> {
  if (n.account_id) {
    const contacts = await listContacts(n.account_id).catch(() => [])
    const c = contacts.find((x) => x.is_primary) ?? contacts[0]
    if (c) return { name: c.name, phone: c.whatsapp || c.phone, email: c.email }
  }
  const crm = n.account ? await findCrmByCompany(n.account).catch(() => null) : null
  if (crm) {
    const first = crm.contacts?.[0]
    return {
      name: crm.primary_contact || first?.name || '',
      phone: crm.mobile_number || first?.phone || '',
      email: (crm.email_phone.includes('@') ? crm.email_phone : '') || first?.email || '',
    }
  }
  return { name: '', phone: '', email: '' }
}

/** The follow up was sent: the next nudge comes NUDGE_DAYS from now. */
export async function markFollowedUp(n: QuoteNudge): Promise<void> {
  const now = new Date().toISOString()
  const { error } =
    n.kind === 'quote'
      ? await db.from('quotations').update({ followed_up_at: now }).eq('id', n.id)
      : await db.from('sales_deals').update({ last_touch_at: now, updated_at: now }).eq('id', n.id)
  if (error) throw error
}
