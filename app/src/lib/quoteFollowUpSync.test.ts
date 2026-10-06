import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CrmEntry, Quotation } from './types'

const updateEq = vi.fn()
const update = vi.fn(() => ({ eq: updateEq }))

vi.mock('./db', () => ({
  db: {
    from: vi.fn(() => ({
      update,
    })),
  },
}))

import { syncUnansweredQuoteFollowUps } from './quoteFollowUpSync'

describe('syncUnansweredQuoteFollowUps', () => {
  beforeEach(() => {
    update.mockClear()
    updateEq.mockReset()
    updateEq.mockResolvedValue({ error: null })
  })

  it('sets follow-up for Sent quotes older than threshold', async () => {
    const result = await syncUnansweredQuoteFollowUps({
      today: new Date('2026-10-06T12:00:00.000Z'),
      daysAfter: 3,
      quotations: [
        {
          id: 'q1',
          client: 'Acme',
          status: 'Sent',
          date: '2026-10-01',
          reference_number: 'RR-1',
        } as Quotation,
      ],
      crm: [
        {
          id: 'c1',
          company_name: 'Acme',
          follow_up_date: null,
          next_action: '',
        } as CrmEntry,
      ],
    })

    expect(result.updated).toBe(1)
    expect(update).toHaveBeenCalled()
    expect(updateEq).toHaveBeenCalledWith('id', 'c1')
  })

  it('skips when a future follow-up already exists', async () => {
    const result = await syncUnansweredQuoteFollowUps({
      today: new Date('2026-10-06T12:00:00.000Z'),
      daysAfter: 3,
      quotations: [
        {
          id: 'q1',
          client: 'Acme',
          status: 'Sent',
          date: '2026-10-01',
          reference_number: 'RR-1',
        } as Quotation,
      ],
      crm: [
        {
          id: 'c1',
          company_name: 'Acme',
          follow_up_date: '2026-10-10',
          next_action: 'Call',
        } as CrmEntry,
      ],
    })

    expect(result.updated).toBe(0)
    expect(update).not.toHaveBeenCalled()
  })
})
