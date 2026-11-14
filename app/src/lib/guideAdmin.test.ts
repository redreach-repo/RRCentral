import { describe, expect, it } from 'vitest'
import { GUIDE_ADMIN_SECTIONS } from './guideAdmin'
import { GUIDE_PACKS } from './guidePacks'
import { t } from './i18n'

describe('GUIDE_ADMIN_SECTIONS', () => {
  it('covers the five admin paths', () => {
    expect(GUIDE_ADMIN_SECTIONS.map((s) => s.id)).toEqual([
      'settings',
      'moduleFlags',
      'systemCheck',
      'audit',
      'appErrors',
    ])
  })

  it('routes into the app', () => {
    for (const s of GUIDE_ADMIN_SECTIONS) {
      expect(s.to.startsWith('/')).toBe(true)
    }
  })

  it('has EN and AR catalog copy for every section', () => {
    for (const s of GUIDE_ADMIN_SECTIONS) {
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
