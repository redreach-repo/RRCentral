import { db } from './db'
import { VAT_RATE } from './config'
import { isUndefinedColumnError } from './errors'
import { expenseVatParts } from './finance'
import { round2 } from './lineItems'
import { supplierInvoiceProfit } from './supplierInvoiceParse'
import {
  allocateSupplierCostAcrossDeal,
  resolveDealRef,
} from './dealQuotes'
import type { Attachment, Expense, Quotation } from './types'
import { ensureVendor } from './vendors'

/** Attachments for supplier PDFs live on the quotation / deal (not only on the expense). */
export const QUOTE_SUPPLIER_INVOICE_ENTITY = 'quotation_supplier_invoice'

/**
 * Expense report wording, e.g. "Payment to ACME Uniforms LLC for RR-01-26003".
 * Company name comes from the supplier invoice vendor field.
 * When a deal has branches, quoteRef is the shared deal_ref.
 */
export function formatSupplierExpenseDescription(vendor: string, quoteRef: string): string {
  const company = String(vendor || '').trim() || 'supplier'
  const quote = String(quoteRef || '').trim()
  if (!quote) return `Payment to ${company}`
  return `Payment to ${company} for ${quote}`
}

/** Prefer stored payment description; else build from vendor + quote_ref. */
export function expenseReportDescription(row: Pick<Expense, 'vendor' | 'quote_ref' | 'notes' | 'references_text'>): string {
  const notes = String(row.notes || '').trim()
  if (/^payment to\b/i.test(notes)) {
    return notes.split(/\n/)[0].trim()
  }
  const quote = String(row.quote_ref || '').trim()
  if (quote) return formatSupplierExpenseDescription(row.vendor, quote)
  return notes || String(row.references_text || '').trim() || String(row.vendor || '').trim()
}

export function quoteAttachmentRefs(
  quote: Pick<Quotation, 'deal_ref' | 'reference_number' | 'quote_id' | 'id' | 'base_reference'>,
): string[] {
  return [resolveDealRef(quote), quote.deal_ref, quote.reference_number, quote.base_reference, quote.quote_id, quote.id]
    .map((v) => String(v || '').trim())
    .filter(Boolean)
    .filter((v, i, arr) => arr.indexOf(v) === i)
}

export async function loadQuoteSupplierInvoiceAttachments(
  quote: Pick<Quotation, 'deal_ref' | 'reference_number' | 'quote_id' | 'id' | 'base_reference'>,
): Promise<Attachment[]> {
  const refs = quoteAttachmentRefs(quote)
  if (!refs.length) return []
  const { data, error } = await db
    .from('attachments')
    .select('*')
    .eq('entity_type', QUOTE_SUPPLIER_INVOICE_ENTITY)
    .order('uploaded_at', { ascending: false })
  if (error) throw error
  const rows = (data || []) as Attachment[]
  const set = new Set(refs)
  return rows.filter((a) => set.has(String(a.entity_ref || '').trim()))
}

export async function loadQuoteSupplierExpenses(
  quote: Pick<Quotation, 'deal_ref' | 'reference_number' | 'quote_id' | 'id' | 'base_reference'>,
): Promise<Expense[]> {
  const refs = quoteAttachmentRefs(quote)
  if (!refs.length) return []
  const { data, error } = await db.from('expenses').select('*').order('date', { ascending: false })
  if (error) throw error
  const set = new Set(refs)
  return ((data || []) as Expense[]).filter((e) => {
    const q = String(e.quote_ref || '').trim()
    return q && set.has(q)
  })
}

export async function loadDealQuotes(dealRef: string): Promise<Quotation[]> {
  const key = String(dealRef || '').trim()
  if (!key) return []
  const { data, error } = await db.from('quotations').select('*').order('created_at', { ascending: true })
  if (error) throw error
  return ((data || []) as Quotation[]).filter((q) => resolveDealRef(q) === key)
}

export type PendingAttachment = { name: string; dataUrl: string; mime?: string }

