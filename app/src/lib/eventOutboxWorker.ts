/**
 * Pure helpers for the event_outbox consumer (Edge Function + unit tests).
 * Handlers are intentionally thin today: ack activity-mirrored events, retry
 * on failure, and dead-letter after max attempts. Domain-specific side effects
 * plug into `dispatchDomainEvent` later.
 */

export const OUTBOX_MAX_ATTEMPTS = 8
/** Cap backoff at one hour. */
export const OUTBOX_BACKOFF_CAP_MS = 60 * 60 * 1000

export type OutboxRow = {
  id: string
  event_type: string
  aggregate_type: string
  aggregate_id: string
  payload: Record<string, unknown>
  attempts: number
  status: string
}

export type DispatchResult =
  | { ok: true; detail?: string }
  | { ok: false; error: string; retryable?: boolean }

/** Exponential backoff from attempts (1 → 1m, 2 → 2m, …) capped at 1h. */
export function nextAvailableAt(attempts: number, now = new Date()): Date {
  const n = Math.max(1, Math.floor(attempts))
  const ms = Math.min(OUTBOX_BACKOFF_CAP_MS, 60_000 * 2 ** (n - 1))
  return new Date(now.getTime() + ms)
}

export function shouldDeadLetter(attempts: number, maxAttempts = OUTBOX_MAX_ATTEMPTS): boolean {
  return attempts >= maxAttempts
}

/**
 * Dispatch one domain event. Unknown / activity-mirror types ack successfully
 * so the queue drains; throw-like failures return ok:false for retry.
 */
export function dispatchDomainEvent(row: OutboxRow): DispatchResult {
  const type = (row.event_type || '').trim()
  if (!type) return { ok: false, error: 'blank event_type', retryable: false }

  // Reserved for future workers (digest nudges, webhooks, HubSpot, etc.).
  // Until then every well-formed activity mirror is acknowledged.
  switch (type) {
    case '__fail_test__':
      return { ok: false, error: 'forced failure', retryable: true }
    case '__poison_test__':
      return { ok: false, error: 'non-retryable poison', retryable: false }
    default:
      return {
        ok: true,
        detail: `acked ${type} on ${row.aggregate_type || 'aggregate'}`,
      }
  }
}

export type OutboxOutcome =
  | { action: 'done'; detail: string }
  | { action: 'retry'; availableAt: Date; error: string }
  | { action: 'failed'; error: string }

/** Apply dispatch result + attempt count into the next row state. */
export function outcomeFor(
  row: OutboxRow,
  result: DispatchResult,
  now = new Date(),
): OutboxOutcome {
  if (result.ok) {
    return { action: 'done', detail: result.detail || 'ok' }
  }
  const retryable = result.retryable !== false
  if (!retryable || shouldDeadLetter(row.attempts)) {
    return { action: 'failed', error: result.error }
  }
  return {
    action: 'retry',
    availableAt: nextAvailableAt(row.attempts, now),
    error: result.error,
  }
}
