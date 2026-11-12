/**
 * Bulk-file quotations and invoices into each client's Google Drive folder.
 * Builds a printable HTML archive from the stored data (same pattern as Zoho
 * email filing). Skips docs already linked on customer_documents.
 */

import { logActivity } from './activity'
import { companiesMatch } from './customerFiles'
import { db } from './db'
import { displayDocumentReference } from './documents'
import { errorMessage, isMissingRelationError } from './errors'
import { ensureClientDriveFolder, uploadToClientDrive } from './googleDrive'
import { formatMoneyAmount } from './currency'
import { loadCustomerDocuments, saveCustomerDriveLink } from './customerFiles'
import { calcTotals, loadLineItems, toDraftItems } from './lineItems'
import type { CrmEntry, CustomerDocument, CustomerDocumentCategory, Invoice, LineItem, Quotation } from './types'

export type FileDocKind = 'quotation' | 'invoice'

export type FileDocResult = {
  kind: FileDocKind
  id: string
  ref: string
  company: string
  status: 'filed' | 'skipped' | 'error'
  detail: string
  driveUrl?: string
}

export type FileDocsSummary = {
  scanned: number
  filed: number
  skipped: number
  errors: number
  results: FileDocResult[]
}

export type FileDocsProgress = {
  done: number
  total: number
  current: string
}

