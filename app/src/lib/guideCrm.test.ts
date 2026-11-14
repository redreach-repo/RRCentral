import { describe, expect, it } from 'vitest'
import { GUIDE_CRM_SECTIONS } from './guideCrm'

describe('GUIDE_CRM_SECTIONS', () => {
  it('covers the five daily CRM paths', () => {
    expect(GUIDE_CRM_SECTIONS.map((s) => s.id)).toEqual([
      'myday',
      'pipeline',
      'quotes',
      'support',
      'contracts',
    ])
  })

  it('routes into the app', () => {
    for (const s of GUIDE_CRM_SECTIONS) {
      expect(s.to.startsWith('/')).toBe(true)
    }
  })
})
