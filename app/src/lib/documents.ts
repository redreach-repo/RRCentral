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

/** Customer-facing reference: finalized number, or "DRAFT". */
export function displayDocumentReference(opts: {
  referenceNumber?: string | null
  fallbackId?: string | null
  status?: string | null
  draftLabel?: string
}): string {
  const ref = String(opts.referenceNumber || '').trim()
  if (ref && !isInternalDraftId(ref) && !/^INV-DRAFT-/i.test(ref) && !/^DN-DRAFT-/i.test(ref)) return ref
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

/**
 * How to place a captured bitmap onto A4 pages.
 * - Near-A4 captures fit on one page (full-bleed width).
 * - Tall captures paginate on A4 (never US Letter).
 */
export function planA4ImagePlacement(
  canvasWidth: number,
  canvasHeight: number,
): { pageWidth: number; pageHeight: number; placements: { y: number; width: number; height: number }[] } {
  const pageWidth = A4_WIDTH_MM
  const pageHeight = A4_HEIGHT_MM
  if (canvasWidth <= 0 || canvasHeight <= 0) {
    return { pageWidth, pageHeight, placements: [{ y: 0, width: pageWidth, height: pageHeight }] }
  }

  const heightAtFullWidth = (canvasHeight * pageWidth) / canvasWidth

  // Slight overshoot (borders/subpixels): squash onto one A4 page, full bleed.
  if (heightAtFullWidth <= pageHeight * 1.08) {
    return {
      pageWidth,
      pageHeight,
      placements: [{ y: 0, width: pageWidth, height: Math.min(heightAtFullWidth, pageHeight) }],
    }
  }

  // True multi-page: slice the image across A4 pages at full width.
  const placements: { y: number; width: number; height: number }[] = []
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

function applyA4SheetStyles(element: HTMLElement): () => void {
  const prev = {
    width: element.style.width,
    maxWidth: element.style.maxWidth,
    minWidth: element.style.minWidth,
    height: element.style.height,
    minHeight: element.style.minHeight,
    boxSizing: element.style.boxSizing,
  }
  const wPx = Math.round(A4_WIDTH_MM * PX_PER_MM)
  const hPx = Math.round(A4_HEIGHT_MM * PX_PER_MM)
  element.style.boxSizing = 'border-box'
  element.style.width = `${wPx}px`
  element.style.maxWidth = `${wPx}px`
  element.style.minWidth = `${wPx}px`
  // At least one A4 tall so the letterhead frame fills the page; allow growth for long docs.
  element.style.minHeight = `${hPx}px`
  element.style.height = ''
  return () => {
    element.style.width = prev.width
    element.style.maxWidth = prev.maxWidth
    element.style.minWidth = prev.minWidth
    element.style.height = prev.height
    element.style.minHeight = prev.minHeight
    element.style.boxSizing = prev.boxSizing
  }
}

export async function elementToPdfBlob(
  element: HTMLElement,
  opts?: { filenameHint?: string },
): Promise<{ blob: Blob; filename: string; dataUrl: string }> {
  const restore = applyA4SheetStyles(element)
  let canvas: HTMLCanvasElement
  try {
    // Force layout at A4 CSS pixels before capture.
    void element.offsetHeight
    canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
      width: element.offsetWidth,
      height: Math.max(element.offsetHeight, element.scrollHeight),
      windowWidth: element.offsetWidth,
      windowHeight: Math.max(element.offsetHeight, element.scrollHeight),
    })
  } finally {
    restore()
  }

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
    // First page near-A4: fill the page so letterhead rails stay edge-to-edge.
    if (plan.placements.length === 1) {
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
