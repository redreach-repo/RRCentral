import { describe, expect, it } from 'vitest'
import {
  editedByHand,
  monthWindow,
  monthsToImport,
  parseAnthropicCost,
  parsePhoneList,
  parseWhatsAppAnalytics,
  planUsageUpdates,
} from './usageImport'

describe('usage import rules', () => {
  it('reads phone lists', () => {
    expect(parsePhoneList('+971 50 123 4567, 00971501234567\n971 4 555 0000')).toEqual(['971501234567', '97145550000'])
    expect(parsePhoneList('12')).toEqual([])
  })

  it('imports this month, and last month in the first 3 days', () => {
    expect(monthsToImport(new Date('2026-10-23T02:00:00Z'))).toEqual(['2026-10-01'])
    expect(monthsToImport(new Date('2026-11-02T02:00:00Z'))).toEqual(['2026-10-01', '2026-11-01'])
    expect(monthsToImport(new Date('2027-01-01T02:00:00Z'))).toEqual(['2026-12-01', '2027-01-01'])
  })

  it('caps the window at now', () => {
    const now = new Date('2026-10-23T02:00:00Z')
    expect(monthWindow('2026-10-01', now)).toEqual({ start: new Date('2026-10-01T00:00:00Z'), end: now })
    expect(monthWindow('2026-09-01', now).end.toISOString()).toBe('2026-10-01T00:00:00.000Z')
  })

  it('counts Meta pricing analytics per phone, marketing and the rest', () => {
    const body = {
      pricing_analytics: {
        data: [
          {
            data_points: [
              { start: 1, end: 2, phone_number: '+971501234567', pricing_category: 'MARKETING', volume: 40 },
              { start: 1, end: 2, phone_number: '971501234567', pricing_category: 'UTILITY', volume: 10 },
              { start: 2, end: 3, phone_number: '971501234567', pricing_category: 'SERVICE', volume: 5 },
              { start: 2, end: 3, phone_number: '971501234567', pricing_category: 'MARKETING_LITE', volume: 2 },
              { start: 2, end: 3, phone_number: '97145550000', pricing_category: 'AUTHENTICATION', volume: 3 },
            ],
          },
        ],
      },
    }
    const m = parseWhatsAppAnalytics(body)
    expect(m.get('971501234567')).toEqual({ marketing: 42, service: 15 })
    expect(m.get('97145550000')).toEqual({ marketing: 0, service: 3 })
  })

  it('also reads the older conversation analytics', () => {
    const body = {
      conversation_analytics: {
        data: [{ data_points: [{ phone_number: '971501234567', conversation_category: 'MARKETING', conversation: 7 }] }],
      },
    }
    expect(parseWhatsAppAnalytics(body).get('971501234567')).toEqual({ marketing: 7, service: 0 })
    expect(parseWhatsAppAnalytics(null).size).toBe(0)
  })

  it('adds up Anthropic cost per workspace, in dollars', () => {
    const pages = [
      { data: [{ results: [{ amount: '1234.5', currency: 'USD', workspace_id: 'wrkspc_a' }, { amount: '100', currency: 'USD', workspace_id: null }] }] },
      { data: [{ results: [{ amount: '765.5', currency: 'USD', workspace_id: 'wrkspc_a' }] }, { results: [] }] },
    ]
    const m = parseAnthropicCost(pages)
    expect(m.get('wrkspc_a')).toBe(20)
    expect(m.get('')).toBe(1)
  })

  it('treats a row changed after the import as entered by hand', () => {
    expect(editedByHand({ updated_at: '2026-10-05T10:00:00Z', imported_at: '2026-10-05T10:00:00Z' })).toBe(false)
    expect(editedByHand({ updated_at: '2026-10-06T10:00:00Z', imported_at: '2026-10-05T10:00:00Z' })).toBe(true)
    expect(editedByHand({ updated_at: '2026-10-06T10:00:00Z', imported_at: null })).toBe(true)
  })

  it('plans updates only for linked sources and leaves hand entries alone', () => {
    const plan = planUsageUpdates({
      month: '2026-10-01',
      sources: [
        { account_id: 'a', whatsapp_phones: ['971501234567'], ai_workspace_id: 'wrkspc_a' },
        { account_id: 'b', whatsapp_phones: [], ai_workspace_id: 'wrkspc_b' },
        { account_id: 'c', whatsapp_phones: ['97145550000'], ai_workspace_id: '' },
        { account_id: 'd', whatsapp_phones: [], ai_workspace_id: '' },
      ],
      existing: [
        { id: 'r1', account_id: 'a', month: '2026-10-01', updated_at: '2026-10-05T10:00:00Z', imported_at: '2026-10-05T10:00:00Z' },
        { id: 'r3', account_id: 'c', month: '2026-10-01', updated_at: '2026-10-05T10:00:00Z', imported_at: null },
      ],
      whatsapp: new Map([['971501234567', { marketing: 42, service: 15 }]]),
      ai: new Map([['wrkspc_a', 20]]),
    })
    expect(plan.updates).toEqual([
      { account_id: 'a', month: '2026-10-01', id: 'r1', fields: { whatsapp_marketing_count: 42, whatsapp_service_count: 15, ai_cost_usd: 20 } },
      { account_id: 'b', month: '2026-10-01', id: null, fields: { ai_cost_usd: 0 } },
    ])
    expect(plan.skipped).toEqual(['c'])
  })

  it('writes only the source that answered', () => {
    const plan = planUsageUpdates({
      month: '2026-10-01',
      sources: [{ account_id: 'a', whatsapp_phones: ['971501234567'], ai_workspace_id: 'wrkspc_a' }],
      existing: [],
      whatsapp: null,
      ai: new Map([['wrkspc_a', 3.5]]),
    })
    expect(plan.updates[0].fields).toEqual({ ai_cost_usd: 3.5 })
  })
})
