/**
 * PDF render mode: the AI connector's renderer (services/render-pdf) opens
 * /render-pdf/<type>/<id>#t=<token> in a headless browser. The page draws the
 * document exactly like /document/<type>/<id> and runs the same Download PDF
 * code, then saves the file to the private "generated-pdfs" bucket.
 *
 * The token is a 2 minute login made by the highmast-mcp function for the AI
 * key's member, with the claim hm_pdf_render. The database lets that login read
 * only what the document page needs and write nothing but the PDF file
 * (20261326090000_generated_pdfs.sql). It never touches a person's own login.
 */

const STORAGE_KEY = 'hm_pdf_render_token'
const PATH_RE = /\/render-pdf\/(quote|invoice|delivery-note)\/[0-9a-f-]{36}\/?$/i
const TOKEN_RE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/

type Loc = { pathname: string; hash: string }

/** Is this address the render page? */
export function isPdfRenderPath(pathname: string): boolean {
  return PATH_RE.test(pathname)
}

/** The token in "#t=..." of a render address, or null. */
export function renderTokenFromHash(hash: string): string | null {
  const raw = new URLSearchParams(hash.replace(/^#/, '')).get('t') || ''
  return TOKEN_RE.test(raw) ? raw : null
}

let cached: string | null | undefined

/**
 * The render login for this tab, or null on every normal page. Read once from
 * the address (and kept for this tab only), then the token is wiped from the
 * address bar.
 */
export function pdfRenderToken(loc: Loc | null = typeof window === 'undefined' ? null : window.location): string | null {
  if (cached !== undefined) return cached
  if (!loc || !isPdfRenderPath(loc.pathname)) {
    cached = null
    return cached
  }
  let token = renderTokenFromHash(loc.hash)
  try {
    if (token) sessionStorage.setItem(STORAGE_KEY, token)
    else token = sessionStorage.getItem(STORAGE_KEY)
  } catch {
    /* private mode: keep it in memory only */
  }
  if (token && loc.hash && typeof window !== 'undefined') {
    window.history.replaceState(null, '', loc.pathname)
  }
  cached = token && TOKEN_RE.test(token) ? token : null
  return cached
}

/** For tests. */
export function resetPdfRenderTokenCache() {
  cached = undefined
}

/** What the renderer waits for: set once the PDF is saved (or failed). */
export type PdfRenderResult = { ok: true; path: string; size_bytes: number } | { ok: false; error: string }

declare global {
  interface Window {
    __HM_PDF_DONE?: PdfRenderResult
  }
}

export function reportPdfRender(result: PdfRenderResult) {
  if (typeof window !== 'undefined') window.__HM_PDF_DONE = result
}
