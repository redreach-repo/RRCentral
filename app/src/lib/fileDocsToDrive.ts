/**
 * Bulk-file quotations and invoices into each client's Google Drive folder as PDFs.
 * Rebuilds from stored data + line items. Replaces earlier bulk HTML filings.
 */

import { jsPDF } from 'jspdf'
import { logActivity } from './activity'
import { companiesMatch, deleteCustomerDocument, loadCustomerDocuments, saveCustomerDriveLink } from './customerFiles'
import { formatMoneyAmount } from './currency'
import { db } from './db'
import { displayDocumentReference } from './documents'
import { errorMessage, isMissingRelationError } from './errors'
import { ensureClientDriveFolder, uploadToClientDrive } from './googleDrive'
import { calcTotals, loadLineItems, toDraftItems } from './lineItems'
import type { CrmEntry, CustomerDocument, CustomerDocumentCategory, Invoice, LineItem, Quotation } from './types'
import { PRODUCT } from './product'

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

type DocPdfInput = {
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
}

const INK: [number, number, number] = [20, 20, 20]
const MUTED: [number, number, number] = [100, 100, 100]
const BULK_NOTE = `Bulk filed PDF from ${PRODUCT.name}`

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

/** Earlier bulk HTML filings — remove the CRM link so we can file a PDF instead. */
export function findReplaceableBulkLinks(
  docs: CustomerDocument[],
  opts: { category: CustomerDocumentCategory; relatedRef: string; docId: string },
): CustomerDocument[] {
  const ref = opts.relatedRef.trim()
  return docs.filter((d) => {
    if (d.category !== opts.category) return false
    const sameRef = Boolean(ref) && (d.related_ref === ref || d.title.includes(ref) || d.related_ref === `draft:${opts.docId}`)
    const bulk = /bulk filed/i.test(d.notes || '') || /\.html$/i.test(d.file_name || '') || /\.html$/i.test(d.title || '')
    const byId = (d.notes || '').includes(opts.docId)
    return (sameRef || byId) && bulk
  })
}

