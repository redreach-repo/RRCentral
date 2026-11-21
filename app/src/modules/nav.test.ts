import { describe, expect, it } from 'vitest'
import { HIDE_PIPELINE_DETAIL_NAV_KEY } from '../lib/pipelineDetailNav'
import { APP_MODULES, moduleIdForPath, titleForPath, visibleAppModules } from './nav'

describe('APP_MODULES', () => {
  it('lists the core shell sections in order (gap plan extension groups follow)', () => {
    expect(APP_MODULES.slice(0, 9).map((m) => m.id)).toEqual([
      'overview',
      'sales',
      'documents',
      'clients',
      'delivery',
      'ops',
      'finance',
      'hr',
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

describe('Documents section (every vertical)', () => {
  it('has its own section, outside Sales', () => {
    const docs = APP_MODULES.find((m) => m.id === 'documents')
    expect(docs?.items.map((i) => i.to)).toEqual([
      '/quotations',
      '/invoices',
      '/client-pos',
      '/delivery-notes',
      '/customer-files',
    ])
    const sales = APP_MODULES.find((m) => m.id === 'sales')
    expect(sales?.items.some((i) => i.to === '/client-pos' || i.to === '/invoices')).toBe(false)
    expect(moduleIdForPath('/client-pos')).toBe('documents')
    expect(moduleIdForPath('/invoices/abc')).toBe('documents')
  })

  it('shows Client POs to admin, manager and sales, not to staff or viewer roles', () => {
    const has = (role: Parameters<typeof visibleAppModules>[0]) =>
      visibleAppModules(role, {})
        .find((m) => m.id === 'documents')
        ?.items.some((i) => i.to === '/client-pos') ?? false
    expect(has('admin')).toBe(true)
    expect(has('manager')).toBe(true)
    expect(has('sales')).toBe(true)
    expect(has('staff')).toBe(false)
  })

  it('stays visible when Sales is switched off, and hides with its own flag', () => {
    const noSales = visibleAppModules('manager', { moduleFlags: '{"sales":false}' })
    expect(noSales.map((m) => m.id)).toContain('documents')
    const noDocs = visibleAppModules('manager', { moduleFlags: '{"documents":false}' })
    expect(noDocs.map((m) => m.id)).not.toContain('documents')
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

  it('hides overview when moduleFlags says so', () => {
    const mods = visibleAppModules('manager', { moduleFlags: '{"overview":false}' })
    expect(mods.map((m) => m.id)).not.toContain('overview')
    expect(mods.map((m) => m.id)).toContain('sales')
  })

  it('soft-hides pipeline detail nav for non-admins when the setting is on', () => {
    const sales = visibleAppModules('sales', { [HIDE_PIPELINE_DETAIL_NAV_KEY]: 'yes' })
    const work = sales.find((m) => m.id === 'sales')?.items.map((i) => i.to) || []
    expect(work).not.toContain('/sales')
    expect(work).not.toContain('/ctrm')
    expect(work).toContain('/deals')
  })
})

describe('sidebar tidy (fewer groups, same switches)', () => {
  const paths = (flags: Record<string, boolean>) =>
    visibleAppModules('admin', {}, flags).flatMap((m) => m.items.map((i) => i.to))

  it('keeps HR and payroll in one group, each with its own switch', () => {
    const hr = APP_MODULES.find((m) => m.id === 'hr')
    expect(hr?.items.map((i) => i.to)).toEqual(['/hr/people', '/hr/leave', '/hr/attendance', '/payroll'])
    expect(paths({ payroll: false })).not.toContain('/payroll')
    expect(paths({ payroll: false })).toContain('/hr/people')
    expect(paths({ hr: false })).toContain('/payroll')
    expect(paths({ hr: false, payroll: false }).some((p) => p.startsWith('/hr') || p === '/payroll')).toBe(false)
  })

  it('still hides marketing, plan and packs with their switches', () => {
    expect(paths({})).toEqual(expect.arrayContaining(['/marketing', '/saas-billing', '/industry-packs', '/country-packs']))
    const off = paths({ marketing: false, saasBilling: false, industryPacks: false })
    expect(off).not.toContain('/marketing')
    expect(off).not.toContain('/saas-billing')
    expect(off).not.toContain('/industry-packs')
  })

  it('has no group with a single link', () => {
    for (const group of APP_MODULES) {
      // Overview and Mail are top-level on purpose.
      if (group.id === 'overview' || group.id === 'mail') continue
      expect(group.items.length, group.id).toBeGreaterThan(1)
    }
  })
})
