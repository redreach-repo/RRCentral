import { describe, expect, it } from 'vitest'
import { parseTicketSummaryForm } from './ticketSummary'

describe('parseTicketSummaryForm', () => {
  it('rejects blank summary', () => {
    const r = parseTicketSummaryForm({ summary: '  ' })
    expect(r.ok).toBe(false)
  })

  it('trims summary', () => {
    const r = parseTicketSummaryForm({ summary: '  Customer wants portal  ' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.summary).toBe('Customer wants portal')
  })
})
