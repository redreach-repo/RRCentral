import { describe, expect, it, vi } from 'vitest'
import {
  buildSignedWebhookHeaders,
  deliverWebhookWithRetries,
  DEFAULT_API_KEY_SCOPES,
  hasApiScope,
  nextCursorFromPage,
  parseCursorPage,
  shouldRetryWebhookStatus,
  signWebhookBody,
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
  it('includes invoices and quotations', () => {
    expect(DEFAULT_API_KEY_SCOPES).toContain('read:invoices')
    expect(DEFAULT_API_KEY_SCOPES).toContain('read:quotations')
  })
})
