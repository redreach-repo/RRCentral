import { describe, expect, it, vi } from 'vitest'
import { scrubText, scrubValue } from './scrub'
import { buildEnvelope, parseDsn, sendToSentry } from './sentry'
import { formatLogLine, shouldLog } from './log'

describe('scrubber', () => {
  it('removes secrets and personal data', () => {
    const cases: [string, string][] = [
      ['token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U end', 'token [jwt] end'],
      ['Authorization: Bearer abcdefgh12345678', 'Authorization: Bearer [redacted]'],
      ['key hm_' + 'a'.repeat(64), 'key [hm_key]'],
      ['sk_live_51Habcdefgh', '[sk_live_key]'],
      ['?api_key=xyz&x=1', '?api_key=[redacted]&x=1'],
      ['IBAN AE070331234567890123456 ok', 'IBAN [iban] ok'],
      ['IBAN AE07 0331 2345 6789 0123 456 ok', 'IBAN [iban] ok'],
      ['EID 784-1990-1234567-1', 'EID [emirates_id]'],
      ['card 4111 1111 1111 1111', 'card [card]'],
      ['mail alfred@redreach.ae now', 'mail [email] now'],
      ['call +971 50 123 4567', 'call [phone]'],
    ]
    for (const [input, want] of cases) expect(scrubText(input)).toBe(want)
  })
  it('keeps normal text and amounts', () => {
    expect(scrubText('Invoice RR-01-26003 for AED 1,250.00 on 2026-11-14')).toBe('Invoice RR-01-26003 for AED 1,250.00 on 2026-11-14')
  })
  it('blanks secret keys deeply', () => {
    expect(scrubValue({ a: { password: 'x', salary: 9000, note: 'ok@x.com' }, list: ['Bearer abcdefghijk'] })).toEqual({
      a: { password: '[redacted]', salary: '[redacted]', note: '[email]' },
      list: ['Bearer [redacted]'],
    })
  })
})

describe('sentry', () => {
  const DSN = 'https://abc123@o1.ingest.sentry.io/4501'
  it('parses DSN, off when blank or bad', () => {
    expect(parseDsn(DSN)).toEqual({ host: 'o1.ingest.sentry.io', projectId: '4501', publicKey: 'abc123', envelopeUrl: 'https://o1.ingest.sentry.io/api/4501/envelope/' })
    expect(parseDsn('')).toBeNull()
    expect(parseDsn('http://abc@x.io/1')).toBeNull()
    expect(parseDsn('https://x.io/1')).toBeNull()
  })
  it('builds a scrubbed envelope', () => {
    const env = buildEnvelope(parseDsn(DSN)!, {
      message: 'failed for alfred@redreach.ae',
      detail: 'Bearer abcdefghijklmnop',
      timestamp: '2026-11-14T00:00:00.000Z',
      eventId: 'e'.repeat(32),
    })
    const [h, item, body] = env.split('\n')
    expect(JSON.parse(h).event_id).toBe('e'.repeat(32))
    expect(JSON.parse(item).length).toBe(new TextEncoder().encode(body).length)
    expect(body).not.toContain('alfred@')
    expect(body).not.toContain('abcdefghijklmnop')
  })
  it('does nothing without a DSN and never throws', async () => {
    const f = vi.fn()
    expect(await sendToSentry('', { message: 'x' }, f as unknown as typeof fetch)).toBe(false)
    expect(f).not.toHaveBeenCalled()
    const boom = vi.fn().mockRejectedValue(new Error('network'))
    expect(await sendToSentry(DSN, { message: 'x' }, boom as unknown as typeof fetch)).toBe(true)
  })
})

describe('structured log', () => {
  it('one JSON shape, scrubbed, reserved keys protected', () => {
    const line = formatLogLine('info', 'saved for x@y.com', { request_id: 'r1', msg: 'hijack', token: 'abc' }, new Date('2026-11-14T00:00:00Z'))
    expect(line).toEqual({ ts: '2026-11-14T00:00:00.000Z', level: 'info', msg: 'saved for [email]', source: 'app', request_id: 'r1', token: '[redacted]' })
  })
  it('level threshold', () => {
    expect(shouldLog('debug', 'info')).toBe(false)
    expect(shouldLog('error', 'info')).toBe(true)
  })
})
