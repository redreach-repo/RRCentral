import { describe, expect, it } from 'vitest'
import { GUIDE_DELIVERY_SECTIONS } from './guideDelivery'
import { GUIDE_PACKS } from './guidePacks'
import { t } from './i18n'

describe('GUIDE_DELIVERY_SECTIONS', () => {
  it('covers the five delivery paths', () => {
    expect(GUIDE_DELIVERY_SECTIONS.map((s) => s.id)).toEqual([
      'accounts',
      'health',
      'reports',
      'updates',
      'obligations',
    ])
  })

  it('routes into the app', () => {
    for (const s of GUIDE_DELIVERY_SECTIONS) {
      expect(s.to.startsWith('/')).toBe(true)
    }
  })

  it('has EN and AR catalog copy for every section', () => {
    for (const s of GUIDE_DELIVERY_SECTIONS) {
      for (const key of [s.titleKey, s.bodyKey, s.linkKey]) {
        expect(t('en', key)).not.toBe(key)
        expect(t('ar', key)).not.toBe(key)
      }
    }
  })
})

describe('GUIDE_PACKS', () => {
  it('lists CRM, billing, delivery, then admin', () => {
    expect(GUIDE_PACKS.map((p) => p.id)).toEqual(['crm', 'billing', 'delivery', 'admin'])
    expect(GUIDE_PACKS.every((p) => p.sections.length > 0)).toBe(true)
  })
})
