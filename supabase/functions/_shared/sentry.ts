/**
 * Minimal Sentry sender (no SDK, no new dependency). Off unless a DSN is
 * set (VITE_SENTRY_DSN for the app, SENTRY_DSN for Edge Functions): Sentry is
 * a paid service and Alfred decides whether to use it.
 * Everything sent is scrubbed first. Same file shape in
 * supabase/functions/_shared/sentry.ts.
 */
import { scrubText, scrubValue } from './scrub.ts'

export type SentryDsn = { host: string; projectId: string; publicKey: string; envelopeUrl: string }

/** https://<key>@<host>/<project id> → parts, or null when blank or malformed. */
export function parseDsn(dsn: string | undefined | null): SentryDsn | null {
  const raw = (dsn || '').trim()
  if (!raw) return null
  try {
    const u = new URL(raw)
    const projectId = u.pathname.replace(/^\/+|\/+$/g, '')
    if (u.protocol !== 'https:' || !u.username || !/^\d+$/.test(projectId)) return null
    return {
      host: u.host,
      projectId,
      publicKey: u.username,
      envelopeUrl: `https://${u.host}/api/${projectId}/envelope/`,
    }
  } catch {
    return null
  }
}

export type SentryEventInput = {
  message: string
  detail?: string
  level?: 'error' | 'warning' | 'info'
  environment?: string
  release?: string
  tags?: Record<string, string>
  extra?: Record<string, unknown>
  /** ISO time; tests pass a fixed one. */
  timestamp?: string
  eventId?: string
}

function randomId(): string {
  const b = new Uint8Array(16)
  crypto.getRandomValues(b)
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
}

/** Sentry envelope: header line, item header line, event JSON. Scrubbed. */
export function buildEnvelope(dsn: SentryDsn, input: SentryEventInput): string {
  const eventId = input.eventId || randomId()
  const timestamp = input.timestamp || new Date().toISOString()
  const event = {
    event_id: eventId,
    timestamp,
    platform: 'javascript',
    level: input.level || 'error',
    environment: input.environment || 'production',
    release: input.release || undefined,
    message: { formatted: scrubText(input.message).slice(0, 1000) },
    tags: input.tags,
    extra: scrubValue({ detail: (input.detail || '').slice(0, 4000), ...(input.extra || {}) }),
  }
  const body = JSON.stringify(event)
  return [
    JSON.stringify({ event_id: eventId, sent_at: timestamp, dsn: `https://${dsn.publicKey}@${dsn.host}/${dsn.projectId}` }),
    JSON.stringify({ type: 'event', content_type: 'application/json', length: new TextEncoder().encode(body).length }),
    body,
  ].join('\n')
}

/** Fire and forget. Never throws. Returns whether a send was attempted. */
export async function sendToSentry(
  dsnRaw: string | undefined | null,
  input: SentryEventInput,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const dsn = parseDsn(dsnRaw)
  if (!dsn) return false
  try {
    const res = await fetchImpl(dsn.envelopeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-sentry-envelope',
        'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${dsn.publicKey}, sentry_client=highmast-min/1`,
      },
      body: buildEnvelope(dsn, input),
      keepalive: true,
    })
    await res.body?.cancel()
  } catch {
    // Monitoring must never become a second failure.
  }
  return true
}
