/**
 * Public API helpers (M11 deepen) — scopes, cursor pagination, signed webhooks.
 * Edge Function `public-api` mirrors these contracts.
 */

export const PUBLIC_API_READ_SCOPES = [
  'read:accounts',
  'read:invoices',
  'read:quotations',
] as const

export type PublicApiReadScope = (typeof PUBLIC_API_READ_SCOPES)[number]

export const DEFAULT_API_KEY_SCOPES: string[] = [
  'read:accounts',
  'read:invoices',
  'read:quotations',
]

export function hasApiScope(scopes: string[], need: string): boolean {
  if (scopes.includes('*')) return true
  return scopes.includes(need)
}

export type CursorPage = {
  limit: number
  /** Opaque cursor = last seen id (UUID). */
  cursor: string | null
}

/** Parse `?limit=` (1–100, default 50) and `?cursor=` from a query map. */
export function parseCursorPage(params: URLSearchParams | Record<string, string | null | undefined>): CursorPage {
  const get = (k: string) =>
    params instanceof URLSearchParams ? params.get(k) : (params[k] ?? null)
  const rawLimit = Number(get('limit') || 50)
  const limit = Number.isFinite(rawLimit) ? Math.min(100, Math.max(1, Math.floor(rawLimit))) : 50
  const cursorRaw = String(get('cursor') || '').trim()
  const cursor = cursorRaw || null
  return { limit, cursor }
}

/** Encode next-page cursor from the last row id when a full page was returned. */
export function nextCursorFromPage<T extends { id: string }>(rows: T[], limit: number): string | null {
  if (rows.length < limit || !rows.length) return null
  return rows[rows.length - 1]?.id || null
}

/** Retry delays (ms) for outbound webhook delivery — attempt 1 is immediate. */
export function webhookRetryDelayMs(attempt: number): number {
  if (attempt <= 1) return 0
  if (attempt === 2) return 400
  if (attempt === 3) return 1200
  return 3000
}

export function shouldRetryWebhookStatus(httpStatus: number | null, networkError: boolean): boolean {
  if (networkError) return true
  if (httpStatus == null) return true
  return httpStatus >= 500 || httpStatus === 429
}

/** HMAC-SHA256 hex of `timestamp.body` (Stripe-style signing string). */
export async function signWebhookBody(
  secret: string,
  body: string,
  timestampSec: number,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const payload = `${timestampSec}.${body}`
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function webhookSignatureHeader(timestampSec: number, hexDigest: string): string {
  return `t=${timestampSec},v1=${hexDigest}`
}

export async function buildSignedWebhookHeaders(
  secret: string,
  body: string,
  eventType: string,
  nowMs: number = Date.now(),
): Promise<Record<string, string>> {
  const ts = Math.floor(nowMs / 1000)
  const digest = await signWebhookBody(secret, body, ts)
  return {
    'Content-Type': 'application/json',
    'X-HighMast-Event': eventType,
    'X-HighMast-Timestamp': String(ts),
    'X-HighMast-Signature': webhookSignatureHeader(ts, digest),
  }
}

/**
 * POST with up to `maxAttempts` tries; retries on network errors / 5xx / 429.
 * Returns final status string suitable for `last_delivery_status`.
 */
export async function deliverWebhookWithRetries(input: {
  url: string
  body: string
  headers: Record<string, string>
  maxAttempts?: number
  sleep?: (ms: number) => Promise<void>
  fetchImpl?: typeof fetch
}): Promise<{ ok: boolean; status: string; attempts: number }> {
  const maxAttempts = Math.max(1, Math.min(input.maxAttempts ?? 3, 5))
  const sleep = input.sleep || ((ms: number) => new Promise((r) => setTimeout(r, ms)))
  const fetchImpl = input.fetchImpl || fetch
  let lastStatus = 'error'
  let ok = false

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const delay = webhookRetryDelayMs(attempt)
    if (delay > 0) await sleep(delay)
    try {
      const res = await fetchImpl(input.url, {
        method: 'POST',
        headers: input.headers,
        body: input.body,
      })
      lastStatus = `http_${res.status}`
      ok = res.ok
      if (ok || !shouldRetryWebhookStatus(res.status, false) || attempt === maxAttempts) {
        return { ok, status: lastStatus, attempts: attempt }
      }
    } catch (e) {
      lastStatus = e instanceof Error ? `error:${e.message.slice(0, 80)}` : 'error'
      ok = false
      if (!shouldRetryWebhookStatus(null, true) || attempt === maxAttempts) {
        return { ok, status: lastStatus, attempts: attempt }
      }
    }
  }
  return { ok, status: lastStatus, attempts: maxAttempts }
}
