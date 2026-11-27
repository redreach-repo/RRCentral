import { describe, expect, it } from 'vitest'
import { pathAllowed, visibleAppModules } from './nav'

/** PR 2 of the Sales lockdown: money pages leave the sidebar and the address bar for locked Sales. */
const MONEY = ['/receivables', '/payments', '/expenses', '/vendors', '/supplier-advances', '/reports', '/purchase-orders']
const SALES_WORK = ['/crm', '/accounts', '/quotations', '/invoices', '/delivery-notes', '/client-pos', '/projects']

function paths(locked: boolean): Set<string> {
  return new Set(visibleAppModules('sales', {}, undefined, undefined, locked).flatMap((m) => m.items.map((i) => i.to)))
}

describe('Sales lock in the sidebar', () => {
  it('locked Sales do not see money pages', () => {
    const seen = paths(true)
    for (const p of MONEY) expect(seen.has(p), p).toBe(false)
  })

  it('locked Sales keep their own sales work, including Projects', () => {
    const seen = paths(true)
    for (const p of SALES_WORK) expect(seen.has(p), p).toBe(true)
  })

  it('Sales with the company money switch see the money pages again', () => {
    const seen = paths(false)
    expect(seen.has('/receivables')).toBe(true)
    expect(seen.has('/expenses')).toBe(true)
  })

  it('admins are never affected by the lock flag', () => {
    const seen = new Set(visibleAppModules('admin', {}, undefined, undefined, true).flatMap((m) => m.items.map((i) => i.to)))
    expect(seen.has('/expenses')).toBe(false)
    const unlocked = new Set(visibleAppModules('admin', {}).flatMap((m) => m.items.map((i) => i.to)))
    expect(unlocked.has('/expenses')).toBe(true)
  })
})

describe('pathAllowed (typed addresses)', () => {
  it('blocks money pages for locked Sales, with or without a sub path', () => {
    expect(pathAllowed('/expenses', 'sales', {}, true)).toBe(false)
    expect(pathAllowed('/payments/123', 'sales', {}, true)).toBe(false)
  })

  it('lets locked Sales open their own pages', () => {
    expect(pathAllowed('/quotations', 'sales', {}, true)).toBe(true)
    expect(pathAllowed('/invoices', 'sales', {}, true)).toBe(true)
  })

  it('allows pages that are not in the sidebar', () => {
    expect(pathAllowed('/profile', 'sales', {}, true)).toBe(true)
  })

  it('managers reach the money pages', () => {
    expect(pathAllowed('/expenses', 'manager', {}, false)).toBe(true)
  })
})
