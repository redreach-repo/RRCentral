import { format, parseISO } from 'date-fns'
import { db } from './db'
import { formatAED } from './money'
import { displayDocumentReference } from './documents'
import { applyMessageTemplate } from './templates'
import { isOpenInvoice } from './finance'
import type { CrmEntry, Invoice, Quotation } from './types'

export type FollowUpDocKind = 'quote' | 'invoice'

export type FollowUpDocument = {
  kind: FollowUpDocKind
  ref: string
  date: string
  dateLabel: string
  amount: number
  amountLabel: string
  status: string
  paymentStatus?: string
  validUntil?: string | null
  client: string
}

export const DEFAULT_WHATSAPP_FOLLOWUP_QUOTE = `Hello{{contactGreeting}},

Following up on our quotation {{ref}} dated {{date}} for {{client}} ({{amount}}){{validUntilLine}}.

Kindly update us on the status at your earliest convenience.

Best regards,
{{company}}`

export const DEFAULT_WHATSAPP_FOLLOWUP_INVOICE = `Hello{{contactGreeting}},

Following up on our invoice {{ref}} dated {{date}} for {{client}} ({{amount}}). Current payment status: {{paymentStatus}}.

Kindly update us on the payment status at your earliest convenience.

Best regards,
{{company}}`

function formatDocDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  try {
    return format(parseISO(String(dateStr).slice(0, 10)), 'dd MMM yyyy')
  } catch {
    return String(dateStr).slice(0, 10)
  }
}

function quoteRank(q: Quotation): number {
  switch (q.status) {
    case 'Sent':
      return 50
    case 'Finalized':
      return 40
    case 'Awarded':
      return 30
    case 'Expired':
      return 10
    case 'Draft':
      return 0
    default:
      return 5
  }
}

/** Prefer actionable docs for a polite status follow-up. */
export function pickFollowUpDocument(opts: {
  company: string
  quoteRef?: string | null
  nextAction?: string | null
  quotes: Quotation[]
  invoices: Invoice[]
}): FollowUpDocument | null {
  const company = opts.company.trim().toLowerCase()
  const quoteRef = (opts.quoteRef || '').trim().toLowerCase()
  const next = (opts.nextAction || '').toLowerCase()
  const preferPayment =
    next.includes('payment') || next.includes('collect') || next.includes('invoice')

  const companyQuotes = opts.quotes.filter(
    (q) => (q.client || '').trim().toLowerCase() === company,
  )
  const companyInvoices = opts.invoices.filter(
    (i) => (i.client || '').trim().toLowerCase() === company,
  )

  const byRef =
    quoteRef
      ? companyQuotes.find((q) => (q.reference_number || '').trim().toLowerCase() === quoteRef) ||
        opts.quotes.find((q) => (q.reference_number || '').trim().toLowerCase() === quoteRef)
      : undefined

  const openInvoices = companyInvoices
    .filter(isOpenInvoice)
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))

  const followQuotes = companyQuotes
    .filter((q) => ['Sent', 'Finalized', 'Awarded', 'Expired'].includes(q.status))
    .sort((a, b) => {
      const rank = quoteRank(b) - quoteRank(a)
      if (rank) return rank
      return String(b.date || b.created_at || '').localeCompare(String(a.date || a.created_at || ''))
    })

  let chosen: { kind: FollowUpDocKind; quote?: Quotation; invoice?: Invoice } | null = null

  if (preferPayment && openInvoices[0]) {
    chosen = { kind: 'invoice', invoice: openInvoices[0] }
  } else if (byRef && !['Draft', 'Superseded', 'Not awarded'].includes(byRef.status)) {
    chosen = { kind: 'quote', quote: byRef }
  } else if (followQuotes[0]) {
    chosen = { kind: 'quote', quote: followQuotes[0] }
  } else if (openInvoices[0]) {
    chosen = { kind: 'invoice', invoice: openInvoices[0] }
  } else if (byRef) {
    chosen = { kind: 'quote', quote: byRef }
  }

  if (!chosen) return null

  if (chosen.kind === 'quote' && chosen.quote) {
    const q = chosen.quote
    const ref = displayDocumentReference({
      referenceNumber: q.reference_number,
      fallbackId: q.quote_id,
      status: q.status,
    })
    return {
      kind: 'quote',
      ref,
      date: q.date || '',
      dateLabel: formatDocDate(q.date),
      amount: Number(q.amount || 0),
      amountLabel: formatAED(Number(q.amount || 0)),
      status: q.status || '',
      validUntil: q.valid_until,
      client: q.client || opts.company,
    }
  }

  if (chosen.kind === 'invoice' && chosen.invoice) {
    const inv = chosen.invoice
    const ref = displayDocumentReference({
      referenceNumber: inv.reference_number,
      status: inv.status,
      draftLabel: 'DRAFT',
    })
    return {
      kind: 'invoice',
      ref,
      date: inv.date || '',
      dateLabel: formatDocDate(inv.date),
      amount: Number(inv.amount || 0),
      amountLabel: formatAED(Number(inv.amount || 0)),
      status: inv.status || '',
      paymentStatus: inv.payment_status || inv.status || 'Pending',
      client: inv.client || opts.company,
    }
  }

  return null
}

