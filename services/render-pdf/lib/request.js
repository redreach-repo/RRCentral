// Checks for the render request. Pure functions, tested in request.test.js.

export const DEFAULT_APP_URL = 'https://redreach-repo.github.io/RRCentral'
export const DEFAULT_SUPABASE_URL = 'https://pszjylxrpvlumldtptrr.supabase.co'

const KINDS = new Set(['quote', 'invoice', 'delivery-note'])
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const JWT_RE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/

/** { kind, id, token, apikey } from the highmast-mcp function, or an error message. */
export function parseRenderRequest(body) {
  if (!body || typeof body !== 'object') return { error: 'Send JSON: kind, id, token, apikey.' }
  const kind = String(body.kind || '')
  const id = String(body.id || '')
  const token = String(body.token || '')
  const apikey = String(body.apikey || '')
  if (!KINDS.has(kind)) return { error: 'kind must be quote, invoice or delivery-note.' }
  if (!UUID_RE.test(id)) return { error: 'id must be a UUID.' }
  if (!JWT_RE.test(token) || token.length > 4096) return { error: 'token is missing.' }
  if (!apikey || apikey.length > 4096) return { error: 'apikey is missing.' }
  return { kind, id, token, apikey }
}

/** The app page that draws the document and runs Download PDF. The token stays in the #hash (never sent to a server). */
export function renderPageUrl(appUrl, kind, id, token) {
  const base = String(appUrl || DEFAULT_APP_URL).replace(/\/+$/, '')
  return `${base}/render-pdf/${kind}/${id}#t=${encodeURIComponent(token)}`
}

/** Does the database confirm this token is a live render login for exactly this document? */
export function renderCheckMatches(check, kind, id) {
  return Boolean(check && check.ok === true && String(check.document || '').toLowerCase() === `${kind}:${id}`.toLowerCase())
}