function escapeHtml(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function sanitizeFilename(name: string): string {
  return (
    name
      .replace(/[\\/:*?"<>|]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120) || 'document'
  )
}

function money(amount: number, currency = 'AED'): string {
  try {
    return formatMoneyAmount(amount, currency)
  } catch {
    return `${currency} ${Number(amount || 0).toFixed(2)}`
  }
}

export function isDocAlreadyFiled(
  docs: CustomerDocument[],
  opts: { category: CustomerDocumentCategory; relatedRef: string },
): boolean {
  const ref = opts.relatedRef.trim()
  if (!ref) return false
  const signed: CustomerDocumentCategory =
    opts.category === 'quotation' ? 'signed_quotation' : opts.category === 'invoice' ? 'signed_invoice' : opts.category
  return docs.some(
    (d) =>
      (d.category === opts.category || d.category === signed) &&
      (d.related_ref === ref || d.title.includes(ref)),
  )
}

export function buildDocHtmlArchive(opts: {
  kind: FileDocKind
  title: string
  ref: string
  company: string
  date: string
  status: string
  description: string
  currency: string
  contactName?: string
  contactEmail?: string
  contactPhone?: string
  paymentStatus?: string
  notes?: string
  lines: Pick<LineItem, 'line_no' | 'description' | 'qty' | 'unit_price' | 'amount' | 'vat_amount' | 'line_total' | 'remarks'>[]
  subtotal: number
  discount: number
  vat: number
  total: number
}): string {
  const rows =
    opts.lines.length > 0
      ? opts.lines
          .map(
            (l) => `<tr>
  <td>${l.line_no}</td>
  <td>${escapeHtml(l.description)}${l.remarks ? `<div class="muted">${escapeHtml(l.remarks)}</div>` : ''}</td>
  <td class="num">${Number(l.qty || 0)}</td>
  <td class="num">${escapeHtml(money(l.unit_price, opts.currency))}</td>
  <td class="num">${escapeHtml(money(l.amount, opts.currency))}</td>
  <td class="num">${escapeHtml(money(l.vat_amount, opts.currency))}</td>
  <td class="num">${escapeHtml(money(l.line_total, opts.currency))}</td>
</tr>`,
          )
          .join('\n')
      : `<tr><td colspan="7" class="muted">No line items — document total ${escapeHtml(money(opts.total, opts.currency))}</td></tr>`

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>${escapeHtml(opts.title)} ${escapeHtml(opts.ref)}</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 900px; margin: 24px auto; color: #111; padding: 0 16px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .sub { color: #555; font-size: 13px; margin-bottom: 16px; }
  .meta { background: #f4f4f5; padding: 12px 14px; border-radius: 8px; font-size: 13px; line-height: 1.55; margin-bottom: 18px; }
  .meta strong { display: inline-block; min-width: 110px; color: #555; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { border-bottom: 1px solid #e4e4e7; padding: 8px 6px; text-align: left; vertical-align: top; }
  th { color: #555; font-weight: 600; }
  .num { text-align: right; white-space: nowrap; }
  .muted { color: #71717a; font-size: 12px; }
  .totals { margin-top: 16px; margin-left: auto; width: 280px; font-size: 13px; }
  .totals div { display: flex; justify-content: space-between; padding: 4px 0; }
  .totals .grand { font-weight: 700; border-top: 1px solid #111; margin-top: 6px; padding-top: 8px; }
  .foot { margin-top: 28px; font-size: 11px; color: #71717a; }
</style>
</head>
<body>
  <h1>${escapeHtml(opts.title)}</h1>
  <div class="sub">${escapeHtml(opts.ref)} · filed from RR Central</div>
  <div class="meta">
    <div><strong>Client</strong> ${escapeHtml(opts.company)}</div>
    <div><strong>Date</strong> ${escapeHtml(opts.date || '—')}</div>
    <div><strong>Status</strong> ${escapeHtml(opts.status || '—')}</div>
    ${opts.paymentStatus ? `<div><strong>Payment</strong> ${escapeHtml(opts.paymentStatus)}</div>` : ''}
    ${opts.contactName ? `<div><strong>Contact</strong> ${escapeHtml(opts.contactName)}</div>` : ''}
    ${opts.contactEmail ? `<div><strong>Email</strong> ${escapeHtml(opts.contactEmail)}</div>` : ''}
    ${opts.contactPhone ? `<div><strong>Phone</strong> ${escapeHtml(opts.contactPhone)}</div>` : ''}
    ${opts.description ? `<div><strong>Description</strong> ${escapeHtml(opts.description)}</div>` : ''}
    ${opts.notes ? `<div><strong>Notes</strong> ${escapeHtml(opts.notes)}</div>` : ''}
  </div>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Description</th>
        <th class="num">Qty</th>
        <th class="num">Unit</th>
        <th class="num">Amount</th>
        <th class="num">VAT</th>
        <th class="num">Total</th>
      </tr>
    </thead>
    <tbody>
${rows}
    </tbody>
  </table>
  <div class="totals">
    <div><span>Subtotal</span><span>${escapeHtml(money(opts.subtotal, opts.currency))}</span></div>
    ${opts.discount ? `<div><span>Discount</span><span>- ${escapeHtml(money(opts.discount, opts.currency))}</span></div>` : ''}
    <div><span>VAT</span><span>${escapeHtml(money(opts.vat, opts.currency))}</span></div>
    <div class="grand"><span>Total</span><span>${escapeHtml(money(opts.total, opts.currency))}</span></div>
  </div>
  <p class="foot">Generated by RR Central for Google Drive filing. Open the live document in RR Central for the branded letterhead PDF.</p>
</body>
</html>`
}

function findCrmForClient(client: string, crm: CrmEntry[]): CrmEntry | null {
  const name = client.trim()
  if (!name) return null
  const exact = crm.find((c) => c.company_name.trim().toLowerCase() === name.toLowerCase())
  if (exact) return exact
  return crm.find((c) => companiesMatch(c.company_name, name)) || null
}

async function loadAllDocs(): Promise<{ quotations: Quotation[]; invoices: Invoice[]; crm: CrmEntry[] }> {
  const [q, i, c] = await Promise.all([
    db.from('quotations').select('*').order('created_at', { ascending: false }),
    db.from('invoices').select('*').order('created_at', { ascending: false }),
    db.from('crm').select('*').order('company_name', { ascending: true }),
  ])
  if (q.error) throw q.error
  if (i.error) throw i.error
  if (c.error) throw c.error
  return {
    quotations: (q.data || []) as Quotation[],
    invoices: (i.data || []) as Invoice[],
    crm: (c.data || []) as CrmEntry[],
  }
}

function totalsFor(
  kind: FileDocKind,
  doc: Quotation | Invoice,
  lines: LineItem[],
): { subtotal: number; discount: number; vat: number; total: number } {
  if (lines.length) {
    const drafts = toDraftItems(lines)
    if (kind === 'quotation') {
      const q = doc as Quotation
      const t = calcTotals(drafts, undefined, {
        discountPercent: q.discount_percent,
        discountAmount: q.discount_amount,
        offsetVat: Boolean(q.offset_vat),
      })
      return { subtotal: t.subtotal, discount: t.discount, vat: t.vat, total: t.total }
    }
    const t = calcTotals(drafts)
    return { subtotal: t.subtotal, discount: t.discount, vat: t.vat, total: t.total }
  }
  const total = Number(doc.amount) || 0
  return { subtotal: total, discount: 0, vat: 0, total }
}

async function fileOne(opts: {
  kind: FileDocKind
  doc: Quotation | Invoice
  crm: CrmEntry[]
  uploadedBy: string
  docsByCompany: Map<string, CustomerDocument[]>
}): Promise<FileDocResult> {
  const { kind, doc, crm, uploadedBy } = opts
  const company = (doc.client || '').trim()
  const ref = displayDocumentReference({
    referenceNumber: doc.reference_number,
    fallbackId: doc.id,
    status: doc.status,
  })
  const category: CustomerDocumentCategory = kind === 'quotation' ? 'quotation' : 'invoice'

  if (!company) {
    return { kind, id: doc.id, ref, company: '', status: 'skipped', detail: 'No client name' }
  }

  const entry = findCrmForClient(company, crm)
  if (!entry) {
    return {
      kind,
      id: doc.id,
      ref,
      company,
      status: 'skipped',
      detail: 'No matching CRM company — add or rename in CRM first',
    }
  }

  let docs = opts.docsByCompany.get(entry.company_name)
  if (!docs) {
    try {
      docs = await loadCustomerDocuments(entry.company_name)
    } catch (e) {
      if (isMissingRelationError(e)) docs = []
      else throw e
    }
    opts.docsByCompany.set(entry.company_name, docs)
  }

  if (isDocAlreadyFiled(docs, { category, relatedRef: ref }) && ref !== 'DRAFT') {
    return { kind, id: doc.id, ref, company: entry.company_name, status: 'skipped', detail: 'Already filed' }
  }
  // Drafts: skip duplicates by id in related_ref / notes
  if (ref === 'DRAFT' && docs.some((d) => d.category === category && d.notes.includes(doc.id))) {
    return { kind, id: doc.id, ref, company: entry.company_name, status: 'skipped', detail: 'Already filed' }
  }

  try {
    await ensureClientDriveFolder(entry.id)
    const lines = await loadLineItems(kind === 'quotation' ? 'quotation' : 'invoice', doc.reference_number || doc.id)
    const currency =
      (kind === 'quotation'
        ? (doc as Quotation).currency || (doc as Quotation).quotation_currency
        : (doc as Invoice).currency) || 'AED'
    const totals = totalsFor(kind, doc, lines)
    const q = kind === 'quotation' ? (doc as Quotation) : null
    const inv = kind === 'invoice' ? (doc as Invoice) : null
    const html = buildDocHtmlArchive({
      kind,
      title: kind === 'quotation' ? 'Quotation' : 'Invoice',
      ref,
      company: entry.company_name,
      date: String(doc.date || '').slice(0, 10),
      status: doc.status || '',
      description: doc.description || '',
      currency,
      contactName: q?.contact_name,
      contactEmail: q?.contact_email,
      contactPhone: q?.contact_phone,
      paymentStatus: inv ? `${inv.payment_status || ''}${inv.payment_terms ? ` · ${inv.payment_terms}` : ''}` : undefined,
      notes: inv?.notes || '',
      lines,
      ...totals,
    })

    const filename = `${kind === 'quotation' ? 'Quote' : 'Invoice'}-${sanitizeFilename(ref === 'DRAFT' ? doc.id.slice(0, 8) : ref)}.html`
    const uploaded = await uploadToClientDrive({
      crmId: entry.id,
      filename,
      content: html,
      contentType: 'text/html;charset=utf-8',
    })

    const relatedRef = ref === 'DRAFT' ? `draft:${doc.id}` : ref
    await saveCustomerDriveLink({
      company: entry.company_name,
      crmId: entry.id,
      category,
      title: `${kind === 'quotation' ? 'Quotation' : 'Invoice'} ${ref}`,
      driveUrl: uploaded.url,
      relatedRef,
      notes: `Bulk filed from RR Central · doc_id=${doc.id}`,
      uploadedBy,
    })

    await logActivity(
      'file_doc_drive',
      'customer_document',
      entry.company_name,
      `${kind} ${ref}`,
      uploadedBy,
      entry.id,
    )

    docs.push({
      id: `temp-${doc.id}`,
      company_name: entry.company_name,
      crm_id: entry.id,
      category,
      title: `${kind} ${ref}`,
      file_name: filename,
      drive_url: uploaded.url,
      related_ref: relatedRef,
      notes: `doc_id=${doc.id}`,
      storage_provider: 'google_drive',
      uploaded_by: uploadedBy,
      uploaded_at: new Date().toISOString(),
    })

    return {
      kind,
      id: doc.id,
      ref,
      company: entry.company_name,
      status: 'filed',
      detail: 'Filed to Google Drive',
      driveUrl: uploaded.url,
    }
  } catch (e) {
    return {
      kind,
      id: doc.id,
      ref,
      company: entry.company_name,
      status: 'error',
      detail: errorMessage(e, 'Could not file to Google Drive'),
    }
  }
}

/**
 * Push every quotation and invoice into the matching CRM client's Drive folder.
 * Call from Settings while Drive is connected. Reports progress via onProgress.
 */
export async function fileQuotesAndInvoicesToDrive(opts: {
  uploadedBy: string
  onProgress?: (p: FileDocsProgress) => void
}): Promise<FileDocsSummary> {
  const { quotations, invoices, crm } = await loadAllDocs()
  const queue: { kind: FileDocKind; doc: Quotation | Invoice }[] = [
    ...quotations.map((doc) => ({ kind: 'quotation' as const, doc })),
    ...invoices.map((doc) => ({ kind: 'invoice' as const, doc })),
  ]

  const docsByCompany = new Map<string, CustomerDocument[]>()
  const results: FileDocResult[] = []
  let filed = 0
  let skipped = 0
  let errors = 0

  for (let i = 0; i < queue.length; i++) {
    const item = queue[i]
    const label = `${item.kind} ${item.doc.reference_number || item.doc.client || item.doc.id}`
    opts.onProgress?.({ done: i, total: queue.length, current: label })
    const result = await fileOne({
      kind: item.kind,
      doc: item.doc,
      crm,
      uploadedBy: opts.uploadedBy,
      docsByCompany,
    })
    results.push(result)
    if (result.status === 'filed') filed++
    else if (result.status === 'skipped') skipped++
    else errors++
  }

  opts.onProgress?.({ done: queue.length, total: queue.length, current: 'Done' })

  return {
    scanned: queue.length,
    filed,
    skipped,
    errors,
    results,
  }
}