/** WorkDrive share link stored as a light attachment row (url is https, not a data: blob). */
export type PendingWorkDriveLink = { title: string; url: string }

function isDataUrlBlob(url: string): boolean {
  return String(url || '').trim().toLowerCase().startsWith('data:')
}

/** Delete bulky PDF data-URLs previously stored on quotations / mirrored expenses. Keeps expense metadata. */
export async function clearSupplierInvoiceBlobs(): Promise<{ quoteAttachments: number; expenseAttachments: number }> {
  const { data, error } = await db.from('attachments').select('*')
  if (error) throw error
  const rows = (data || []) as Attachment[]
  let quoteAttachments = 0
  let expenseAttachments = 0
  for (const row of rows) {
    if (!isDataUrlBlob(row.url)) continue
    const type = String(row.entity_type || '')
    if (type !== QUOTE_SUPPLIER_INVOICE_ENTITY && type !== 'expense') continue
    // Only clear expense blobs that look like invoice PDFs (avoid wiping unrelated expense receipts unless data URL).
    if (type === 'expense' && !/\.pdf$/i.test(row.file_name || '') && !/invoice/i.test(row.file_name || '')) {
      continue
    }
    const { error: delErr } = await db.from('attachments').delete().eq('id', row.id)
    if (delErr) throw delErr
    if (type === QUOTE_SUPPLIER_INVOICE_ENTITY) quoteAttachments += 1
    else expenseAttachments += 1
  }
  return { quoteAttachments, expenseAttachments }
}

export async function saveAttachmentsToQuote(opts: {
  quote: Pick<Quotation, 'deal_ref' | 'reference_number' | 'quote_id' | 'id' | 'base_reference'>
  files: PendingAttachment[]
  uploadedBy: string
}): Promise<string> {
  const entityRef = resolveDealRef(opts.quote)
  if (!entityRef) throw new Error('Quotation needs a reference before attaching a supplier invoice')
  for (const file of opts.files) {
    // Refuse to persist data-URL blobs — use WorkDrive links instead.
    if (isDataUrlBlob(file.dataUrl)) {
      throw new Error('Upload the PDF to Zoho WorkDrive and paste the share link instead of storing the file here')
    }
    const { error } = await db.from('attachments').insert({
      entity_type: QUOTE_SUPPLIER_INVOICE_ENTITY,
      entity_ref: entityRef,
      file_name: file.name,
      storage_path: 'zoho_workdrive',
      url: file.dataUrl,
      uploaded_by: opts.uploadedBy,
      uploaded_at: new Date().toISOString(),
    })
    if (error) throw error
  }
  return entityRef
}

export async function saveWorkDriveLinkToQuote(opts: {
  quote: Pick<Quotation, 'deal_ref' | 'reference_number' | 'quote_id' | 'id' | 'base_reference' | 'client'>
  link: PendingWorkDriveLink
  uploadedBy: string
}): Promise<string> {
  const entityRef = resolveDealRef(opts.quote)
  if (!entityRef) throw new Error('Quotation needs a reference before attaching a supplier invoice')
  const url = opts.link.url.trim()
  const title = opts.link.title.trim() || 'Supplier invoice'
  if (!url) throw new Error('Paste a Zoho WorkDrive share link')

  const { error } = await db.from('attachments').insert({
    entity_type: QUOTE_SUPPLIER_INVOICE_ENTITY,
    entity_ref: entityRef,
    file_name: title,
    storage_path: 'zoho_workdrive',
    url,
    uploaded_by: opts.uploadedBy,
    uploaded_at: new Date().toISOString(),
  })
  if (error) throw error

  // Also index on the customer folder when we know the client name.
  const company = String(opts.quote.client || '').trim()
  if (company) {
    try {
      const { saveCustomerDriveLink } = await import('./customerFiles')
      await saveCustomerDriveLink({
        company,
        category: 'supplier_invoice',
        title,
        driveUrl: url,
        relatedRef: entityRef,
        notes: 'Supplier invoice',
        uploadedBy: opts.uploadedBy,
      })
    } catch {
      /* customer_documents optional until SQL upgrade */
    }
  }

  return entityRef
}

