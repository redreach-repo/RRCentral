import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import { addDays, format, parseISO, startOfDay } from 'date-fns'

/** ISO A4 — always use these for customer PDFs (never US Letter). */
export const A4_WIDTH_MM = 210
export const A4_HEIGHT_MM = 297

/** CSS px per mm at 96dpi (browser default). */
const PX_PER_MM = 96 / 25.4

/** Soft floor for whitespace compression (never crush layout entirely). */
export const MIN_WHITESPACE_FACTOR = 0.28

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

/** Pixel height of one A4 page at 96dpi CSS pixels. */
export function a4HeightCssPx(): number {
  return Math.round(A4_HEIGHT_MM * PX_PER_MM)
}

export function a4WidthCssPx(): number {
  return Math.round(A4_WIDTH_MM * PX_PER_MM)
}

type SpacingSnap = {
  el: HTMLElement
  mt: number
  mb: number
  pt: number
  pb: number
  gap: number
  rowGap: number
}

/** Snapshot vertical spacing so we can re-apply compression factors without compounding. */
export function snapshotVerticalSpacing(root: HTMLElement): SpacingSnap[] {
  const view = root.ownerDocument.defaultView
  if (!view) return []
  const nodes: HTMLElement[] = [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))]
  return nodes.map((el) => {
    const c = view.getComputedStyle(el)
    return {
      el,
      mt: parseFloat(c.marginTop) || 0,
      mb: parseFloat(c.marginBottom) || 0,
      pt: parseFloat(c.paddingTop) || 0,
      pb: parseFloat(c.paddingBottom) || 0,
      gap: parseFloat(c.gap) || 0,
      rowGap: parseFloat(c.rowGap) || 0,
    }
  })
}

/**
 * Shrink vertical margins / paddings / gaps by `factor` (1 = unchanged).
 * Large spacer blocks (signature gaps, section margins) compress faster than
 * small paddings. Does not change font-size or line-height.
 */
export function applyVerticalSpacingFactor(snaps: SpacingSnap[], factor: number): void {
  const f = Math.max(MIN_WHITESPACE_FACTOR, Math.min(1, factor))
  const scale = (px: number) => {
    if (px <= 0) return 0
    // Big empty bands (e.g. signature margin-top: 48–56) shrink harder.
    const boost = px >= 28 ? f * f : f
    return Math.max(px > 0 ? 1 : 0, px * boost)
  }
  for (const s of snaps) {
    s.el.style.marginTop = `${scale(s.mt)}px`
    s.el.style.marginBottom = `${scale(s.mb)}px`
    s.el.style.paddingTop = `${scale(s.pt)}px`
    s.el.style.paddingBottom = `${scale(s.pb)}px`
    if (s.gap > 0) s.el.style.gap = `${scale(s.gap)}px`
    if (s.rowGap > 0) s.el.style.rowGap = `${scale(s.rowGap)}px`
  }
}

/**
 * Compress blank vertical space on a cloned letterhead so content prefers one A4.
 * Font sizes are left untouched. Short docs keep a full A4 letterhead frame.
 */
export function fitCloneToA4ByCompressingWhitespace(cloned: HTMLElement): void {
  const a4H = a4HeightCssPx()
  cloned.style.height = 'auto'
  cloned.style.maxHeight = 'none'
  cloned.style.minHeight = '0'

  const footer =
    cloned.querySelector<HTMLElement>('[data-pdf-footer]') ||
    (cloned.lastElementChild instanceof HTMLElement ? cloned.lastElementChild : null)

  // Measure natural content height (no forced A4 floor).
  if (footer) footer.style.marginTop = '16px'
  const snaps = snapshotVerticalSpacing(cloned)
  if (!snaps.length) return
  applyVerticalSpacingFactor(snaps, 1)

  if (cloned.scrollHeight <= a4H + 2) {
    // Already fits — restore full-page letterhead (footer pinned to bottom).
    cloned.style.minHeight = `${a4H}px`
    if (footer) footer.style.marginTop = 'auto'
    return
  }

  // Binary-search the largest factor that still fits on one A4.
  let lo = MIN_WHITESPACE_FACTOR
  let hi = 1
  let best = MIN_WHITESPACE_FACTOR
  for (let i = 0; i < 10; i++) {
    const mid = (lo + hi) / 2
    applyVerticalSpacingFactor(snaps, mid)
    if (cloned.scrollHeight <= a4H + 2) {
      best = mid
      lo = mid
    } else {
      hi = mid
    }
  }
  applyVerticalSpacingFactor(snaps, best)

  // If compression got us onto one page, pin to exact A4 letterhead height.
  if (cloned.scrollHeight <= a4H + 2) {
    cloned.style.minHeight = `${a4H}px`
    if (footer) footer.style.marginTop = 'auto'
  }
}

