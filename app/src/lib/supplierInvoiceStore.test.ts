import { describe, expect, it } from 'vitest'
import {
  expenseReportDescription,
  formatSupplierExpenseDescription,
  quoteAttachmentRefs,
  QUOTE_SUPPLIER_INVOICE_ENTITY,
} from './supplierInvoiceStore'

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
})
