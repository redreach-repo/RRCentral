/** Internal draft ids look like Q-1785391827656 — never show these on customer PDFs. */
export function isInternalDraftId(value: string | null | undefined): boolean {
  return /^Q-\d{10,}$/i.test(String(value || '').trim())
}

/** Temporary invoice / DN ids — never show these on customer PDFs. */
export function isTempDocumentRef(value: string | null | undefined): boolean {
  const ref = String(value || '').trim()
  return !ref || isInternalDraftId(ref) || /^INV-DRAFT-/i.test(ref) || /^DN-DRAFT-/i.test(ref)
}

/**
 * What an invoice is called. Until it has its RR reference (still INV-DRAFT-* or
 * blank) it is a Proforma Invoice; once "Save & assign ref" gives it the RR
 * number it is a Tax Invoice. The reference decides, not the status.
 */
export type InvoiceKind = 'proforma' | 'tax'

export function invoiceKind(referenceNumber: string | null | undefined): InvoiceKind {
  return isTempDocumentRef(referenceNumber) ? 'proforma' : 'tax'
}

/** Sheet heading, e.g. "TAX INVOICE" or "PROFORMA INVOICE". */
export function invoiceDocumentTitle(referenceNumber: string | null | undefined): string {
  return invoiceKind(referenceNumber) === 'tax' ? 'TAX INVOICE' : 'PROFORMA INVOICE'
}

/** Label for lists and messages, e.g. "Tax invoice" or "Proforma invoice". */
export function invoiceKindLabel(referenceNumber: string | null | undefined): string {
  return invoiceKind(referenceNumber) === 'tax' ? 'Tax invoice' : 'Proforma invoice'
}

/**
 * Whether the printed sheet carries the "DRAFT — reference not finalized" banner.
 * Never on invoices: without an RR reference it is a Proforma Invoice that goes
 * to the client as it is. Quotes and delivery notes keep it while they are drafts.
 */
export function printsDraftBanner(docType: string, isDraft: boolean): boolean {
  return docType !== 'invoice' && isDraft
}
