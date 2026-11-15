/**
 * Public API helpers (M11 deepen) — scopes, cursor pagination, signed webhooks.
 * Edge Function `public-api` mirrors these contracts.
 */

export const PUBLIC_API_READ_SCOPES = [
  'read:accounts',
  'read:invoices',
  'read:quotations',
] as const

export const PUBLIC_API_WRITE_SCOPES = ['write:accounts'] as const

export type PublicApiReadScope = (typeof PUBLIC_API_READ_SCOPES)[number]
export type PublicApiWriteScope = (typeof PUBLIC_API_WRITE_SCOPES)[number]

/** Default scopes for newly minted keys — reads only; writes are opt-in. */
export const DEFAULT_API_KEY_SCOPES: string[] = [
  'read:accounts',
  'read:invoices',
  'read:quotations',
]

export const ACCOUNT_TYPES = ['ai_crm_client', 'worship_church', 'ctrm_prospect'] as const
export type AccountType = (typeof ACCOUNT_TYPES)[number]

export type AccountWriteInput = {
  name?: string
  type?: string
  reference?: string
  status?: string
  industry?: string
  country?: string
  city?: string
  website?: string
  notes?: string
  source?: string
}

export type AccountWritePatch = {
  name: string
  type: AccountType
  reference: string
  status: string
  industry: string
  country: string
  city: string
  website: string
  notes: string
  source: string
}

export function hasApiScope(scopes: string[], need: string): boolean {
  if (scopes.includes('*')) return true
  return scopes.includes(need)
}

function trimStr(value: unknown, max = 500): string {
  return String(value ?? '')
    .trim()
    .slice(0, max)
}

/**
 * Validate POST/PATCH account body.
 * `partial` allows omitting name/type (PATCH); create requires name.
 */
export function parseAccountWrite(
  raw: unknown,
  opts: { partial: boolean },
): { ok: true; patch: Partial<AccountWritePatch> } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'body_must_be_object' }
  }
  const body = raw as AccountWriteInput
  const patch: Partial<AccountWritePatch> = {}

  if (body.name !== undefined || !opts.partial) {
    const name = trimStr(body.name, 200)
    if (!name) return { ok: false, error: 'name_required' }
    patch.name = name
  }
  if (body.type !== undefined || !opts.partial) {
    const type = trimStr(body.type || 'ai_crm_client', 40)
    if (!ACCOUNT_TYPES.includes(type as AccountType)) {
      return { ok: false, error: 'invalid_type' }
    }
    patch.type = type as AccountType
  }
  if (body.reference !== undefined) patch.reference = trimStr(body.reference, 80)
  if (body.status !== undefined) patch.status = trimStr(body.status, 40) || 'active'
  if (body.industry !== undefined) patch.industry = trimStr(body.industry, 120)
  if (body.country !== undefined) patch.country = trimStr(body.country, 80)
  if (body.city !== undefined) patch.city = trimStr(body.city, 80)
  if (body.website !== undefined) patch.website = trimStr(body.website, 200)
  if (body.notes !== undefined) patch.notes = trimStr(body.notes, 2000)
  if (body.source !== undefined) patch.source = trimStr(body.source, 80)

  if (opts.partial && Object.keys(patch).length === 0) {
    return { ok: false, error: 'empty_patch' }
  }
  return { ok: true, patch }
}

/** Endpoints due for a background retry pass. */
export function webhookDueForRetry(
  row: { active?: boolean; next_retry_at?: string | null; delivery_failures?: number },
  nowMs: number = Date.now(),
): boolean {
  if (row.active === false) return false
  if (!row.next_retry_at) return false
  const t = Date.parse(row.next_retry_at)
  if (Number.isNaN(t)) return false
  return t <= nowMs
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
