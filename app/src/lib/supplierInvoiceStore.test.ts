import { describe, expect, it } from 'vitest'
import type { Expense } from './types'
import {
  expenseReportDescription,
  expensesMatchVendor,
  formatSupplierExpenseDescription,
  quoteAttachmentRefs,
  QUOTE_SUPPLIER_INVOICE_ENTITY,
} from './supplierInvoiceStore'

function expense(partial: Partial<Expense> & Pick<Expense, 'id' | 'vendor'>): Expense {
  return {
    date: null,
    category: '',
    amount: 0,
    payment_method: '',
    references_text: '',
    notes: '',
    created_at: '',
    ...partial,
  }
}

describe('supplierInvoiceStore', () => {
  it('uses a dedicated attachment entity type on the quotation', () => {
    expect(QUOTE_SUPPLIER_INVOICE_ENTITY).toBe('quotation_supplier_invoice')
  })

  it('matches attachments by deal / quote reference keys', () => {
    expect(
      quoteAttachmentRefs({
        deal_ref: '',
        base_reference: '',
        reference_number: 'RR-01-26003',
        quote_id: 'Q-1',
        id: 'uuid-1',
      }),
    ).toEqual(['RR-01-26003', 'Q-1', 'uuid-1'])
    expect(
      quoteAttachmentRefs({
        deal_ref: 'RR-01-26003',
        base_reference: 'RR-01-26003',
        reference_number: 'RR-01-26010',
        quote_id: 'Q-2',
        id: 'uuid-2',
      }),
    ).toContain('RR-01-26003')
  })

  it('formats expense description as payment to company for quotation', () => {
    expect(formatSupplierExpenseDescription('ACME Uniforms LLC', 'RR-01-26003')).toBe(
      'Payment to ACME Uniforms LLC for RR-01-26003',
    )
    expect(
      expenseReportDescription({
        vendor: 'ACME Uniforms LLC',
        quote_ref: 'RR-01-26003',
        notes: 'Payment to ACME Uniforms LLC for RR-01-26003\nSupplier TRN 100',
        references_text: 'RR-01-26003',
      }),
    ).toBe('Payment to ACME Uniforms LLC for RR-01-26003')
  })

  it('lists expenses for a vendor by company name (case-insensitive)', () => {
    const rows = [
      expense({ id: '1', vendor: 'ACME Uniforms LLC', date: '2026-03-01', amount: 100 }),
      expense({ id: '2', vendor: 'acme uniforms llc', date: '2026-04-01', amount: 200 }),
      expense({ id: '3', vendor: 'Other Co', date: '2026-05-01', amount: 50 }),
    ]
    const matched = expensesMatchVendor(rows, 'Acme Uniforms LLC')
    expect(matched.map((e) => e.id)).toEqual(['2', '1'])
    expect(expensesMatchVendor(rows, '')).toEqual([])
  })
})