/** Split a canvas into equal-height vertical slices (last slice may be shorter). */
export function splitCanvasVertically(canvas: HTMLCanvasElement, parts: number): HTMLCanvasElement[] {
  const n = Math.max(1, Math.floor(parts))
  if (n === 1 || canvas.height <= 1) return [canvas]

  const sliceH = Math.ceil(canvas.height / n)
  const doc = canvas.ownerDocument || (typeof document !== 'undefined' ? document : null)
  if (!doc) return [canvas]

  const out: HTMLCanvasElement[] = []
  for (let i = 0; i < n; i++) {
    const top = i * sliceH
    const h = Math.min(sliceH, canvas.height - top)
    if (h <= 0) break
    const c = doc.createElement('canvas')
    c.width = canvas.width
    c.height = h
    const ctx = c.getContext('2d')
    if (!ctx) continue
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, c.width, c.height)
    ctx.drawImage(canvas, 0, top, canvas.width, h, 0, 0, canvas.width, h)
    out.push(c)
  }
  return out.length ? out : [canvas]
}

/** How many uniform pages to use after whitespace fit (1, or 2 when still tall). */
export function planFitPageCount(heightAtFullWidthMm: number): 1 | 2 {
  if (heightAtFullWidthMm <= A4_HEIGHT_MM * 1.02) return 1
  return 2
}

function prepareCloneForA4Capture(cloned: HTMLElement) {
  const a4Wpx = a4WidthCssPx()
  const a4Hpx = a4HeightCssPx()

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

function addCanvasPage(
  pdf: jsPDF,
  canvas: HTMLCanvasElement,
  opts?: { fillPage?: boolean },
) {
  const img = canvas.toDataURL('image/jpeg', 0.96)
  const heightAtFullWidth = (canvas.height * A4_WIDTH_MM) / canvas.width
  if (opts?.fillPage || heightAtFullWidth >= A4_HEIGHT_MM * 0.94) {
    pdf.addImage(img, 'JPEG', 0, 0, A4_WIDTH_MM, A4_HEIGHT_MM, undefined, 'FAST')
  } else {
    pdf.addImage(img, 'JPEG', 0, 0, A4_WIDTH_MM, heightAtFullWidth, undefined, 'FAST')
  }
}

export async function elementToPdfBlob(
  element: HTMLElement,
  opts?: { filenameHint?: string; fitToPage?: boolean },
): Promise<{ blob: Blob; filename: string; dataUrl: string }> {
  // Default ON — invoices/quotes should prefer one A4 unless explicitly disabled.
  const fitToPage = opts?.fitToPage !== false

  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff',
    logging: false,
    // Style the clone — never shrink the live preview, never clip rails/totals.
    onclone(_doc, cloned) {
      prepareCloneForA4Capture(cloned)
      if (fitToPage) {
        fitCloneToA4ByCompressingWhitespace(cloned)
      }
    },
  })

  // Explicit A4 size in mm — do not rely on named 'a4' (avoids Letter surprises).
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [A4_WIDTH_MM, A4_HEIGHT_MM],
    compress: true,
  })

  const heightAtFullWidth = (canvas.width > 0 ? (canvas.height * A4_WIDTH_MM) / canvas.width : 0)

  if (fitToPage) {
    const pages = planFitPageCount(heightAtFullWidth)
    if (pages === 1) {
      addCanvasPage(pdf, canvas, { fillPage: true })
    } else {
      const slices = splitCanvasVertically(canvas, 2)
      const halfMm = (slices[0].height * A4_WIDTH_MM) / slices[0].width
      if (halfMm <= A4_HEIGHT_MM * 1.06) {
        slices.forEach((slice, index) => {
          if (index > 0) pdf.addPage([A4_WIDTH_MM, A4_HEIGHT_MM], 'portrait')
          addCanvasPage(pdf, slice)
        })
      } else {
        // Extreme length: fall back to standard A4 window pagination.
        const img = canvas.toDataURL('image/jpeg', 0.96)
        const plan = planA4ImagePlacement(canvas.width, canvas.height)
        plan.placements.forEach((p, index) => {
          if (index > 0) pdf.addPage([A4_WIDTH_MM, A4_HEIGHT_MM], 'portrait')
          if (p.fillPage) {
            pdf.addImage(img, 'JPEG', 0, 0, A4_WIDTH_MM, A4_HEIGHT_MM, undefined, 'FAST')
          } else {
            pdf.addImage(img, 'JPEG', 0, p.y, p.width, p.height, undefined, 'FAST')
          }
        })
      }
    }
  } else {
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
