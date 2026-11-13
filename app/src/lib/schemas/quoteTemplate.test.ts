import { describe, expect, it } from 'vitest'
import { parseQuoteTemplateForm } from './quoteTemplate'

describe('parseQuoteTemplateForm', () => {
  it('requires a name', () => {
    const r = parseQuoteTemplateForm({
      name: '  ',
      division_code: '01',
      description: '',
      items: [],
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toMatch(/Name/i)
  })

  it('keeps lines with description or price', () => {
    const r = parseQuoteTemplateForm({
      name: 'Starter pack',
      division_code: '01',
      description: '  hello ',
      items: [
        { description: ' Widget ', qty: 2, unit_price: 10, remarks: '', sku: '' },
        { description: '', qty: 1, unit_price: 0 },
      ],
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.description).toBe('hello')
    expect(r.data.items_json).toEqual([
      { description: 'Widget', qty: 2, unit_price: 10, remarks: '', sku: '' },
    ])
  })

  it('rejects unknown division', () => {
    const r = parseQuoteTemplateForm({
      name: 'X',
      division_code: '99',
      description: '',
      items: [],
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toMatch(/division/i)
  })
})