export async function loadFollowUpDocument(entry: CrmEntry): Promise<FollowUpDocument | null> {
  const company = entry.company_name || ''
  const [qRes, iRes] = await Promise.all([
    db.from('quotations').select('*').ilike('client', company).order('created_at', { ascending: false }),
    db.from('invoices').select('*').ilike('client', company).order('created_at', { ascending: false }),
  ])
  // Also try quote_ref exact match across all quotes if company filter misses
  let quotes = (qRes.data || []) as Quotation[]
  const invoices = (iRes.data || []) as Invoice[]
  if (entry.quote_ref) {
    const { data } = await db
      .from('quotations')
      .select('*')
      .eq('reference_number', entry.quote_ref)
      .limit(1)
    const hit = (data || []) as Quotation[]
    if (hit[0] && !quotes.some((q) => q.id === hit[0].id)) {
      quotes = [hit[0], ...quotes]
    }
  }
  return pickFollowUpDocument({
    company,
    quoteRef: entry.quote_ref,
    nextAction: entry.next_action,
    quotes,
    invoices,
  })
}

export function buildFollowUpWhatsAppMessage(opts: {
  entry: CrmEntry
  contactName?: string | null
  companyName: string
  doc: FollowUpDocument | null
  /** Optional custom templates from settings */
  quoteTemplate?: string
  invoiceTemplate?: string
  genericTemplate?: string
}): string {
  const contact = (opts.contactName || '').trim()
  const base = {
    contactGreeting: contact ? ` ${contact}` : '',
    contact: contact || 'team',
    client: opts.entry.company_name,
    company: opts.companyName,
    nextAction: opts.entry.next_action || '',
  }

  if (opts.doc?.kind === 'quote') {
    const validUntilLine = opts.doc.validUntil
      ? `\nValid until: ${formatDocDate(opts.doc.validUntil)}`
      : ''
    return applyMessageTemplate(opts.quoteTemplate || DEFAULT_WHATSAPP_FOLLOWUP_QUOTE, {
      ...base,
      ref: opts.doc.ref,
      date: opts.doc.dateLabel,
      amount: opts.doc.amountLabel,
      status: opts.doc.status,
      validUntilLine,
      title: 'Quotation',
      titleLower: 'quotation',
    })
  }

  if (opts.doc?.kind === 'invoice') {
    return applyMessageTemplate(opts.invoiceTemplate || DEFAULT_WHATSAPP_FOLLOWUP_INVOICE, {
      ...base,
      ref: opts.doc.ref,
      date: opts.doc.dateLabel,
      amount: opts.doc.amountLabel,
      status: opts.doc.status,
      paymentStatus: opts.doc.paymentStatus || 'Pending',
      title: 'Invoice',
      titleLower: 'invoice',
    })
  }

  return applyMessageTemplate(
    opts.genericTemplate ||
      'Hello{{contactGreeting}},\n\nFollowing up regarding {{client}}. Kindly update us on the status at your earliest convenience.\n\nBest regards,\n{{company}}',
    base,
  )
}
