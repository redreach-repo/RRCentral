import { describe, expect, it } from 'vitest'
import { buildDealProgress } from './dealProgress'
import type { CrmEntry, Invoice, Quotation } from './types'

const crm = {
  id: 'c1',
  company_name: 'Acme LLC',
  pipeline_stage: 'Proposal',
} as CrmEntry

describe('buildDealProgress', () => {
  it('marks quoted / sent / awarded / invoiced / paid / delivered', () => {
    const quotations = [
      {
        id: 'q1',
        client: 'Acme LLC',
        status: 'Awarded',
        reference_number: 'RR-01-26001',
      },
    ] as Quotation[]
    const invoices = [
      {
        id: 'i1',
        client: 'Acme LLC',
        payment_status: 'Paid',
        reference_number: 'INV-01',
      },
    ] as Invoice[]

    const steps = buildDealProgress({
      crm: { ...crm, pipeline_stage: 'Won' },
      quotations,
      invoices,
      deliveryNotes: [
        {
          id: 'd1',
          client: 'Acme LLC',
          status: 'Delivered',
        } as never,
      ],
    })

    expect(steps.find((s) => s.id === 'quoted')?.done).toBe(true)
    expect(steps.find((s) => s.id === 'quote_sent')?.done).toBe(true)
    expect(steps.find((s) => s.id === 'awarded')?.done).toBe(true)
    expect(steps.find((s) => s.id === 'invoiced')?.done).toBe(true)
    expect(steps.find((s) => s.id === 'paid')?.done).toBe(true)
    expect(steps.find((s) => s.id === 'delivered')?.done).toBe(true)
  })

  it('leaves later steps undone when only a draft quote exists', () => {
    const steps = buildDealProgress({
      crm,
      quotations: [{ id: 'q1', client: 'Acme LLC', status: 'Draft' } as Quotation],
      invoices: [],
    })
    expect(steps.find((s) => s.id === 'quoted')?.done).toBe(true)
    expect(steps.find((s) => s.id === 'quote_sent')?.done).toBe(false)
    expect(steps.find((s) => s.id === 'invoiced')?.done).toBe(false)
  })
})
