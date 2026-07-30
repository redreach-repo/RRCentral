import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import { addDays, format, parseISO, startOfDay } from 'date-fns'

/** Internal draft ids look like Q-1785391827656 — never show these on customer PDFs. */
export function isInternalDraftId(value: string | null | undefined): boolean {
  return /^Q-\d{10,}$/i.test(String(value || '').trim())
}

/** Customer-facing reference: finalized number, or "DRAFT". */
export function displayDocumentReference(opts: {
  referenceNumber?: string | null
  fallbackId?: string | null
  status?: string | null
  draftLabel?: string
}): string {
  const ref = String(opts.referenceNumber || '').trim()
  if (ref && !isInternalDraftId(ref) && !/^INV-DRAFT-/i.test(ref)) return ref
  const status = String(opts.status || '').toLowerCase()
  if (status === 'draft' || !ref || isInternalDraftId(opts.fallbackId) || isInternalDraftId(ref)) {
    return opts.draftLabel || 'DRAFT'
  }
  return ref || opts.draftLabel || 'DRAFT'
}

export function quoteValidUntil(
  quoteDate: string | null | undefined,
  validityDays: number,
): string | null {
  if (!quoteDate) return null
  const days = Number(validityDays)
  if (!Number.isFinite(days) || days <= 0) return null
  try {
    const start = startOfDay(parseISO(String(quoteDate).slice(0, 10)))
    return format(addDays(start, days), 'yyyy-MM-dd')
  } catch {
    return null
  }
}

export function isQuotePastValidity(validUntil: string | null | undefined, today = new Date()): boolean {
  if (!validUntil) return false
  try {
    return startOfDay(parseISO(String(validUntil).slice(0, 10))) < startOfDay(today)
  } catch {
    return false
  }
}

export async function elementToPdfBlob(
  element: HTMLElement,
  opts?: { filenameHint?: string },
): Promise<{ blob: Blob; filename: string; dataUrl: string }> {
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff',
  })
  const img = canvas.toDataURL('image/jpeg', 0.95)
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const imgWidth = pageWidth
  const imgHeight = (canvas.height * imgWidth) / canvas.width
  let heightLeft = imgHeight
  let position = 0
  pdf.addImage(img, 'JPEG', 0, position, imgWidth, imgHeight)
  heightLeft -= pageHeight
  while (heightLeft > 0) {
    position = heightLeft - imgHeight
    pdf.addPage()
    pdf.addImage(img, 'JPEG', 0, position, imgWidth, imgHeight)
    heightLeft -= pageHeight
  }
  const filename = `${opts?.filenameHint || 'document'}.pdf`.replace(/\s+/g, '-')
  const blob = pdf.output('blob')
  const dataUrl = pdf.output('datauristring')
  return { blob, filename, dataUrl }
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
