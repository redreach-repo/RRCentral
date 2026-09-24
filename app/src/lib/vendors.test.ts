import { describe, expect, it } from 'vitest'
import { formatSupplierExpenseDescription } from './supplierInvoiceStore'

describe('vendor registration wording', () => {
  it('expense description still uses the vendor company name', () => {
    expect(formatSupplierExpenseDescription('Gulf Stitch Trading', 'RR-01-26003')).toBe(
      'Payment to Gulf Stitch Trading for RR-01-26003',
    )
  })
})
