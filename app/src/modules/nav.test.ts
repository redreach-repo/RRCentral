import { describe, expect, it } from 'vitest'
import { HIDE_PIPELINE_DETAIL_NAV_KEY } from '../lib/pipelineDetailNav'
import type { UserRole } from '../lib/types'
import { APP_MODULES, moduleIdForPath, titleForPath, visibleAppModules } from './nav'

const groupPaths = (id: string) => APP_MODULES.find((m) => m.id === id)?.items.map((i) => i.to) || []
const visiblePaths = (role: UserRole, flags: Record<string, boolean> = {}) =>
  visibleAppModules(role, {}, flags).flatMap((m) => m.items.map((i) => i.to))
const visibleIds = (role: UserRole, flags: Record<string, boolean> = {}) =>
  visibleAppModules(role, {}, flags).map((m) => m.id)

describe('sidebar groups (rebuilt Nov 2026)', () => {
  it('is Home links, then Mail/calendar/contacts, Sales, Operations, Finance, HR and admin', () => {
    expect(APP_MODULES.map((m) => m.id)).toEqual(['overview', 'connect', 'sales', 'ops', 'finance', 'admin'])
    expect(APP_MODULES.filter((m) => m.flat).map((m) => m.id)).toEqual(['overview'])
  })

  it('puts every page in exactly one place', () => {
    const all = APP_MODULES.flatMap((m) => m.items.map((i) => i.to))
    const dupes = all.filter((to, i) => all.indexOf(to) !== i)
    expect(dupes).toEqual([])
  })

  it('keeps mail, calendar and contacts together', () => {
    expect(groupPaths('connect')).toEqual(['/mail', '/follow-ups', '/accounts'])
  })

  it('keeps HR, payroll and admin pages in one group', () => {
    const admin = groupPaths('admin')
    for (const to of ['/hr/people', '/hr/leave', '/hr/attendance', '/payroll', '/settings', '/approvals', '/system-check', '/ai-connector', '/ai-approvals', '/saas-billing', '/industry-packs', '/country-packs']) {
      expect(admin, to).toContain(to)
    }
  })

  it('gives Sales its own pages only', () => {
    expect(groupPaths('sales')).toEqual(['/quick-add', '/deals', '/crm', '/sales', '/ctrm', '/quotations', '/quote-followup', '/client-pos', '/marketing'])
  })

  it('gives Operations client care, delivery, contracts, projects, stock and files', () => {
    const ops = APP_MODULES.find((m) => m.id === 'ops')!
    const sections = [...new Set(ops.items.map((i) => i.section))]
    expect(sections).toEqual(['Client care', 'Delivery', 'Contracts', 'Projects', 'Stock and buying', 'Web and files'])
    // Extension links land inside their section, not at the end.
    const care = ops.items.filter((i) => i.section === 'Client care').map((i) => i.to)
    expect(care).toContain('/uniform-sizes')
    expect(ops.items.findIndex((i) => i.to === '/uniform-sizes')).toBeLessThan(ops.items.findIndex((i) => i.to === '/products'))
  })

  it('keeps sections in unbroken runs inside every group', () => {
    for (const group of APP_MODULES) {
      const runs = group.items.map((i) => i.section || '').filter((s, i, a) => i === 0 || s !== a[i - 1])
      expect(new Set(runs).size, group.id).toBe(runs.length)
    }
  })

  it('keeps Pipeline ahead of My Day under Sales · Work', () => {
    const work = (APP_MODULES.find((m) => m.id === 'sales')?.items || []).filter((i) => i.section === 'Work').map((i) => i.to)
    expect(work.indexOf('/deals')).toBeLessThan(work.indexOf('/crm'))
    expect(work.indexOf('/crm')).toBeLessThan(work.indexOf('/sales'))
  })
})

