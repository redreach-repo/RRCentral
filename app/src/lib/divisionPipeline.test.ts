import { describe, expect, it } from 'vitest'
import { buildDivisionPipeline, divisionFromReference } from './divisionPipeline'
import type { Invoice, Quotation } from './types'

const q = (division_code: string, status: string, amount: number) => ({ division_code, status, amount }) as Quotation
const inv = (reference_number: string, amount: number, status = 'Sent', payment_status = 'Pending') =>
  ({ reference_number, amount, status, payment_status }) as Invoice

describe('divisionPipeline', () => {
  it('reads the division from a reference number', () => {
    expect(divisionFromReference('RR-02-26011')).toBe('02')
    expect(divisionFromReference('RR-01-26004_revision 1')).toBe('01')
    expect(divisionFromReference('26107')).toBeNull()
  })

  it('computes open, win rate, average deal, invoiced and outstanding per division', () => {
    const rows = buildDivisionPipeline(
      [
        q('01', 'Sent', 1000),
        q('01', 'Awarded', 4000),
        q('01', 'Awarded', 2000),
        q('01', 'Not awarded', 500),
        q('01', 'Expired', 100),
        q('02', 'Draft', 300),
      ],
      [
        inv('RR-01-26001', 4000, 'Sent', 'Paid'),
        inv('RR-01-26002', 2000, 'Sent', 'Pending'),
        inv('RR-01-26003', 999, 'Cancelled', 'Pending'),
        inv('RR-01-26004', 50, 'Draft', 'Pending'),
      ],
    )
    const threads = rows.find((r) => r.code === '01')!
    expect(threads).toMatchObject({
      openCount: 1,
      openAmount: 1000,
      awardedCount: 2,
      awardedAmount: 6000,
      lostCount: 2,
      winRate: 0.5,
      avgWonAmount: 3000,
      invoicedAmount: 6000,
      outstandingAmount: 2000,
    })
    const wanders = rows.find((r) => r.code === '02')!
    expect(wanders.winRate).toBeNull()
    expect(wanders.openAmount).toBe(300)
  })
})