/** Build a searchable A4 PDF of the quote/invoice data. */
export function buildDocPdfBytes(opts: DocPdfInput): Uint8Array {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true })
  const W = 210
  const H = 297
  const M = 16
  const bottom = H - 18
  let y = M

  const color = (c: [number, number, number]) => pdf.setTextColor(c[0], c[1], c[2])
  const room = (needed: number) => {
    if (y + needed <= bottom) return
    pdf.addPage('a4', 'portrait')
    y = M
  }
  const line = (label: string, value: string) => {
    if (!value) return
    room(6)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(9)
    color(MUTED)
    pdf.text(label, M, y)
    pdf.setFont('helvetica', 'normal')
    color(INK)
    const wrapped = pdf.splitTextToSize(value, W - 2 * M - 32) as string[]
    pdf.text(wrapped, M + 32, y)
    y += Math.max(5, wrapped.length * 4.2) + 1
  }

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(16)
  color(INK)
  pdf.text(opts.title, M, y)
  y += 7
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(10)
  color(MUTED)
  pdf.text(`${opts.ref} · ${PRODUCT.name}`, M, y)
  y += 8

  line('Client', opts.company)
  line('Date', opts.date || '—')
  line('Status', opts.status || '—')
  if (opts.paymentStatus) line('Payment', opts.paymentStatus)
  if (opts.contactName) line('Contact', opts.contactName)
  if (opts.contactEmail) line('Email', opts.contactEmail)
  if (opts.contactPhone) line('Phone', opts.contactPhone)
  if (opts.description) line('Description', opts.description)
  if (opts.notes) line('Notes', opts.notes)

  y += 4
  room(12)
  const cols = [
    { label: '#', x: M, w: 8 },
    { label: 'Description', x: M + 8, w: 72 },
    { label: 'Qty', x: M + 80, w: 14 },
    { label: 'Unit', x: M + 94, w: 24 },
    { label: 'Amount', x: M + 118, w: 24 },
    { label: 'VAT', x: M + 142, w: 22 },
    { label: 'Total', x: M + 164, w: 30 },
  ]
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(8)
  color(MUTED)
  for (const c of cols) pdf.text(c.label, c.x + (c.label === 'Description' || c.label === '#' ? 0 : c.w), y, {
    align: c.label === 'Description' || c.label === '#' ? 'left' : 'right',
  })
  y += 2
  pdf.setDrawColor(200)
  pdf.line(M, y, W - M, y)
  y += 5

  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(8.5)
  color(INK)

  if (!opts.lines.length) {
    room(6)
    pdf.text(`No line items — document total ${money(opts.total, opts.currency)}`, M, y)
    y += 6
  } else {
    for (const row of opts.lines) {
      const descLines = pdf.splitTextToSize(row.description || '—', cols[1].w) as string[]
      const rowH = Math.max(5, descLines.length * 4)
      room(rowH + 2)
      pdf.text(String(row.line_no || ''), cols[0].x, y)
      pdf.text(descLines, cols[1].x, y)
      pdf.text(String(Number(row.qty) || 0), cols[2].x + cols[2].w, y, { align: 'right' })
      pdf.text(money(row.unit_price, opts.currency), cols[3].x + cols[3].w, y, { align: 'right' })
      pdf.text(money(row.amount, opts.currency), cols[4].x + cols[4].w, y, { align: 'right' })
      pdf.text(money(row.vat_amount, opts.currency), cols[5].x + cols[5].w, y, { align: 'right' })
      pdf.text(money(row.line_total, opts.currency), cols[6].x + cols[6].w, y, { align: 'right' })
      y += rowH
      if (row.remarks) {
        pdf.setFontSize(7.5)
        color(MUTED)
        const rem = pdf.splitTextToSize(String(row.remarks), cols[1].w) as string[]
        room(rem.length * 3.5 + 1)
        pdf.text(rem, cols[1].x, y)
        y += rem.length * 3.5
        pdf.setFontSize(8.5)
        color(INK)
      }
      y += 1.5
    }
  }

  y += 4
  room(28)
  const tx = W - M
  const rowTotal = (label: string, value: string, bold = false) => {
    pdf.setFont('helvetica', bold ? 'bold' : 'normal')
    pdf.setFontSize(9)
    color(INK)
    pdf.text(label, tx - 55, y)
    pdf.text(value, tx, y, { align: 'right' })
    y += 5
  }
  rowTotal('Subtotal', money(opts.subtotal, opts.currency))
  if (opts.discount) rowTotal('Discount', `- ${money(opts.discount, opts.currency)}`)
  rowTotal('VAT', money(opts.vat, opts.currency))
  pdf.setDrawColor(40)
  pdf.line(tx - 55, y - 1, tx, y - 1)
  y += 2
  rowTotal('Total', money(opts.total, opts.currency), true)

  y = Math.max(y + 8, bottom - 6)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(7.5)
  color(MUTED)
  pdf.text(`Generated by ${PRODUCT.name} for Google Drive. Open the document in ${PRODUCT.name} for letterhead branding.`, M, y)

  const out = pdf.output('arraybuffer')
  return new Uint8Array(out)
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
  const relatedRef = ref === 'DRAFT' ? `draft:${doc.id}` : ref

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

  // Replace earlier bulk HTML (or any prior bulk file) with a PDF.
  const replaceable = findReplaceableBulkLinks(docs, { category, relatedRef, docId: doc.id })
  for (const old of replaceable) {
    if (!old.id.startsWith('temp-')) {
      try {
        await deleteCustomerDocument(old.id)
      } catch {
        // Continue; we still upload the PDF.
      }
    }
    docs = docs.filter((d) => d.id !== old.id)
  }
  opts.docsByCompany.set(entry.company_name, docs)

  // Keep real signed copies / manual links; only skip when a non-bulk PDF/link already exists.
  if (isDocAlreadyFiled(docs, { category, relatedRef }) && ref !== 'DRAFT') {
    return { kind, id: doc.id, ref, company: entry.company_name, status: 'skipped', detail: 'Already filed' }
  }
  if (ref === 'DRAFT' && docs.some((d) => d.category === category && d.notes.includes(doc.id) && !/bulk filed/i.test(d.notes))) {
    return { kind, id: doc.id, ref, company: entry.company_name, status: 'skipped', detail: 'Already filed' }
  }

  try {
    await ensureClientDriveFolder(entry.id)
    const lineRef =
      kind === 'quotation'
        ? (doc as Quotation).quote_id || doc.reference_number || doc.id
        : doc.reference_number || doc.id
    const lines = await loadLineItems(kind === 'quotation' ? 'Quote' : 'Invoice', lineRef)
    const currency =
      (kind === 'quotation'
        ? (doc as Quotation).currency || (doc as Quotation).quotation_currency
        : (doc as Invoice).currency) || 'AED'
    const totals = totalsFor(kind, doc, lines)
    const q = kind === 'quotation' ? (doc as Quotation) : null
    const inv = kind === 'invoice' ? (doc as Invoice) : null
    const bytes = buildDocPdfBytes({
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
      notes: inv?.notes || q?.notes || '',
      lines,
      ...totals,
    })

    const filename = `${kind === 'quotation' ? 'Quote' : 'Invoice'}-${sanitizeFilename(ref === 'DRAFT' ? doc.id.slice(0, 8) : ref)}.pdf`
    const uploaded = await uploadToClientDrive({
      crmId: entry.id,
      filename,
      content: bytes,
      contentType: 'application/pdf',
    })

    await saveCustomerDriveLink({
      company: entry.company_name,
      crmId: entry.id,
      category,
      title: `${kind === 'quotation' ? 'Quotation' : 'Invoice'} ${ref}`,
      driveUrl: uploaded.url,
      relatedRef,
      notes: `${BULK_NOTE} · doc_id=${doc.id}`,
      uploadedBy,
    })

    await logActivity(
      'file_doc_drive',
      'customer_document',
      entry.company_name,
      `${kind} ${ref} (PDF)`,
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
      notes: `${BULK_NOTE} · doc_id=${doc.id}`,
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
      detail: replaceable.length ? 'Replaced HTML with PDF' : 'Filed PDF to Google Drive',
      driveUrl: uploaded.url,
    }
  } catch (e) {
    return {
      kind,
      id: doc.id,
      ref,
      company: entry.company_name,
      status: 'error',
      detail: errorMessage(e, 'Could not file PDF to Google Drive'),
    }
  }
}

/**
 * Push every quotation and invoice into the matching CRM client's Drive folder as PDFs.
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
