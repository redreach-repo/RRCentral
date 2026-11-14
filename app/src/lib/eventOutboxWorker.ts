/**
 * Pure helpers for the event_outbox consumer (Edge Function + unit tests).
 * Classifies activity-mirrored events into domain side effects: HubSpot nudge,
 * digest attention signal, optional outbound webhook, then ack/retry/DLQ.
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

export type HandlerEffect = 'hubspot_nudge' | 'digest_signal' | 'webhook_emit'

export type HandlerPlan = {
  effects: HandlerEffect[]
  /** Human-readable summary for logs / last_error context */
  detail: string
}

/** CRM / sales / account activity that should dirty HubSpot. */
export const HUBSPOT_EVENT_TYPES = new Set([
  'create_crm',
  'update_crm',
  'call_crm',
  'call_logged',
  'snooze_followup',
  'clear_followup',
  'save_wanders_deal',
  'create',
  'finalize_quote',
  'revise_quote',
  'convert_invoice',
  'mark_paid',
  'save_invoice',
])

/** Aggregates that map to HubSpot companies / deals. */
export const HUBSPOT_AGGREGATES = new Set([
  'crm',
  'sales_deal',
  'account',
  'quotation',
  'invoice',
])

/** Money / follow-up events the morning digest should notice. */
export const DIGEST_EVENT_TYPES = new Set([
  'finalize_quote',
  'mark_paid',
  'pay_link',
  'convert_invoice',
  'snooze_followup',
  'clear_followup',
  'call_crm',
  'call_logged',
  'update_delivery_note',
])

/** Exponential backoff from attempts (1 → 1m, 2 → 2m, …) capped at 1h. */
export function nextAvailableAt(attempts: number, now = new Date()): Date {
  const n = Math.max(1, Math.floor(attempts))
  const ms = Math.min(OUTBOX_BACKOFF_CAP_MS, 60_000 * 2 ** (n - 1))
  return new Date(now.getTime() + ms)
}

export function shouldDeadLetter(attempts: number, maxAttempts = OUTBOX_MAX_ATTEMPTS): boolean {
  return attempts >= maxAttempts
}

export function planDomainHandlers(row: OutboxRow): HandlerPlan {
  const type = (row.event_type || '').trim()
  const aggregate = (row.aggregate_type || '').trim()
  if (!type) return { effects: [], detail: 'blank event_type' }

  if (type === '__fail_test__' || type === '__poison_test__') {
    return { effects: [], detail: type }
  }

  const effects: HandlerEffect[] = []
  const hubspot =
    HUBSPOT_EVENT_TYPES.has(type) ||
    (HUBSPOT_AGGREGATES.has(aggregate) &&
      /^(create|update|save|finalize|mark_|convert_)/.test(type))
  if (hubspot) effects.push('hubspot_nudge')
  if (DIGEST_EVENT_TYPES.has(type)) effects.push('digest_signal')
  // Always offer webhook when configured; edge skips if URL missing.
  effects.push('webhook_emit')

  return {
    effects,
    detail: `${type} → ${effects.join('+') || 'ack'}`,
  }
}

/**
 * Sync classification for unit tests / dry planning.
 * Side-effect execution lives in the Edge Function (DB + HTTP).
 */
export function dispatchDomainEvent(row: OutboxRow): DispatchResult {
  const type = (row.event_type || '').trim()
  if (!type) return { ok: false, error: 'blank event_type', retryable: false }

  switch (type) {
    case '__fail_test__':
      return { ok: false, error: 'forced failure', retryable: true }
    case '__poison_test__':
      return { ok: false, error: 'non-retryable poison', retryable: false }
    default: {
      const plan = planDomainHandlers(row)
      return {
        ok: true,
        detail: plan.detail || `acked ${type} on ${row.aggregate_type || 'aggregate'}`,
      }
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

/** Build the JSON body posted to an optional outbound webhook. */
export function webhookPayload(row: OutboxRow, now = new Date()) {
  return {
    id: row.id,
    event_type: row.event_type,
    aggregate_type: row.aggregate_type,
    aggregate_id: row.aggregate_id,
    payload: row.payload || {},
    occurred_at: now.toISOString(),
    source: 'rrcentral.event_outbox',
  }
}
