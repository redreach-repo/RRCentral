import { describe, expect, it } from 'vitest'
import { HIDE_PIPELINE_DETAIL_NAV_KEY } from '../lib/pipelineDetailNav'
import { APP_MODULES, moduleIdForPath, titleForPath, visibleAppModules } from './nav'

describe('APP_MODULES', () => {
  it('lists the seven shell sections in order', () => {
    expect(APP_MODULES.map((m) => m.id)).toEqual([
      'overview',
      'sales',
      'clients',
      'delivery',
      'ops',
      'finance',
      'admin',
    ])
  })

  it('keeps Pipeline ahead of My Day under Sales · Work', () => {
    const sales = APP_MODULES.find((m) => m.id === 'sales')
    expect(sales).toBeTruthy()
    const work = (sales?.items || []).filter((i) => i.section === 'Work').map((i) => i.to)
    expect(work.indexOf('/deals')).toBeLessThan(work.indexOf('/crm'))
    expect(work.indexOf('/crm')).toBeLessThan(work.indexOf('/sales'))
  })
})

describe('moduleIdForPath / titleForPath', () => {
  it('maps routes to their module and title', () => {
    expect(moduleIdForPath('/deals')).toBe('sales')
    expect(moduleIdForPath('/accounts/xyz')).toBe('clients')
    expect(moduleIdForPath('/expenses')).toBe('finance')
    expect(titleForPath('/deals')).toBe('Pipeline')
    expect(titleForPath('/crm')).toBe('My Day')
    expect(titleForPath('/delivery-settings')).toBe('Packages and rates')
    expect(titleForPath('/insights')).toBe('Utilisation and profit')
  })
})

describe('visibleAppModules', () => {
  it('hides ops when moduleFlags says so and filters admin items by role', () => {
    const sales = visibleAppModules('sales', { moduleFlags: '{"ops":false}' })
    expect(sales.map((m) => m.id)).not.toContain('ops')
    const adminItems = sales.find((m) => m.id === 'admin')?.items.map((i) => i.to) || []
    expect(adminItems).toContain('/settings#account')
    expect(adminItems).not.toContain('/settings')
    expect(adminItems).not.toContain('/system-check')
    expect(sales.find((m) => m.id === 'finance')?.items.some((i) => i.to === '/mrr')).toBe(false)

    const admin = visibleAppModules('admin', {})
    expect(admin.map((m) => m.id)).toContain('ops')
    expect(admin.find((m) => m.id === 'admin')?.items.some((i) => i.to === '/system-check')).toBe(true)
  })

  it('hides finance when moduleFlags says so', () => {
    const sales = visibleAppModules('sales', { moduleFlags: '{"finance":false}' })
    expect(sales.map((m) => m.id)).not.toContain('finance')
    expect(sales.map((m) => m.id)).toContain('ops')
  })

  it('hides delivery when moduleFlags says so', () => {
    const sales = visibleAppModules('sales', { moduleFlags: '{"delivery":false}' })
    expect(sales.map((m) => m.id)).not.toContain('delivery')
    expect(sales.map((m) => m.id)).toContain('finance')
  })

  it('hides clients when moduleFlags says so', () => {
    const sales = visibleAppModules('sales', { moduleFlags: '{"clients":false}' })
    expect(sales.map((m) => m.id)).not.toContain('clients')
    expect(sales.map((m) => m.id)).toContain('delivery')
  })

  it('hides sales when moduleFlags says so', () => {
    const mods = visibleAppModules('manager', { moduleFlags: '{"sales":false}' })
    expect(mods.map((m) => m.id)).not.toContain('sales')
    expect(mods.map((m) => m.id)).toContain('clients')
  })

  it('soft-hides pipeline detail nav for non-admins when the setting is on', () => {
    const sales = visibleAppModules('sales', { [HIDE_PIPELINE_DETAIL_NAV_KEY]: 'yes' })
    const work = sales.find((m) => m.id === 'sales')?.items.map((i) => i.to) || []
    expect(work).not.toContain('/sales')
    expect(work).not.toContain('/ctrm')
    expect(work).toContain('/deals')
  })
})
