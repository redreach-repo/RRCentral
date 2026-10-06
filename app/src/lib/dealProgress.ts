import type {
  CrmEntry,
  CustomerPayment,
  DeliveryNote,
  Invoice,
  Quotation,
} from './types'

export type DealStepId =
  | 'crm'
  | 'quoted'
  | 'quote_sent'
  | 'awarded'
  | 'invoiced'
  | 'paid'
  | 'delivered'

export type DealStep = {
  id: DealStepId
  label: string
  done: boolean
  detail?: string
}

function normClient(s: string): string {
  return (s || '').trim().toLowerCase()
}

/** Build quote→invoice→payment→delivery checklist for a CRM company. */
export function buildDealProgress(args: {
  crm: CrmEntry
  quotations: Quotation[]
  invoices: Invoice[]
  payments?: CustomerPayment[]
  deliveryNotes?: DeliveryNote[]
}): DealStep[] {
  const company = normClient(args.crm.company_name)
  const quotes = args.quotations.filter((q) => normClient(q.client) === company)
  const invoices = args.invoices.filter((i) => normClient(i.client) === company)
  const dns = (args.deliveryNotes || []).filter((d) => normClient(d.client) === company)
  const pays = (args.payments || []).filter((p) => normClient(p.client) === company)

  const hasQuote = quotes.length > 0
  const sentQuote = quotes.find((q) =>
    ['Sent', 'Awarded', 'Finalized'].includes(String(q.status || '')),
  )
  const awardedQuote = quotes.find((q) => String(q.status || '') === 'Awarded')
  const openOrAnyInvoice = invoices[0]
  const paidInvoice = invoices.find((i) => String(i.payment_status || '') === 'Paid')
  const clearedPay = pays.find((p) =>
    ['Received', 'Cleared', 'Partially received'].includes(String(p.status || '')),
  )
  const delivered = dns.find((d) => String(d.status || '') === 'Delivered')
  const issuedDn = dns.find((d) => ['Issued', 'Delivered'].includes(String(d.status || '')))

  const paid = Boolean(clearedPay) || Boolean(paidInvoice)

  return [
    {
      id: 'crm',
      label: 'CRM',
      done: true,
      detail: args.crm.pipeline_stage || undefined,
    },
    {
      id: 'quoted',
      label: 'Quoted',
      done: hasQuote,
      detail: hasQuote ? `${quotes.length} quote(s)` : undefined,
    },
    {
      id: 'quote_sent',
      label: 'Sent',
      done: Boolean(sentQuote),
      detail: sentQuote ? String(sentQuote.status) : undefined,
    },
    {
      id: 'awarded',
      label: 'Awarded',
      done: Boolean(awardedQuote) || args.crm.pipeline_stage === 'Won',
      detail:
        awardedQuote?.reference_number ||
        (args.crm.pipeline_stage === 'Won' ? 'Won' : undefined),
    },
    {
      id: 'invoiced',
      label: 'Invoiced',
      done: invoices.length > 0,
      detail: openOrAnyInvoice?.reference_number || undefined,
    },
    {
      id: 'paid',
      label: 'Paid',
      done: paid,
      detail: paid ? 'Payment received' : undefined,
    },
    {
      id: 'delivered',
      label: 'Delivered',
      done: Boolean(delivered || issuedDn),
      detail: delivered ? 'Delivered' : issuedDn ? String(issuedDn.status) : undefined,
    },
  ]
}
