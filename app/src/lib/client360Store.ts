import { db, isSupabaseConfigured } from './db'
import { isMissingRelationError, isUndefinedColumnError } from './errors'
import { buildClient360, type Client360 } from './client360'

type Row = Record<string, unknown>

/**
 * Loads one client and everything linked to it, as the signed-in person
 * (row level security decides what comes back), and builds the client page.
 * Missing tables or columns (SQL not run yet) read as empty.
 */
async function rows(query: PromiseLike<{ data: unknown; error: unknown }>, missing?: { flag: boolean }): Promise<Row[]> {
  const { data, error } = await query
  if (error) {
    if (isMissingRelationError(error) || isUndefinedColumnError(error)) {
      if (missing) missing.flag = true
      return []
    }
    throw error
  }
  return (data || []) as Row[]
}

export type ClientListRow = { id: string; company_name: string; short_name?: string; trn: string; account_id: string | null; email: string }

export async function listClientRecords(): Promise<ClientListRow[]> {
  if (!isSupabaseConfigured()) return []
  const data = await rows(db.from('clients').select('*').order('company_name'))
  return data
    .filter((c) => !c.deleted_at && !c.merged_into)
    .map((c) => ({
      id: String(c.id),
      company_name: String(c.company_name || ''),
      short_name: String(c.short_name || ''),
      trn: String(c.trn || ''),
      account_id: (c.account_id as string) || null,
      email: String(c.email || ''),
    }))
}

export type ClientPageData = { view: Client360 | null; linksMissing: boolean }

export async function loadClient360(
  clientId: string,
  opts: { moneyVisible: boolean; marginVisible: boolean; today?: Date },
): Promise<ClientPageData> {
  if (!isSupabaseConfigured()) return { view: null, linksMissing: false }
  const { data: client, error } = await db.from('clients').select('*').eq('id', clientId).maybeSingle()
  if (error) throw error
  if (!client) return { view: null, linksMissing: false }
  const c = client as Row
  const accountId = (c.account_id as string) || null
  const linksMissing = { flag: false }
  const byClient = (table: string, select = '*') => rows(db.from(table).select(select).eq('client_id', clientId), linksMissing)
  const byAccount = (table: string, select = '*') =>
    accountId ? rows(db.from(table).select(select).eq('account_id', accountId)) : Promise.resolve([] as Row[])

  const money = opts.moneyVisible
  const [account, quotes, invoices, customerPayments, posByClient, posByAccount, deliveryNotes, crmDeals, salesDeals, ctrmDeals, inquiries, ticketsByClient, ticketsByAccount, accountContacts, activities] =
    await Promise.all([
      accountId ? rows(db.from('accounts').select('*').eq('id', accountId)) : Promise.resolve([] as Row[]),
      money ? byClient('quotations') : Promise.resolve([] as Row[]),
      money ? byClient('invoices') : Promise.resolve([] as Row[]),
      money ? byClient('customer_payments') : Promise.resolve([] as Row[]),
      rows(db.from('client_purchase_orders').select('*').eq('client_id', clientId)),
      byAccount('client_purchase_orders'),
      byClient('delivery_notes'),
      byClient('crm'),
      byAccount('sales_deals'),
      byAccount('ctrm_deals'),
      byClient('website_inquiries'),
      byClient('tickets'),
      byAccount('tickets'),
      byAccount('account_contacts'),
      byAccount('account_activities'),
    ])

  const unique = (list: Row[]) => [...new Map(list.map((r) => [String(r.id), r])).values()]
  const pos = unique([...posByClient, ...posByAccount])
  const tickets = unique([...ticketsByClient, ...ticketsByAccount])
  const invoiceRefs = invoices.map((i) => String(i.reference_number || '')).filter(Boolean)
  const quoteIds = quotes.map((q) => String(q.id))
  const invoiceIds = invoices.map((i) => String(i.id))
  const dealIds = crmDeals.map((d) => String(d.id))
  const mailTargets = [clientId, ...(accountId ? [accountId] : []), ...quoteIds, ...invoiceIds, ...dealIds]

  const [payments, quoteNotes, chaseLog, followUps, documents, mails, owner] = await Promise.all([
    money && invoiceRefs.length ? rows(db.from('payment_log').select('*').in('invoice_ref', invoiceRefs)) : Promise.resolve([] as Row[]),
    money && quoteIds.length ? rows(db.from('quote_notes').select('*').in('quotation_id', quoteIds)) : Promise.resolve([] as Row[]),
    money && invoiceIds.length ? rows(db.from('invoice_chase_log').select('*').in('invoice_id', invoiceIds)) : Promise.resolve([] as Row[]),
    dealIds.length ? rows(db.from('follow_up_updates').select('*').in('crm_id', dealIds)) : Promise.resolve([] as Row[]),
    dealIds.length ? rows(db.from('customer_documents').select('*').in('crm_id', dealIds)) : Promise.resolve([] as Row[]),
    rows(db.from('mail_links').select('id, subject, from_address, sent_at, created_at, linked_by, target_type, target_id').in('target_id', mailTargets)),
    account[0]?.owner_user_id
      ? rows(db.from('app_users').select('id, name, email').eq('id', String(account[0].owner_user_id)))
      : Promise.resolve([] as Row[]),
  ])

  const view = buildClient360({
    client: c,
    account: account[0] ?? null,
    ownerName: owner[0] ? String(owner[0].name || owner[0].email || '') : '',
    quotes,
    invoices,
    payments,
    customerPayments,
    pos,
    deliveryNotes,
    crmDeals,
    salesDeals,
    ctrmDeals,
    inquiries,
    tickets,
    accountContacts,
    documents,
    quoteNotes,
    chaseLog,
    followUps,
    activities,
    mails,
    today: opts.today ?? new Date(),
    moneyVisible: money,
    marginVisible: opts.marginVisible,
  })
  return { view, linksMissing: linksMissing.flag }
}
