import { describe, expect, it } from 'vitest'
import { newDraftLine, toDraftItems, toPersistedLineItemRows } from './lineItems'
import type { LineItem } from './types'

describe('line item image_data persistence', () => {
  it('persists image_data when present and keeps empty when absent', () => {
    const rows = toPersistedLineItemRows(
      'Quote',
      'Q-1',
      [
        newDraftLine({
          description: 'Polo',
          qty: 10,
          unit_price: 40,
          image_data: 'data:image/jpeg;base64,abc',
        }),
        newDraftLine({ description: 'Setup fee', qty: 1, unit_price: 100, image_data: '' }),
      ],
      0.05,
    )
    expect(rows[0]?.image_data).toBe('data:image/jpeg;base64,abc')
    expect(rows[1]?.image_data).toBe('')
  })

  it('round-trips image_data through toDraftItems', () => {
    const saved = [
      {
        id: '1',
        doc_type: 'Quote',
        reference: 'Q-1',
        line_no: 1,
        description: 'Polo',
        qty: 10,
        unit_price: 40,
        unit_cost: 0,
        vat_rate: 0.05,
        amount: 400,
        vat_amount: 20,
        line_total: 420,
        remarks: '',
        sku: '',
        sizes_json: null,
        image_data: 'data:image/jpeg;base64,xyz',
        created_at: '',
      },
    ] as LineItem[]
    const draft = toDraftItems(saved)
    expect(draft[0]?.image_data).toBe('data:image/jpeg;base64,xyz')
  })
})
