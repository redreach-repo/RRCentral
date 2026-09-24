import { describe, expect, it } from 'vitest'
import { quoteAttachmentRefs, QUOTE_SUPPLIER_INVOICE_ENTITY } from './supplierInvoiceStore'

describe('supplierInvoiceStore', () => {
  it('uses a dedicated attachment entity type on the quotation', () => {
    expect(QUOTE_SUPPLIER_INVOICE_ENTITY).toBe('quotation_supplier_invoice')
  })

  it('matches attachments by quote reference, quote id, or row id', () => {
    expect(
      quoteAttachmentRefs({
        reference_number: 'RR-01-26003',
        quote_id: 'Q-1',
        id: 'uuid-1',
      }),
    ).toEqual(['RR-01-26003', 'Q-1', 'uuid-1'])
  })
})
