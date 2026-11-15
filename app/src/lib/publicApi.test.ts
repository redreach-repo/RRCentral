import { describe, expect, it, vi } from 'vitest'
import {
  buildSignedWebhookHeaders,
  deliverWebhookWithRetries,
  DEFAULT_API_KEY_SCOPES,
  hasApiScope,
  nextCursorFromPage,
  parseAccountWrite,
  parseCursorPage,
  parseInvoiceWrite,
  parseQuotationWrite,
  shouldRetryWebhookStatus,
  signWebhookBody,
  webhookDueForRetry,
  webhookRetryDelayMs,
  webhookSignatureHeader,
} from './publicApi'

describe('hasApiScope', () => {
  it('honours wildcard and exact scopes', () => {
    expect(hasApiScope(['*'], 'read:invoices')).toBe(true)
    expect(hasApiScope(['read:accounts'], 'read:invoices')).toBe(false)
    expect(hasApiScope(['read:invoices'], 'read:invoices')).toBe(true)
  })
})

describe('parseCursorPage / nextCursorFromPage', () => {
  it('clamps limit and reads cursor', () => {
    expect(parseCursorPage({ limit: '200', cursor: 'abc' })).toEqual({ limit: 100, cursor: 'abc' })
    expect(parseCursorPage(new URLSearchParams('limit=10'))).toEqual({ limit: 10, cursor: null })
  })

  it('returns next cursor only on full pages', () => {
    expect(nextCursorFromPage([{ id: '1' }, { id: '2' }], 2)).toBe('2')
    expect(nextCursorFromPage([{ id: '1' }], 2)).toBeNull()
  })
})

describe('webhook signing', () => {
  it('builds a stable HMAC header', async () => {
    const body = '{"ok":true}'
    const digest = await signWebhookBody('whsec_test', body, 1_700_000_000)
    expect(digest).toMatch(/^[0-9a-f]{64}$/)
    expect(webhookSignatureHeader(1_700_000_000, digest)).toBe(`t=1700000000,v1=${digest}`)
    const headers = await buildSignedWebhookHeaders('whsec_test', body, 'highmast.test', 1_700_000_000_000)
    expect(headers['X-HighMast-Event']).toBe('highmast.test')
    expect(headers['X-HighMast-Signature']).toContain('v1=')
  })
})

describe('webhook retries', () => {
  it('schedules delays and classifies retryable statuses', () => {
    expect(webhookRetryDelayMs(1)).toBe(0)
    expect(webhookRetryDelayMs(2)).toBe(400)
    expect(shouldRetryWebhookStatus(500, false)).toBe(true)
    expect(shouldRetryWebhookStatus(200, false)).toBe(false)
    expect(shouldRetryWebhookStatus(null, true)).toBe(true)
  })

  it('retries once on 503 then succeeds', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(new Response('', { status: 200 }))
    const sleep = vi.fn(async () => {})
    const result = await deliverWebhookWithRetries({
      url: 'https://example.test/hook',
      body: '{}',
      headers: { 'Content-Type': 'application/json' },
      maxAttempts: 3,
      sleep,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    expect(result).toEqual({ ok: true, status: 'http_200', attempts: 2 })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenCalledWith(400)
  })
})

describe('DEFAULT_API_KEY_SCOPES', () => {
  it('includes invoices, quotations, contacts, and tickets but not writes by default', () => {
    expect(DEFAULT_API_KEY_SCOPES).toContain('read:invoices')
    expect(DEFAULT_API_KEY_SCOPES).toContain('read:quotations')
    expect(DEFAULT_API_KEY_SCOPES).toContain('read:contacts')
    expect(DEFAULT_API_KEY_SCOPES).toContain('read:tickets')
    expect(DEFAULT_API_KEY_SCOPES).not.toContain('write:accounts')
  })
})

describe('parseAccountWrite', () => {
  it('requires name on create and validates type', () => {
    expect(parseAccountWrite({}, { partial: false }).ok).toBe(false)
    const created = parseAccountWrite({ name: 'Acme', type: 'ai_crm_client' }, { partial: false })
    expect(created.ok).toBe(true)
    if (created.ok) expect(created.patch.name).toBe('Acme')
    expect(parseAccountWrite({ name: 'X', type: 'nope' }, { partial: false }).ok).toBe(false)
  })

  it('rejects empty patches', () => {
    expect(parseAccountWrite({}, { partial: true }).ok).toBe(false)
    const patched = parseAccountWrite({ status: 'paused' }, { partial: true })
    expect(patched.ok).toBe(true)
  })
})

describe('parseInvoiceWrite / parseQuotationWrite', () => {
  it('requires client and defaults money fields on create', () => {
    expect(parseInvoiceWrite({}, { partial: false }).ok).toBe(false)
    const inv = parseInvoiceWrite({ client: 'Acme', amount: '12.5' }, { partial: false })
    expect(inv.ok).toBe(true)
    if (inv.ok) {
      expect(inv.patch.client).toBe('Acme')
      expect(inv.patch.amount).toBe(12.5)
      expect(inv.patch.status).toBe('Draft')
      expect(inv.patch.payment_status).toBe('Unpaid')
      expect(inv.patch.currency).toBe('AED')
    }
    const quote = parseQuotationWrite(
      { client: 'Acme', deal_ref: 'D-1', currency: 'usd' },
      { partial: false },
    )
    expect(quote.ok).toBe(true)
    if (quote.ok) {
      expect(quote.patch.deal_ref).toBe('D-1')
      expect(quote.patch.currency).toBe('USD')
    }
  })

  it('rejects bad amounts/dates and empty patches', () => {
    expect(parseInvoiceWrite({ client: 'X', amount: -1 }, { partial: false }).ok).toBe(false)
    expect(parseInvoiceWrite({ date: '15-11-2026' }, { partial: true }).ok).toBe(false)
    expect(parseQuotationWrite({}, { partial: true }).ok).toBe(false)
  })
})

describe('webhookDueForRetry', () => {
  it('only returns due active endpoints', () => {
    const now = Date.parse('2026-11-15T10:00:00Z')
    expect(webhookDueForRetry({ active: true, next_retry_at: '2026-11-15T09:00:00Z' }, now)).toBe(true)
    expect(webhookDueForRetry({ active: true, next_retry_at: '2026-11-15T11:00:00Z' }, now)).toBe(false)
    expect(webhookDueForRetry({ active: false, next_retry_at: '2026-11-15T09:00:00Z' }, now)).toBe(false)
  })
})