export async function saveAttachmentsToExpense(opts: {
  expenseId: string
  files: PendingAttachment[]
  uploadedBy: string
}) {
  for (const file of opts.files) {
    if (isDataUrlBlob(file.dataUrl)) continue
    const { error } = await db.from('attachments').insert({
      entity_type: 'expense',
      entity_ref: opts.expenseId,
      file_name: file.name,
      storage_path: 'zoho_workdrive',
      url: file.dataUrl,
      uploaded_by: opts.uploadedBy,
      uploaded_at: new Date().toISOString(),
    })
    if (error) throw error
  }
}

export async function upsertSupplierInvoiceExpense(opts: {
  expenseId?: string
  quote: Pick<Quotation, 'deal_ref' | 'reference_number' | 'quote_id' | 'id' | 'base_reference'>
  vendor: string
  date: string | null
  category: string
  amount: number
  amount_ex_vat: number
  vat_amount: number
  payment_method: string
  references_text: string
  notes: string
  supplier_invoice_no: string
}): Promise<{ expenseId: string; usedLegacyColumns: boolean; dealRef: string }> {
  const dealRef = resolveDealRef(opts.quote)
  const payload = {
    date: opts.date,
    vendor: opts.vendor.trim(),
    category: opts.category,
    amount: round2(opts.amount),
    amount_ex_vat: round2(opts.amount_ex_vat),
    vat_amount: round2(opts.vat_amount),
    payment_method: opts.payment_method,
    references_text: opts.references_text.trim() || dealRef,
    notes: opts.notes.trim(),
    quote_ref: dealRef,
    supplier_invoice_no: opts.supplier_invoice_no.trim(),
  }

  let expenseId = opts.expenseId || ''
  let usedLegacyColumns = false

  const stripLegacy = <T extends typeof payload>(row: T) => {
    const {
      amount_ex_vat: _a,
      vat_amount: _v,
      quote_ref: _q,
      supplier_invoice_no: _s,
      ...legacy
    } = row
    return legacy
  }

  if (expenseId) {
    let { error } = await db.from('expenses').update(payload).eq('id', expenseId)
    if (error && isUndefinedColumnError(error)) {
      const retry = await db.from('expenses').update(stripLegacy(payload)).eq('id', expenseId)
      if (retry.error) throw retry.error
      usedLegacyColumns = true
    } else if (error) throw error
  } else {
    expenseId = crypto.randomUUID()
    let { error } = await db.from('expenses').insert({ ...payload, id: expenseId })
    if (error && isUndefinedColumnError(error)) {
      const retry = await db.from('expenses').insert({ ...stripLegacy(payload), id: expenseId })
      if (retry.error) throw retry.error
      usedLegacyColumns = true
    } else if (error) throw error
  }

  return { expenseId, usedLegacyColumns, dealRef }
}

export async function syncQuoteSupplierCostFromExpense(opts: {
  quote: Quotation
  exclusiveCost: number
  vatRate?: number
  updatedBy: string
}) {
  const rate = Number(opts.vatRate) || VAT_RATE
  const dealRef = resolveDealRef(opts.quote)
  const siblings = await loadDealQuotes(dealRef)
  const pool = siblings.length ? siblings : [opts.quote]
  const shares = allocateSupplierCostAcrossDeal(pool, opts.exclusiveCost, rate)
  const now = new Date().toISOString()
  for (const share of shares) {
    const { error } = await db
      .from('quotations')
      .update({
        supplier_cost_base: share.costExclusive,
        estimated_gross_profit_base: share.profit,
        updated_by: opts.updatedBy,
        updated_at: now,
      })
      .eq('id', share.quoteId)
    if (error) throw error
  }
  return shares
}

