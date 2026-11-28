import { describe, expect, it } from 'vitest'
import type { UserRole } from '../lib/types'
import { commandPaletteItems } from '../lib/commandPalette'
import { pathAllowed, visibleAppModules } from './nav'
import { pickablePageGroups } from './pagePicker'

function seen(role: UserRole, hidden: string[], locked = false): Set<string> {
  return new Set(
    visibleAppModules(role, {}, undefined, undefined, locked, hidden).flatMap((m) => m.items.map((i) => i.to.split('#')[0])),
  )
}

describe('pages an admin hid from a person', () => {
  it('leave the sidebar for each role but admin', () => {
    const cases: [UserRole, string][] = [
      ['manager', '/hr/people'],
      ['sales', '/quotations'],
      ['staff', '/support'],
      ['viewer', '/invoices'],
    ]
    for (const [role, page] of cases) {
      expect(seen(role, []).has(page), `${role} sees ${page} by default`).toBe(true)
      expect(seen(role, [page]).has(page), `${role} with ${page} hidden`).toBe(false)
    }
  })

  it('never hide anything from an admin', () => {
    expect(seen('admin', ['/quotations', '/invoices']).has('/quotations')).toBe(true)
  })

  it('cannot hide Home or Settings', () => {
    const s = seen('manager', ['/app', '/settings'])
    expect(s.has('/app')).toBe(true)
    expect(s.has('/settings')).toBe(true)
  })

  it('drop a group when all its pages are hidden', () => {
    const finance = visibleAppModules('manager', {}).find((m) => m.id === 'finance')
    const all = (finance?.items ?? []).map((i) => i.to)
    const groups = visibleAppModules('manager', {}, undefined, undefined, false, all).map((m) => m.id)
    expect(groups).not.toContain('finance')
  })

  it('block typed addresses, sub pages too', () => {
    expect(pathAllowed('/quotations', 'sales', {}, false, undefined, ['/quotations'])).toBe(false)
    expect(pathAllowed('/quotations/abc', 'sales', {}, false, undefined, ['/quotations'])).toBe(false)
    expect(pathAllowed('/invoices', 'sales', {}, false, undefined, ['/quotations'])).toBe(true)
    expect(pathAllowed('/quotations', 'admin', {}, false, undefined, ['/quotations'])).toBe(true)
  })

  it('leave Cmd+K too', () => {
    const items = commandPaletteItems('sales', {}, undefined, false, ['/quotations']).map((i) => i.to)
    expect(items).not.toContain('/quotations')
    expect(items).toContain('/invoices')
  })

  it('still respect the Sales lock (hiding never opens money pages)', () => {
    expect(seen('sales', [], true).has('/expenses')).toBe(false)
  })
})

describe('page picker groups', () => {
  it('list the pages of the role, without Home, Guide or Settings', () => {
    const groups = pickablePageGroups('sales', {})
    const pages = groups.flatMap((g) => g.pages.map((p) => p.path))
    expect(pages).toContain('/quotations')
    expect(pages).not.toContain('/app')
    expect(pages).not.toContain('/settings')
    expect(new Set(pages).size).toBe(pages.length)
  })

  it('staff only get the pages staff can open', () => {
    const pages = pickablePageGroups('staff', {}).flatMap((g) => g.pages.map((p) => p.path))
    expect(pages).toContain('/support')
    expect(pages).not.toContain('/quotations')
  })
})
