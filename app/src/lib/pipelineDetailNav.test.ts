import { describe, expect, it } from 'vitest'
import {
  HIDE_PIPELINE_DETAIL_NAV_KEY,
  hidePipelineDetailNavEnabled,
  shouldHidePipelineDetailNavItem,
} from './pipelineDetailNav'

describe('pipelineDetailNav', () => {
  it('defaults to off', () => {
    expect(hidePipelineDetailNavEnabled({})).toBe(false)
  })

  it('turns on with yes', () => {
    expect(hidePipelineDetailNavEnabled({ [HIDE_PIPELINE_DETAIL_NAV_KEY]: 'yes' })).toBe(true)
  })

  it('hides /sales and /ctrm for non-admins when enabled', () => {
    const settings = { [HIDE_PIPELINE_DETAIL_NAV_KEY]: 'yes' }
    expect(shouldHidePipelineDetailNavItem('/sales', settings, 'sales')).toBe(true)
    expect(shouldHidePipelineDetailNavItem('/ctrm', settings, 'manager')).toBe(true)
    expect(shouldHidePipelineDetailNavItem('/deals', settings, 'sales')).toBe(false)
  })

  it('never hides for admins', () => {
    const settings = { [HIDE_PIPELINE_DETAIL_NAV_KEY]: 'yes' }
    expect(shouldHidePipelineDetailNavItem('/sales', settings, 'admin')).toBe(false)
    expect(shouldHidePipelineDetailNavItem('/ctrm', settings, 'admin')).toBe(false)
  })
})
