import { describe, expect, it } from 'vitest'
import { GUIDE_HR_SECTIONS } from './guideHr'
import { GUIDE_PACKS } from './guidePacks'
import { t } from './i18n'

describe('GUIDE_HR_SECTIONS', () => {
  it('covers the four HR paths', () => {
    expect(GUIDE_HR_SECTIONS.map((s) => s.id)).toEqual([
      'people',
      'leave',
      'attendance',
      'payroll',
    ])
  })

  it('routes into the app', () => {
    for (const s of GUIDE_HR_SECTIONS) {
      expect(s.to.startsWith('/')).toBe(true)
    }
  })

  it('has EN and AR catalog copy for every section', () => {
    for (const s of GUIDE_HR_SECTIONS) {
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
