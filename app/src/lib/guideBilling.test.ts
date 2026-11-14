import { describe, expect, it } from 'vitest'
import { GUIDE_BILLING_SECTIONS } from './guideBilling'
import { GUIDE_PACKS } from './guidePacks'

describe('GUIDE_BILLING_SECTIONS', () => {
  it('covers the five billing paths', () => {
    expect(GUIDE_BILLING_SECTIONS.map((s) => s.id)).toEqual([
      'invoices',
      'payments',
      'deliveryNotes',
      'expenses',
      'digest',
    ])
  })

  it('routes into the app', () => {
    for (const s of GUIDE_BILLING_SECTIONS) {
      expect(s.to.startsWith('/')).toBe(true)
    }
  })
})

describe('GUIDE_PACKS', () => {
  it('lists CRM, billing, then delivery', () => {
    expect(GUIDE_PACKS.map((p) => p.id)).toEqual(['crm', 'billing', 'delivery'])
    expect(GUIDE_PACKS.every((p) => p.sections.length > 0)).toBe(true)
  })
})
