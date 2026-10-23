import { describe, expect, it } from 'vitest'
import { clientHealth, healthBand, reportCallMonths, type HealthInput } from './clientHealth'
import migrationSql from '../../../supabase/migrations/20261110090000_report_calls.sql?raw'

const today = new Date('2026-11-15T10:00:00Z')

function input(over: Partial<HealthInput> = {}): HealthInput {
  return {
    contract: { term_end: '2027-06-30', status: 'active' },
    pkg: { included_whatsapp: 1000 },
    usage: [
      { month: '2026-10-01', whatsapp_marketing_count: 400, whatsapp_service_count: 300 },
      { month: '2026-09-01', whatsapp_marketing_count: 500, whatsapp_service_count: 200 },
    ],
    tickets: [{ status: 'resolved', created_at: '2026-11-10T09:00:00Z', sla_due_at: '2026-11-10T17:00:00Z', resolved_at: '2026-11-10T12:00:00Z' }],
    calls: [
      { month: '2026-11-01', status: 'attended' },
      { month: '2026-10-01', status: 'attended' },
    ],
    invoices: [{ invoice: { date: '2026-11-01', payment_terms: 'Net 7 days', status: 'Sent', payment_status: 'Paid' }, balance: 0 }],
    today,
    ...over,
  }
}

const part = (h: ReturnType<typeof clientHealth>, key: string) => h.parts.find((p) => p.key === key)!

describe('client health', () => {
  it('a busy, paying client who joins calls scores 100 with no warning', () => {
    const h = clientHealth(input())
    expect(h.score).toBe(100)
    expect(h.band).toBe('healthy')
    expect(h.churnWarning).toBe(false)
    expect(part(h, 'usage').note).toBe('Used 70% of the WhatsApp allowance last month.')
  })

  it('missing data counts as neutral, not as bad', () => {
    const h = clientHealth(input({ usage: [], calls: [], tickets: [], invoices: [] }))
    expect(part(h, 'usage').points).toBe(15)
    expect(part(h, 'calls').points).toBe(15)
    expect(part(h, 'tickets').points).toBe(25)
    expect(part(h, 'payments').points).toBe(25)
    expect(h.score).toBe(80)
  })

  it('scores usage against the allowance and flags a sharp drop', () => {
    const low = clientHealth(input({ usage: [{ month: '2026-10-01', whatsapp_marketing_count: 50, whatsapp_service_count: 0 }, { month: '2026-09-01', whatsapp_marketing_count: 60, whatsapp_service_count: 0 }] }))
    expect(part(low, 'usage').points).toBe(0)
    expect(low.flags).toContain('Hardly using the system for two months')

    const drop = clientHealth(input({ usage: [{ month: '2026-10-01', whatsapp_marketing_count: 300, whatsapp_service_count: 0 }, { month: '2026-09-01', whatsapp_marketing_count: 900, whatsapp_service_count: 0 }] }))
    expect(part(drop, 'usage').points).toBe(10)
    expect(drop.flags).toContain('Usage dropped by more than half last month')
  })

  it('many tickets or late replies lower the support part', () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ status: 'resolved' as const, created_at: `2026-11-0${(i % 9) + 1}T09:00:00Z`, sla_due_at: null, resolved_at: null }))
    const h = clientHealth(input({ tickets: many }))
    expect(part(h, 'tickets').points).toBe(3)
    expect(h.flags).toContain('10 support tickets in 30 days')

    const late = clientHealth(input({ tickets: [{ status: 'open', created_at: '2026-11-14T09:00:00Z', sla_due_at: '2026-11-14T17:00:00Z', resolved_at: null }] }))
    expect(part(late, 'tickets').points).toBe(20)
    expect(part(late, 'tickets').note).toContain('1 open past the promised reply time')

    // Old tickets do not count.
    expect(part(clientHealth(input({ tickets: [{ ...many[0], created_at: '2026-09-01T00:00:00Z' }] })), 'tickets').points).toBe(25)
  })

  it('report calls: share attended, moved calls ignored, two misses in a row is a warning', () => {
    const h = clientHealth(input({ calls: [{ month: '2026-11-01', status: 'missed' }, { month: '2026-10-01', status: 'missed' }, { month: '2026-09-01', status: 'attended' }] }))
    expect(part(h, 'calls').points).toBe(8)
    expect(h.flags).toContain('Missed the last two report calls')
    const moved = clientHealth(input({ calls: [{ month: '2026-11-01', status: 'rescheduled' }, { month: '2026-10-01', status: 'attended' }] }))
    expect(part(moved, 'calls').points).toBe(25)
    // Older than three months does not count.
    expect(part(clientHealth(input({ calls: [{ month: '2026-07-01', status: 'missed' }] })), 'calls').points).toBe(15)
  })

  it('payments: the most overdue unpaid invoice sets the points', () => {
    const owe = (date: string, balance = 500) => ({ invoice: { date, payment_terms: 'Net 7 days', status: 'Sent', payment_status: 'Pending' }, balance })
    // Due 12 November, so 3 days late.
    expect(part(clientHealth(input({ invoices: [owe('2026-11-05')] })), 'payments').points).toBe(18)
    // Not yet due is fine.
    expect(part(clientHealth(input({ invoices: [owe('2026-11-10')] })), 'payments').points).toBe(25)
    expect(part(clientHealth(input({ invoices: [owe('2026-10-25')] })), 'payments').points).toBe(10)
    const old = clientHealth(input({ invoices: [owe('2026-09-20', 4200), owe('2026-11-10')] }))
    expect(part(old, 'payments').points).toBe(0)
    expect(part(old, 'payments').note).toBe('AED 4,200 overdue, the oldest by 49 days.')
    expect(old.flags).toContain('Invoice 49 days overdue')
    expect(old.churnWarning).toBe(true)
    // Drafts and paid invoices are ignored.
    expect(part(clientHealth(input({ invoices: [{ ...owe('2026-09-01'), invoice: { ...owe('2026-09-01').invoice, status: 'Draft' } }] })), 'payments').points).toBe(25)
  })

  it('bands, and a renewal coming up while not healthy is a warning', () => {
    expect(healthBand(75)).toBe('healthy')
    expect(healthBand(74)).toBe('watch')
    expect(healthBand(49)).toBe('at_risk')
    const t = { status: 'resolved' as const, created_at: '2026-11-10T09:00:00Z', sla_due_at: null, resolved_at: null }
    const h = clientHealth(
      input({ contract: { term_end: '2026-12-20', status: 'active' }, calls: [{ month: '2026-11-01', status: 'missed' }], tickets: [t, t, t] }),
    )
    expect(h.band).toBe('watch')
    expect(h.flags).toContain('Renewal in 35 days and not fully healthy')
  })

  it('asks about this month and last month', () => {
    expect(reportCallMonths(today)).toEqual([
      { key: '2026-11-01', label: 'November' },
      { key: '2026-10-01', label: 'October' },
    ])
  })

  it('migration keeps one call per client per month', () => {
    expect(migrationSql).toContain('unique (account_id, month)')
    expect(migrationSql).toContain('drop policy if exists "Staff full access" on public.report_calls')
  })
})