describe('Settings > Modules switches still hide the same pages', () => {
  const cases: [string, string[]][] = [
    ['overview', ['/app', '/guide', '/dashboards']],
    ['sales', ['/quick-add', '/deals', '/crm', '/follow-ups', '/sales', '/ctrm']],
    ['documents', ['/quotations', '/quote-followup', '/invoices', '/receivables', '/client-pos', '/delivery-notes', '/customer-files']],
    ['clients', ['/accounts', '/support', '/ctrm-issues', '/client-health', '/client-reports', '/client-updates', '/uniform-sizes']],
    ['delivery', ['/products', '/delivery-settings', '/build-templates', '/agreement-template', '/nda-template', '/clause-library', '/obligations']],
    ['ops', ['/app/wanders', '/catalog', '/inventory', '/purchase-orders', '/projects', '/construction-sites', '/eng-register', '/templates', '/domains']],
    ['finance', ['/payments', '/expenses', '/vendors', '/supplier-advances', '/ledger', '/reports', '/planning-goals', '/mrr', '/insights', '/duplicates']],
    ['hr', ['/hr/people', '/hr/leave', '/hr/attendance']],
    ['payroll', ['/payroll']],
    ['marketing', ['/marketing']],
    ['saasBilling', ['/saas-billing']],
    ['industryPacks', ['/industry-packs', '/country-packs']],
    ['mail', ['/mail']],
  ]
  const on = new Set(visiblePaths('admin'))
  for (const [flag, paths] of cases) {
    it(`${flag} off hides exactly its pages`, () => {
      const off = new Set(visiblePaths('admin', { [flag]: false }))
      for (const p of paths) {
        expect(on.has(p), `${p} shown by default`).toBe(true)
        expect(off.has(p), `${p} hidden by ${flag}`).toBe(false)
      }
      const others = [...on].filter((p) => !paths.includes(p))
      for (const p of others) expect(off.has(p), `${p} unaffected by ${flag}`).toBe(true)
    })
  }

  it('drops a group once all its pages are switched off', () => {
    expect(visibleIds('admin', { finance: false, documents: false })).not.toContain('finance')
    expect(visibleIds('admin', { mail: false, sales: false, clients: false })).not.toContain('connect')
    expect(visibleIds('manager', { overview: false })).not.toContain('overview')
  })

  it('reads the switches from the stored moduleFlags setting too', () => {
    const mods = visibleAppModules('manager', { moduleFlags: '{"ops":false}' })
    const paths = mods.flatMap((m) => m.items.map((i) => i.to))
    expect(paths).not.toContain('/catalog')
    expect(paths).toContain('/support')
  })
})

describe('moduleIdForPath / titleForPath', () => {
  it('maps routes to their group and title', () => {
    expect(moduleIdForPath('/deals')).toBe('sales')
    expect(moduleIdForPath('/accounts/xyz')).toBe('connect')
    expect(moduleIdForPath('/mail')).toBe('connect')
    expect(moduleIdForPath('/invoices/abc')).toBe('finance')
    expect(moduleIdForPath('/client-pos')).toBe('sales')
    expect(moduleIdForPath('/app/wanders')).toBe('ops')
    expect(moduleIdForPath('/app')).toBe('overview')
    expect(moduleIdForPath('/payroll')).toBe('admin')
    expect(titleForPath('/deals')).toBe('Pipeline')
    expect(titleForPath('/crm')).toBe('My Day')
    expect(titleForPath('/follow-ups')).toBe('Follow-ups')
    expect(titleForPath('/accounts/xyz')).toBe('Accounts')
    expect(titleForPath('/about-product')).toBe('About')
    expect(titleForPath('/delivery-settings')).toBe('Packages and rates')
    expect(titleForPath('/insights')).toBe('Utilisation and profit')
  })
})

describe('visibleAppModules by role', () => {
  it('filters admin items by role', () => {
    const sales = visibleAppModules('sales', {})
    const adminItems = sales.find((m) => m.id === 'admin')?.items.map((i) => i.to) || []
    expect(adminItems).toContain('/settings#account')
    expect(adminItems).not.toContain('/settings')
    expect(adminItems).not.toContain('/system-check')
    expect(sales.find((m) => m.id === 'finance')?.items.some((i) => i.to === '/mrr')).toBe(false)
  })

  it('shows Client POs to admin, manager and sales, not to staff', () => {
    expect(visiblePaths('admin')).toContain('/client-pos')
    expect(visiblePaths('manager')).toContain('/client-pos')
    expect(visiblePaths('sales')).toContain('/client-pos')
    expect(visiblePaths('staff')).not.toContain('/client-pos')
  })

  it('shows Supplier advances under Finance > Money out, next to Vendors, not to staff', () => {
    const finance = visibleAppModules('admin', {}).find((m) => m.id === 'finance')?.items || []
    const moneyOut = finance.filter((i) => i.section === 'Money out').map((i) => i.to)
    expect(moneyOut).toEqual(['/expenses', '/vendors', '/supplier-advances'])
    expect(visiblePaths('manager')).toContain('/supplier-advances')
    expect(visiblePaths('sales')).toContain('/supplier-advances')
    expect(visiblePaths('staff')).not.toContain('/supplier-advances')
  })

  it('soft-hides pipeline detail nav for non-admins when the setting is on', () => {
    const sales = visibleAppModules('sales', { [HIDE_PIPELINE_DETAIL_NAV_KEY]: 'yes' })
    const work = sales.find((m) => m.id === 'sales')?.items.map((i) => i.to) || []
    expect(work).not.toContain('/sales')
    expect(work).not.toContain('/ctrm')
    expect(work).toContain('/deals')
  })
})
