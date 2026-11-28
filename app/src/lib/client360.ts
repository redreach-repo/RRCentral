/**
 * One client, everything about it (HighMast brief fix 3): the header, money
 * totals and every list on the client page, newest first. The client page
 * (pages/ClientPage.tsx) and the AI connector tool get_client_360 both build
 * from these rules, so they always agree.
 *
 * The loaders read through row level security: a person (or AI key) only
 * gets the rows they may see, so the totals follow the same rules as the
 * finance pages. Margin is left out unless the caller may see it.
 */
import { invoiceDueDate, isCollectible } from './contractBilling'
import { formatMoneyAmount, roundMoney } from './currency'
import { isCancelledInvoice } from './finance'

type Row = Record<string, unknown>

const s = (v: unknown) => (v == null ? '' : String(v)).trim()
const n = (v: unknown) => {
  const x = Number(v)
  return Number.isFinite(x) ? x : 0
}
const day = (v: unknown) => (s(v) ? s(v).slice(0, 10) : null)
const cur = (v: unknown) => s(v).toUpperCase() || 'AED'

export const CLIENT_SECTIONS = [
  { key: 'inquiries', label: 'Inquiries' },
  { key: 'quotes', label: 'Quotations' },
  { key: 'pos', label: 'Purchase orders' },
  { key: 'invoices', label: 'Invoices and credit notes' },
  { key: 'payments', label: 'Payments' },
  { key: 'delivery_notes', label: 'Delivery notes' },
  { key: 'contacts', label: 'Contacts' },
  { key: 'documents', label: 'Documents' },
  { key: 'tickets', label: 'Support tickets' },
  { key: 'timeline', label: 'Timeline' },
] as const
export type ClientSectionKey = (typeof CLIENT_SECTIONS)[number]['key']

/** Quote statuses that count as won. */
const AWARDED = new Set(['accepted', 'awarded'])

export function divisionOf(reference: unknown): string {
  const m = /^RR-(\d{2})-/i.exec(s(reference))
  return m ? m[1] : ''
}

export type ClientHeader = {
  id: string
  legal_name: string
  short_name: string
  trn: string
  address: string
  account_id: string | null
  account_reference: string
  owner: string
  status: string
  credit_limit: number | null
  credit_hold: boolean
  merged_into: string | null
}

export type MoneyTotals = {
  currency: string
  quoted: number
  awarded: number
  invoiced: number
  paid: number
  balance: number
  overdue: number
}

export type InquiryRow = { id: string; kind: 'deal' | 'enquiry'; pipeline: string; title: string; stage: string; date: string | null; owner: string; division: string }
export type QuoteRow = {
  id: string
  reference: string
  revision: number
  status: string
  date: string | null
  valid_until: string | null
  amount: number
  currency: string
  margin: number | null
  margin_pct: number | null
  division: string
}
export type QuoteGroup = { base_reference: string; current: QuoteRow; revisions: QuoteRow[]; date: string | null; status: string; division: string }
export type PoRow = { id: string; po_number: string; date: string | null; amount: number; currency: string; quote_reference: string; status: string; division: string; file_url: string }
export type InvoiceRow = {
  id: string
  reference: string
  date: string | null
  status: string
  payment_status: string
  amount: number
  currency: string
  paid: number
  balance: number
  due_date: string | null
  days_overdue: number
  credit_note: boolean
  division: string
}
export type PaymentRow = { id: string; date: string | null; amount: number; currency: string; invoice_ref: string; method: string; status: string; division: string }
export type DeliveryNoteRow = { id: string; reference: string; date: string | null; status: string; quote_ref: string; invoice_ref: string; division: string }
export type ContactRow = { name: string; role: string; email: string; phone: string; source: 'client' | 'account' }
export type DocumentRow = { id: string; title: string; category: string; url: string; date: string | null; source: string; status: string }
export type TicketRow = { id: string; subject: string; status: string; priority: string; date: string | null }
export type TimelineRow = { at: string; kind: string; text: string; ref: string; by: string; status: string }

export type Client360 = {
  header: ClientHeader
  totals: MoneyTotals[]
  money_visible: boolean
  margin_visible: boolean
  inquiries: InquiryRow[]
  quotes: QuoteGroup[]
  pos: PoRow[]
  invoices: InvoiceRow[]
  payments: PaymentRow[]
  delivery_notes: DeliveryNoteRow[]
  contacts: ContactRow[]
  documents: DocumentRow[]
  tickets: TicketRow[]
  timeline: TimelineRow[]
  counts: Record<ClientSectionKey, number>
}

