import { describe, expect, it } from 'vitest'
import {
  digestSignalAtFromJson,
  dispatchDomainEvent,
  nextAvailableAt,
  outcomeFor,
  OUTBOX_MAX_ATTEMPTS,
  planDomainHandlers,
  shouldDeadLetter,
  summarizeOutboxHealth,
  webhookPayload,
  type OutboxRow,
} from './eventOutboxWorker'

const base: OutboxRow = {
  id: '1',
  event_type: 'finalize_quote',
  aggregate_type: 'quotation',
  aggregate_id: 'Q-1',
  payload: {},
  attempts: 1,
  status: 'processing',
}

describe('eventOutboxWorker', () => {
  it('backs off exponentially and caps at one hour', () => {
    const t0 = new Date('2026-11-14T06:00:00Z')
    expect(nextAvailableAt(1, t0).toISOString()).toBe('2026-11-14T06:01:00.000Z')
    expect(nextAvailableAt(2, t0).toISOString()).toBe('2026-11-14T06:02:00.000Z')
    expect(nextAvailableAt(3, t0).toISOString()).toBe('2026-11-14T06:04:00.000Z')
    expect(nextAvailableAt(20, t0).getTime() - t0.getTime()).toBe(60 * 60 * 1000)
  })

  it('dead-letters after max attempts', () => {
    expect(shouldDeadLetter(OUTBOX_MAX_ATTEMPTS - 1)).toBe(false)
    expect(shouldDeadLetter(OUTBOX_MAX_ATTEMPTS)).toBe(true)
  })

  it('plans HubSpot + digest + webhook for quote finalize', () => {
    expect(planDomainHandlers(base).effects).toEqual([
      'hubspot_nudge',
      'digest_signal',
      'webhook_emit',
    ])
  })

  it('plans webhook-only for obscure archive events', () => {
    expect(
      planDomainHandlers({
        ...base,
        event_type: 'archive_vendor',
        aggregate_type: 'vendor',
      }).effects,
    ).toEqual(['webhook_emit'])
  })

  it('acks normal activity events with a plan detail', () => {
    expect(dispatchDomainEvent(base)).toEqual({
      ok: true,
      detail: 'finalize_quote → hubspot_nudge+digest_signal+webhook_emit',
    })
  })

  it('rejects blank types and maps outcomes', () => {
    expect(dispatchDomainEvent({ ...base, event_type: '  ' }).ok).toBe(false)
    const now = new Date('2026-11-14T06:00:00Z')
    expect(outcomeFor(base, { ok: true, detail: 'x' }, now)).toEqual({
      action: 'done',
      detail: 'x',
    })
    expect(outcomeFor(base, { ok: false, error: 'boom' }, now)).toEqual({
      action: 'retry',
      availableAt: new Date('2026-11-14T06:01:00.000Z'),
      error: 'boom',
    })
    expect(
      outcomeFor({ ...base, attempts: OUTBOX_MAX_ATTEMPTS }, { ok: false, error: 'boom' }, now),
    ).toEqual({ action: 'failed', error: 'boom' })
    expect(outcomeFor(base, { ok: false, error: 'nope', retryable: false }, now)).toEqual({
      action: 'failed',
      error: 'nope',
    })
  })

  it('builds a stable webhook payload', () => {
    const now = new Date('2026-11-14T06:00:00Z')
    expect(webhookPayload(base, now)).toEqual({
      id: '1',
      event_type: 'finalize_quote',
      aggregate_type: 'quotation',
      aggregate_id: 'Q-1',
      payload: {},
      occurred_at: '2026-11-14T06:00:00.000Z',
      source: 'rrcentral.event_outbox',
    })
  })

  it('summarizes outbox queue health for System check', () => {
    expect(summarizeOutboxHealth({ counts: { pending: 0, processing: 0, failed: 0 } })).toMatchObject({
      state: 'green',
      reason: 'Queue clear',
    })
    expect(
      summarizeOutboxHealth({
        counts: { pending: 0, processing: 0, failed: 0 },
        hubspotNudgeAt: '2026-11-14T07:00:00.000Z',
      }).reason,
    ).toMatch(/nudge is waiting/)
    expect(summarizeOutboxHealth({ counts: { pending: 2, processing: 1, failed: 0 } }).state).toBe('amber')
    expect(summarizeOutboxHealth({ counts: { pending: 40, processing: 20, failed: 0 } }).state).toBe('amber')
    expect(summarizeOutboxHealth({ counts: { pending: 0, processing: 0, failed: 3 } })).toMatchObject({
      state: 'red',
      reason: '3 dead-lettered events need attention',
    })
    expect(digestSignalAtFromJson('{"at":"2026-11-14T07:00:00Z","events":[]}')).toBe('2026-11-14T07:00:00.000Z')
    expect(digestSignalAtFromJson('nope')).toBeNull()
  })
})
