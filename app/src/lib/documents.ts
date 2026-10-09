import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import { addDays, format, parseISO, startOfDay } from 'date-fns'

/** ISO A4 — always use these for customer PDFs (never US Letter). */
export const A4_WIDTH_MM = 210
export const A4_HEIGHT_MM = 297

/** CSS px per mm at 96dpi (browser default). */
const PX_PER_MM = 96 / 25.4

/** Internal draft ids look like Q-1785391827656 — never show these on customer PDFs. */
export function isInternalDraftId(value: string | null | undefined): boolean {
  return /^Q-\d{10,}$/i.test(String(value || '').trim())
}

/** Temporary invoice / DN ids — never show these on customer PDFs. */
export function isTempDocumentRef(value: string | null | undefined): boolean {
  const ref = String(value || '').trim()
  return !ref || isInternalDraftId(ref) || /^INV-DRAFT-/i.test(ref) || /^DN-DRAFT-/i.test(ref)
}

/** Customer-facing reference: finalized number, or "DRAFT". */
export function displayDocumentReference(opts: {
  referenceNumber?: string | null
  fallbackId?: string | null
  status?: string | null
  draftLabel?: string
}): string {
  const ref = String(opts.referenceNumber || '').trim()
  if (ref && !isTempDocumentRef(ref)) return ref
  // INV-DRAFT-* / DN-DRAFT-* / Q-* always display as DRAFT, even if status was marked Sent.
  if (isTempDocumentRef(ref) || isTempDocumentRef(opts.fallbackId)) {
    return opts.draftLabel || 'DRAFT'
  }
  const status = String(opts.status || '').toLowerCase()
  if (status === 'draft' || !ref) return opts.draftLabel || 'DRAFT'
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

export type A4Placement = {
  /** Image Y offset in mm (negative for page 2+) */
  y: number
  width: number
  height: number
  /** Stretch image to fill the whole A4 page (near-A4 single page). */
  fillPage?: boolean
}

/**
 * How to place a captured bitmap onto A4 pages.
 * - Near-A4 captures fit on one page (full-bleed width).
 * - Tall captures paginate on A4 (never US Letter).
 */
export function planA4ImagePlacement(
  canvasWidth: number,
  canvasHeight: number,
): { pageWidth: number; pageHeight: number; placements: A4Placement[] } {
  const pageWidth = A4_WIDTH_MM
  const pageHeight = A4_HEIGHT_MM
  if (canvasWidth <= 0 || canvasHeight <= 0) {
    return {
      pageWidth,
      pageHeight,
      placements: [{ y: 0, width: pageWidth, height: pageHeight, fillPage: true }],
    }
  }

  const heightAtFullWidth = (canvasHeight * pageWidth) / canvasWidth

  // Within ~A4 (+ small tolerance): one full-bleed page.
  if (heightAtFullWidth <= pageHeight * 1.08) {
    return {
      pageWidth,
      pageHeight,
      placements: [{ y: 0, width: pageWidth, height: Math.min(heightAtFullWidth, pageHeight), fillPage: true }],
    }
  }

  // True multi-page: slice the image across A4 pages at full width.
  const placements: A4Placement[] = []
  let heightLeft = heightAtFullWidth
  let position = 0
  placements.push({ y: position, width: pageWidth, height: heightAtFullWidth })
  heightLeft -= pageHeight
  while (heightLeft > 0.5) {
    position = heightLeft - heightAtFullWidth
    placements.push({ y: position, width: pageWidth, height: heightAtFullWidth })
    heightLeft -= pageHeight
  }
  return { pageWidth, pageHeight, placements }
}

function prepareCloneForA4Capture(cloned: HTMLElement) {
  const a4Wpx = Math.round(A4_WIDTH_MM * PX_PER_MM)
  const a4Hpx = Math.round(A4_HEIGHT_MM * PX_PER_MM)

  cloned.style.boxSizing = 'border-box'
  cloned.style.width = `${a4Wpx}px`
  cloned.style.maxWidth = `${a4Wpx}px`
  cloned.style.minWidth = `${a4Wpx}px`
  cloned.style.minHeight = `${a4Hpx}px`
  cloned.style.height = 'auto'
  cloned.style.overflow = 'visible'
  cloned.style.transform = 'none'
  cloned.style.zoom = '1'

  // Ancestors often clip (preview max-width / overflow). Open them on the clone only.
  let parent: HTMLElement | null = cloned.parentElement
  while (parent) {
    parent.style.overflow = 'visible'
    parent.style.maxWidth = 'none'
    parent.style.width = 'auto'
    parent.style.transform = 'none'
    parent = parent.parentElement
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
    logging: false,
    // Style the clone — never shrink the live preview, never clip rails/totals.
    onclone(_doc, cloned) {
      prepareCloneForA4Capture(cloned)
    },
  })

  // Explicit A4 size in mm — do not rely on named 'a4' (avoids Letter surprises).
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [A4_WIDTH_MM, A4_HEIGHT_MM],
    compress: true,
  })

  const img = canvas.toDataURL('image/jpeg', 0.96)
  const plan = planA4ImagePlacement(canvas.width, canvas.height)

  plan.placements.forEach((p, index) => {
    if (index > 0) pdf.addPage([A4_WIDTH_MM, A4_HEIGHT_MM], 'portrait')
    if (p.fillPage) {
      // Full-bleed A4 so letterhead rails sit on the paper edges.
      pdf.addImage(img, 'JPEG', 0, 0, A4_WIDTH_MM, A4_HEIGHT_MM, undefined, 'FAST')
    } else {
      pdf.addImage(img, 'JPEG', 0, p.y, p.width, p.height, undefined, 'FAST')
    }
  })

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
