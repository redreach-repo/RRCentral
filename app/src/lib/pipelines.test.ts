import { describe, expect, it } from 'vitest'
import {
  fallbackCrmStageLabels,
  isClosedOutcome,
  slugifyStageKey,
  stageKeyStyleForPipeline,
  stageLabels,
} from './pipelines'

describe('pipelines helpers', () => {
  it('slugifies CRM stage keys as Title Case', () => {
    expect(slugifyStageKey('follow up', 'title')).toBe('Follow Up')
    expect(slugifyStageKey('  demo-ready ', 'title')).toBe('Demo Ready')
  })

  it('slugifies sales/ctrm keys as snake_case', () => {
    expect(slugifyStageKey('Discovery Call', 'snake')).toBe('discovery_call')
  })

  it('picks key style by pipeline', () => {
    expect(stageKeyStyleForPipeline('crm')).toBe('title')
    expect(stageKeyStyleForPipeline('sales')).toBe('snake')
  })

  it('lists active stage keys', () => {
    expect(
      stageLabels([
        { stage_key: 'Lead', label: 'Lead', active: true },
        { stage_key: 'Hidden', label: 'Hidden', active: false },
        { stage_key: 'Won', label: 'Won', active: true },
      ]),
    ).toEqual(['Lead', 'Won'])
  })

  it('falls back to hardcoded CRM stages', () => {
    expect(fallbackCrmStageLabels()).toContain('Lead')
    expect(fallbackCrmStageLabels()).toContain('Won')
  })

  it('detects closed outcomes', () => {
    expect(isClosedOutcome('open')).toBe(false)
    expect(isClosedOutcome('won')).toBe(true)
    expect(isClosedOutcome('lost')).toBe(true)
  })
})