/** Save WorkDrive link on the quotation, mirror as finance expense, update quote GP. */
export async function saveSupplierInvoiceForQuote(opts: {
  quote: Quotation
  files?: PendingAttachment[]
  workDriveLink?: PendingWorkDriveLink | null
  uploadedBy: string
  vendor: string
  date: string | null
  category?: string
  amount: number
  amount_ex_vat: number
  vat_amount: number
  payment_method: string
  references_text?: string
  notes?: string
  supplier_invoice_no?: string
  expenseId?: string
  vatRate?: number
}) {
  const dealRef = resolveDealRef(opts.quote)
  if (!dealRef) throw new Error('Save or finalize the quotation first so it has a reference')

  // Ensure the quote carries deal_ref so siblings can find the shared invoice.
  if (!String(opts.quote.deal_ref || '').trim()) {
    const { error: dealErr } = await db
      .from('quotations')
      .update({ deal_ref: dealRef, updated_at: new Date().toISOString() })
      .eq('id', opts.quote.id)
    if (dealErr && !isUndefinedColumnError(dealErr)) throw dealErr
  }

  // Clear old data-URL blobs once when saving the new WorkDrive-based flow.
  try {
    await clearSupplierInvoiceBlobs()
  } catch {
    /* best-effort purge */
  }

  const link = opts.workDriveLink
  if (link?.url.trim()) {
    await saveWorkDriveLinkToQuote({
      quote: { ...opts.quote, deal_ref: dealRef },
      link,
      uploadedBy: opts.uploadedBy,
    })
  } else if (opts.files?.length) {
    await saveAttachmentsToQuote({
      quote: { ...opts.quote, deal_ref: dealRef },
      files: opts.files,
      uploadedBy: opts.uploadedBy,
    })
  }

  const description = formatSupplierExpenseDescription(opts.vendor, dealRef)
  const extraNotes = String(opts.notes || '')
    .split(/\n/)
    .map((l) => l.trim())
    .filter((l) => l && !/^payment to\b/i.test(l))
    .join('\n')
  const notes = extraNotes ? `${description}\n${extraNotes}` : description

  const { expenseId, usedLegacyColumns } = await upsertSupplierInvoiceExpense({
    expenseId: opts.expenseId,
    quote: { ...opts.quote, deal_ref: dealRef },
    vendor: opts.vendor,
    date: opts.date,
    category: opts.category || 'Uniforms / Cost of goods',
    amount: opts.amount,
    amount_ex_vat: opts.amount_ex_vat,
    vat_amount: opts.vat_amount,
    payment_method: opts.payment_method,
    references_text: dealRef,
    notes,
    supplier_invoice_no: opts.supplier_invoice_no || '',
  })

  if (link?.url.trim()) {
    await saveAttachmentsToExpense({
      expenseId,
      files: [{ name: link.title || 'Supplier invoice', dataUrl: link.url.trim() }],
      uploadedBy: opts.uploadedBy,
    })
  }

  try {
    const trnMatch = String(opts.notes || '').match(/Supplier TRN\s+(\d{9,15})/i)
    await ensureVendor({
      company_name: opts.vendor,
      trn: trnMatch?.[1] || '',
    })
  } catch {
    /* vendor registry optional until SQL upgrade */
  }

  let shares = null
  try {
    shares = await syncQuoteSupplierCostFromExpense({
      quote: { ...opts.quote, deal_ref: dealRef },
      exclusiveCost: opts.amount_ex_vat,
      vatRate: opts.vatRate,
      updatedBy: opts.uploadedBy,
    })
  } catch {
    /* GP sync is best-effort */
  }

  const profit = supplierInvoiceProfit({
    quoteAmount: Number(opts.quote.amount) || 0,
    quoteOffsetVat: Boolean(opts.quote.offset_vat),
    expenseExclusive: opts.amount_ex_vat,
    expenseVat: opts.vat_amount,
    vatRate: opts.vatRate,
  })

  return { expenseId, quoteRef: dealRef, dealRef, usedLegacyColumns, profit, shares }
}

export function expensePartsOrForm(
  row: Pick<Expense, 'amount' | 'amount_ex_vat' | 'vat_amount'>,
  vatRate = VAT_RATE,
) {
  return expenseVatParts(row as Expense, vatRate)
}
