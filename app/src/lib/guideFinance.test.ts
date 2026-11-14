import { describe, expect, it } from 'vitest'
import { GUIDE_FINANCE_SECTIONS } from './guideFinance'
import { GUIDE_PACKS } from './guidePacks'
import { t } from './i18n'

describe('GUIDE_FINANCE_SECTIONS', () => {
  it('covers the five finance paths beyond billing', () => {
    expect(GUIDE_FINANCE_SECTIONS.map((s) => s.id)).toEqual([
      'vendors',
      'reports',
      'mrr',
      'insights',
      'duplicates',
    ])
  })

  it('routes into the app', () => {
    for (const s of GUIDE_FINANCE_SECTIONS) {
      expect(s.to.startsWith('/')).toBe(true)
    }
  })

  it('has EN and AR catalog copy for every section', () => {
    for (const s of GUIDE_FINANCE_SECTIONS) {
      for (const key of [s.titleKey, s.bodyKey, s.linkKey]) {
        expect(t('en', key)).not.toBe(key)
        expect(t('ar', key)).not.toBe(key)
      }
    }
  })
})

describe('GUIDE_PACKS', () => {
  it('lists CRM, billing, delivery, ops, finance, then admin', () => {
    expect(GUIDE_PACKS.map((p) => p.id)).toEqual([
      'crm',
      'billing',
      'delivery',
      'ops',
      'finance',
      'admin',
    ])
    expect(GUIDE_PACKS.every((p) => p.sections.length > 0)).toBe(true)
  })
})
