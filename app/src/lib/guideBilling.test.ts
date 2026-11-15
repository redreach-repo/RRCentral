import { describe, expect, it } from 'vitest'
import { GUIDE_BILLING_SECTIONS } from './guideBilling'
import { GUIDE_PACKS } from './guidePacks'
import { t } from './i18n'

describe('GUIDE_BILLING_SECTIONS', () => {
  it('covers the six billing paths', () => {
    expect(GUIDE_BILLING_SECTIONS.map((s) => s.id)).toEqual([
      'invoices',
      'payments',
      'deliveryNotes',
      'expenses',
      'digest',
      'ledger',
    ])
  })

  it('routes into the app', () => {
    for (const s of GUIDE_BILLING_SECTIONS) {
      expect(s.to.startsWith('/')).toBe(true)
    }
  })

  it('has EN and AR catalog copy for every section', () => {
    for (const s of GUIDE_BILLING_SECTIONS) {
      for (const key of [s.titleKey, s.bodyKey, s.linkKey]) {
        expect(t('en', key)).not.toBe(key)
        expect(t('ar', key)).not.toBe(key)
      }
    }
  })
})

describe('GUIDE_PACKS', () => {
  it('lists CRM through admin with HR before admin', () => {
    expect(GUIDE_PACKS.map((p) => p.id)).toEqual([
      'crm',
      'billing',
      'delivery',
      'ops',
      'marketing',
      'finance',
      'hr',
      'admin',
    ])
    expect(GUIDE_PACKS.every((p) => p.sections.length > 0)).toBe(true)
  })
})
