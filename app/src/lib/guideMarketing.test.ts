import { describe, expect, it } from 'vitest'
import { GUIDE_MARKETING_SECTIONS } from './guideMarketing'
import { GUIDE_PACKS } from './guidePacks'
import { t } from './i18n'

describe('GUIDE_MARKETING_SECTIONS', () => {
  it('covers campaigns and segments', () => {
    expect(GUIDE_MARKETING_SECTIONS.map((s) => s.id)).toEqual(['campaigns', 'segments'])
  })

  it('routes into the app', () => {
    for (const s of GUIDE_MARKETING_SECTIONS) {
      expect(s.to.startsWith('/')).toBe(true)
    }
  })

  it('has EN and AR catalog copy for every section', () => {
    for (const s of GUIDE_MARKETING_SECTIONS) {
      for (const key of [s.titleKey, s.bodyKey, s.linkKey]) {
        expect(t('en', key)).not.toBe(key)
        expect(t('ar', key)).not.toBe(key)
      }
    }
  })
})

describe('GUIDE_PACKS', () => {
  it('includes marketing before finance', () => {
    expect(GUIDE_PACKS.map((p) => p.id)).toContain('marketing')
    const ids = GUIDE_PACKS.map((p) => p.id)
    expect(ids.indexOf('marketing')).toBeLessThan(ids.indexOf('finance'))
  })
})