export type Client360Input = {
  client: Row
  account?: Row | null
  /** Owner's display name, when known. */
  ownerName?: string
  quotes?: Row[]
  invoices?: Row[]
  /** payment_log rows of this client's invoices. */
  payments?: Row[]
  /** customer_payments rows linked to this client. */
  customerPayments?: Row[]
  pos?: Row[]
  deliveryNotes?: Row[]
  /** Company pipeline deals (crm). */
  crmDeals?: Row[]
  /** AI CRM deals (sales_deals) and CTRM Next deals (ctrm_deals) of the linked account. */
  salesDeals?: Row[]
  ctrmDeals?: Row[]
  inquiries?: Row[]
  tickets?: Row[]
  accountContacts?: Row[]
  documents?: Row[]
  quoteNotes?: Row[]
  chaseLog?: Row[]
  followUps?: Row[]
  activities?: Row[]
  mails?: Row[]
  today: Date
  /** False for people who may not see company money (staff); money lists and totals are then left out. */
  moneyVisible: boolean
  /** False for locked Sales without the quotes.margin switch, staff and the AI unless allowed. */
  marginVisible: boolean
}

const newest = <T>(key: (x: T) => string | null) => (a: T, b: T) => s(key(b)).localeCompare(s(key(a)))

function emptyTotals(currency: string): MoneyTotals {
  return { currency, quoted: 0, awarded: 0, invoiced: 0, paid: 0, balance: 0, overdue: 0 }
}

function quoteRow(q: Row, marginVisible: boolean): QuoteRow {
  const amount = n(q.amount)
  const cost = n(q.supplier_cost_base)
  const fx = n(q.fx_rate) || 1
  const baseAmount = n(q.base_amount) || amount * fx
  const margin = marginVisible && cost > 0 ? roundMoney(baseAmount - cost) : null
  return {
    id: s(q.id),
    reference: s(q.reference_number) || s(q.quote_id) || 'Draft quote',
    revision: n(q.revision),
    status: s(q.status) || 'Draft',
    date: day(q.date),
    valid_until: day(q.valid_until),
    amount: roundMoney(amount),
    currency: cur(q.quotation_currency || q.currency),
    margin,
    margin_pct: margin != null && baseAmount > 0 ? Math.round((margin / baseAmount) * 1000) / 10 : null, // money-guard: not money (a percentage)
    division: s(q.division_code) || divisionOf(q.reference_number),
  }
}

/** Revisions under their base reference; the current one is the latest that is not a draft (or the latest draft if all are drafts). */
export function groupQuotes(quotes: Row[], marginVisible: boolean): QuoteGroup[] {
  const groups = new Map<string, QuoteRow[]>()
  for (const q of quotes) {
    if (q.deleted_at) continue
    const row = quoteRow(q, marginVisible)
    const base = s(q.base_reference) || s(q.reference_number) || s(q.quote_id) || row.id
    const list = groups.get(base)
    if (list) list.push(row)
    else groups.set(base, [row])
  }
  const out: QuoteGroup[] = []
  for (const [base, rows] of groups) {
    rows.sort((a, b) => b.revision - a.revision || s(b.date).localeCompare(s(a.date)))
    const current = rows.find((r) => r.status.toLowerCase() !== 'draft' && r.status.toLowerCase() !== 'superseded') ?? rows[0]
    out.push({ base_reference: base, current, revisions: rows, date: current.date ?? rows[0].date, status: current.status, division: current.division })
  }
  return out.sort(newest((g) => g.date))
}

export function buildClient360(input: Client360Input): Client360 {
  const today = input.today.toISOString().slice(0, 10)
  const c = input.client
  const a = input.account ?? null
  const money = input.moneyVisible
  const margin = money && input.marginVisible

  const header: ClientHeader = {
    id: s(c.id),
    legal_name: s(c.company_name),
    short_name: s(c.short_name) || s(a?.name),
    trn: s(c.trn),
    address: s(c.address),
    account_id: s(c.account_id) || null,
    account_reference: s(a?.reference),
    owner: s(input.ownerName) || s(c.company_owner),
    status: s(c.merged_into) ? 'merged' : s(a?.status) || 'active',
    credit_limit: a && a.credit_limit_aed != null && s(a.credit_limit_aed) !== '' ? n(a.credit_limit_aed) : null,
    credit_hold: Boolean(a?.credit_hold),
    merged_into: s(c.merged_into) || null,
  }

  // Money
  const quoteGroups = money ? groupQuotes(input.quotes ?? [], margin) : []
  const paidByRef = new Map<string, number>()
  for (const p of money ? input.payments ?? [] : []) {
    const ref = s(p.invoice_ref)
    if (ref) paidByRef.set(ref, (paidByRef.get(ref) ?? 0) + n(p.amount))
  }
  const invoices: InvoiceRow[] = money
    ? (input.invoices ?? [])
        .filter((i) => !i.deleted_at)
        .map((i) => {
          const ref = s(i.reference_number)
          const amount = roundMoney(n(i.amount))
          const paid = roundMoney(paidByRef.get(ref) ?? 0)
          const collectible = isCollectible({ status: s(i.status), payment_status: s(i.payment_status) } as never)
          const balance = collectible ? roundMoney(Math.max(0, amount - paid)) : 0
          const due = invoiceDueDate({ date: day(i.date), payment_terms: s(i.payment_terms) } as never)
          const days = due && balance > 0 && due < today ? Math.round((Date.parse(today) - Date.parse(due)) / 86400000) : 0 // money-guard: not money (days)
          return {
            id: s(i.id),
            reference: ref || 'Invoice',
            date: day(i.date),
            status: s(i.status),
            payment_status: s(i.payment_status),
            amount,
            currency: cur(i.currency),
            paid,
            balance,
            due_date: due,
            days_overdue: days,
            credit_note: amount < 0 || /credit/i.test(s(i.status)),
            division: s(i.division_code) || divisionOf(ref),
          }
        })
        .sort(newest((r) => r.date))
    : []

  const totals = new Map<string, MoneyTotals>()
  const t = (currency: string) => {
    let x = totals.get(currency)
    if (!x) totals.set(currency, (x = emptyTotals(currency)))
    return x
  }
  for (const g of quoteGroups) {
    if (g.current.status.toLowerCase() === 'draft') continue
    t(g.current.currency).quoted += g.current.amount
    if (AWARDED.has(g.current.status.toLowerCase())) t(g.current.currency).awarded += g.current.amount
  }
  for (const i of invoices) {
    if (i.status.toLowerCase() === 'draft' || isCancelledInvoice(i)) continue
    const x = t(i.currency)
    x.invoiced += i.amount
    x.paid += i.paid
    x.balance += i.balance
    if (i.days_overdue > 0) x.overdue += i.balance
  }
  const totalsList = [...totals.values()]
    .map((x) => ({
      ...x,
      quoted: roundMoney(x.quoted),
      awarded: roundMoney(x.awarded),
      invoiced: roundMoney(x.invoiced),
      paid: roundMoney(x.paid),
      balance: roundMoney(x.balance),
      overdue: roundMoney(x.overdue),
    }))
    .sort((p, q) => (p.currency === 'AED' ? -1 : q.currency === 'AED' ? 1 : p.currency.localeCompare(q.currency)))

  const payments: PaymentRow[] = money
    ? [
        ...(input.payments ?? []).map((p) => ({
          id: s(p.id),
          date: day(p.created_at),
          amount: roundMoney(n(p.amount)),
          currency: cur(p.currency),
          invoice_ref: s(p.invoice_ref),
          method: s(p.method),
          status: 'Recorded',
          division: divisionOf(p.invoice_ref),
        })),
        ...(input.customerPayments ?? [])
          .filter((p) => !p.deleted_at)
          .map((p) => ({
            id: s(p.id),
            date: day(p.payment_date),
            amount: roundMoney(n(p.amount_received)),
            currency: cur(p.currency),
            invoice_ref: s(p.invoice_ref) || s(p.quote_ref),
            method: s(p.payment_method),
            status: s(p.status) || 'Received',
            division: divisionOf(p.invoice_ref || p.quote_ref),
          })),
      ].sort(newest((r) => r.date))
    : []

  const pos: PoRow[] = (input.pos ?? [])
    .filter((p) => !p.deleted_at)
    .map((p) => ({
      id: s(p.id),
      po_number: s(p.po_number) || 'PO',
      date: day(p.issued_on) || day(p.created_at),
      amount: money ? roundMoney(n(p.amount)) : 0,
      currency: cur(p.currency),
      quote_reference: s(p.quote_reference),
      status: s(p.status),
      division: s(p.division_code) || divisionOf(p.quote_reference),
      file_url: s(p.file_url),
    }))
    .sort(newest((r) => r.date))

  const deliveryNotes: DeliveryNoteRow[] = (input.deliveryNotes ?? [])
    .filter((d) => !d.deleted_at)
    .map((d) => ({
      id: s(d.id),
      reference: s(d.reference_number) || 'Delivery note',
      date: day(d.delivery_date) || day(d.date),
      status: s(d.status),
      quote_ref: s(d.quote_ref),
      invoice_ref: s(d.invoice_ref),
      division: s(d.division_code) || divisionOf(d.reference_number),
    }))
    .sort(newest((r) => r.date))

  const inquiries: InquiryRow[] = [
    ...(input.crmDeals ?? []).filter((d) => !d.deleted_at).map((d) => ({
      id: s(d.id),
      kind: 'deal' as const,
      pipeline: 'Company',
      title: s(d.next_action) || s(d.primary_contact) || s(d.company_name),
      stage: s(d.pipeline_stage),
      date: day(d.created_at),
      owner: s(d.owner),
      division: divisionOf(d.quote_ref),
    })),
    ...(input.salesDeals ?? []).filter((d) => !d.deleted_at).map((d) => ({
      id: s(d.id),
      kind: 'deal' as const,
      pipeline: 'AI CRM',
      title: s(d.next_action) || s(d.notes).slice(0, 80) || 'AI CRM deal',
      stage: s(d.stage),
      date: day(d.created_at),
      owner: '',
      division: '',
    })),
    ...(input.ctrmDeals ?? []).filter((d) => !d.deleted_at).map((d) => ({
      id: s(d.id),
      kind: 'deal' as const,
      pipeline: 'CTRM Next',
      title: s(d.next_action) || s(d.notes).slice(0, 80) || 'CTRM Next deal',
      stage: s(d.stage),
      date: day(d.created_at),
      owner: '',
      division: '',
    })),
    ...(input.inquiries ?? []).map((w) => ({
      id: s(w.id),
      kind: 'enquiry' as const,
      pipeline: 'Website',
      title: s(w.message).slice(0, 120) || s(w.name) || 'Website enquiry',
      stage: s(w.status),
      date: day(w.created_at),
      owner: '',
      division: '',
    })),
  ].sort(newest((r) => r.date))

  const contacts: ContactRow[] = []
  const seenContact = new Set<string>()
  const addContact = (x: ContactRow) => {
    const key = (x.email || x.phone || x.name).toLowerCase().replace(/\s+/g, '')
    if (!key || seenContact.has(key)) return
    seenContact.add(key)
    contacts.push(x)
  }
  if (s(c.primary_contact) || s(c.email)) {
    addContact({ name: s(c.primary_contact), role: 'Primary', email: s(c.email), phone: s(c.mobile) || s(c.office), source: 'client' })
  }
  for (const x of Array.isArray(c.contacts) ? (c.contacts as Row[]) : []) {
    addContact({ name: s(x.name), role: s(x.role) || s(x.title), email: s(x.email), phone: s(x.phone) || s(x.mobile), source: 'client' })
  }
  for (const x of input.accountContacts ?? []) {
    if (x.deleted_at) continue
    addContact({ name: s(x.name), role: s(x.role), email: s(x.email), phone: s(x.phone) || s(x.whatsapp), source: 'account' })
  }

  const documents: DocumentRow[] = [
    ...(input.documents ?? []).filter((d) => !d.deleted_at).map((d) => ({
      id: s(d.id),
      title: s(d.title) || s(d.file_name) || 'Document',
      category: s(d.category),
      url: s(d.drive_url),
      date: day(d.uploaded_at),
      source: 'Customer files',
      status: s(d.category),
    })),
    ...(input.pos ?? []).filter((p) => !p.deleted_at && s(p.file_url)).map((p) => ({
      id: `po-${s(p.id)}`,
      title: s(p.file_name) || `PO ${s(p.po_number)}`,
      category: 'Purchase order',
      url: s(p.file_url),
      date: day(p.issued_on) || day(p.created_at),
      source: 'Client PO',
      status: 'Purchase order',
    })),
  ].sort(newest((r) => r.date))

  const tickets: TicketRow[] = (input.tickets ?? [])
    .filter((k) => !k.deleted_at)
    .map((k) => ({ id: s(k.id), subject: s(k.subject) || 'Ticket', status: s(k.status), priority: s(k.priority), date: day(k.created_at) }))
    .sort(newest((r) => r.date))

  const quoteRef = new Map<string, string>()
  for (const g of quoteGroups) for (const r of g.revisions) quoteRef.set(r.id, r.reference)
  const invoiceRef = new Map(invoices.map((i) => [i.id, i.reference]))
  const timeline: TimelineRow[] = [
    ...(money ? input.quoteNotes ?? [] : []).map((x) => ({
      at: s(x.created_at),
      kind: s(x.kind) === 'note' ? 'Quote note' : 'Quote status',
      text: s(x.body),
      ref: quoteRef.get(s(x.quotation_id)) || s(x.quote_ref),
      by: s(x.created_by_email),
      status: s(x.kind),
    })),
    ...(money ? input.chaseLog ?? [] : []).filter((x) => !x.deleted_at).map((x) => ({
      at: s(x.created_at) || s(x.chased_on),
      kind: 'Chase',
      text: [s(x.channel), s(x.contact), s(x.note), s(x.promised_date) ? `promised ${s(x.promised_date)}` : ''].filter(Boolean).join(' · '),
      ref: invoiceRef.get(s(x.invoice_id)) || '',
      by: s(x.created_by_email),
      status: 'chase',
    })),
    ...(input.followUps ?? []).map((x) => ({ at: s(x.created_at), kind: 'Deal update', text: s(x.update_text), ref: '', by: s(x.user_email), status: 'update' })),
    ...(input.activities ?? []).map((x) => ({ at: s(x.created_at), kind: s(x.kind) === 'email' ? 'Email' : 'Activity', text: s(x.body), ref: '', by: s(x.user_email), status: s(x.kind) })),
    ...(input.mails ?? []).map((x) => ({
      at: s(x.sent_at) || s(x.created_at),
      kind: 'Email',
      text: [s(x.subject), s(x.from_address) ? `from ${s(x.from_address)}` : ''].filter(Boolean).join(' · '),
      ref: '',
      by: s(x.linked_by),
      status: 'email',
    })),
    ...quoteGroups.flatMap((g) =>
      g.revisions.filter((r) => r.date).map((r) => ({ at: s(r.date), kind: 'Quote', text: `${r.reference} ${r.status}`, ref: r.reference, by: '', status: r.status })),
    ),
    ...invoices.filter((i) => i.date).map((i) => ({ at: s(i.date), kind: 'Invoice', text: `${i.reference} ${i.status}`, ref: i.reference, by: '', status: i.status })),
    ...pos.filter((p) => p.date).map((p) => ({ at: s(p.date), kind: 'Purchase order', text: `PO ${p.po_number} received`, ref: p.po_number, by: '', status: p.status })),
    ...payments.filter((p) => p.date).map((p) => ({ at: s(p.date), kind: 'Payment', text: `${formatMoneyAmount(p.amount, p.currency)} received`, ref: p.invoice_ref, by: '', status: p.status })),
    ...deliveryNotes.filter((d) => d.date).map((d) => ({ at: s(d.date), kind: 'Delivery', text: `${d.reference} ${d.status}`, ref: d.reference, by: '', status: d.status })),
  ]
    .filter((x) => x.at)
    .sort(newest((r) => r.at))

  const out = {
    header,
    totals: money ? totalsList : [],
    money_visible: money,
    margin_visible: margin,
    inquiries,
    quotes: quoteGroups,
    pos,
    invoices,
    payments,
    delivery_notes: deliveryNotes,
    contacts,
    documents,
    tickets,
    timeline,
  }
  return {
    ...out,
    counts: {
      inquiries: inquiries.length,
      quotes: quoteGroups.length,
      pos: pos.length,
      invoices: invoices.length,
      payments: payments.length,
      delivery_notes: deliveryNotes.length,
      contacts: contacts.length,
      documents: documents.length,
      tickets: tickets.length,
      timeline: timeline.length,
    },
  }
}

export type ClientFilter = { from?: string; to?: string; status?: string; division?: string }

/** Rows inside the date range, with the status (any case, contains) and division picked. Rows with no date stay unless a range is set. */
export function filterClientRows<T extends { date?: string | null; at?: string; status?: string; division?: string }>(rows: T[], f: ClientFilter): T[] {
  const status = s(f.status).toLowerCase()
  return rows.filter((r) => {
    const d = s(r.date ?? r.at).slice(0, 10)
    if (f.from && (!d || d < f.from)) return false
    if (f.to && (!d || d > f.to)) return false
    if (status && !s(r.status).toLowerCase().includes(status)) return false
    if (f.division && r.division !== undefined && r.division !== f.division) return false
    return true
  })
}

/** Sentence for the AI and the page header: "Quoted AED 120,000.00 · awarded ... · overdue ...". */
export function totalsLine(t: MoneyTotals): string {
  const f = (x: number) => x.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${t.currency}: quoted ${f(t.quoted)}, awarded ${f(t.awarded)}, invoiced ${f(t.invoiced)}, balance due ${f(t.balance)}, overdue ${f(t.overdue)}`
}
