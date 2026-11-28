import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { UserRole } from './types'
import {
  ALWAYS_SHOWN_PAGES,
  canHidePage,
  canPickPagesFor,
  cleanHiddenPages,
  isPageHidden,
  pagePath,
  toggleGroup,
} from './hiddenPages'
import { APP_MODULES } from '../modules/nav'

const MIGRATION = join(__dirname, '..', '..', '..', 'supabase', 'migrations', '20261336090000_user_hidden_pages.sql')

describe('hidden pages', () => {
  it('page path drops the hash and trailing slash', () => {
    expect(pagePath('/settings#account')).toBe('/settings')
    expect(pagePath('/quotations/')).toBe('/quotations')
  })

  it('Home, Guide and Settings can never be hidden', () => {
    for (const p of ALWAYS_SHOWN_PAGES) expect(canHidePage(p), p).toBe(false)
    expect(canHidePage('/settings#account')).toBe(false)
    expect(canHidePage('/quotations')).toBe(true)
  })

  it('every hideable sidebar link passes the database check', () => {
    const sql = readFileSync(MIGRATION, 'utf8')
    expect(sql).toContain("page_path ~ '^/[a-z0-9/_-]*$'")
    const re = /^\/[a-z0-9/_-]*$/
    for (const item of APP_MODULES.flatMap((m) => m.items)) {
      const path = pagePath(item.to)
      if (ALWAYS_SHOWN_PAGES.includes(path)) continue
      expect(re.test(path) && path.length <= 80, item.to).toBe(true)
    }
  })

  it('cleans what the database returns', () => {
    expect(cleanHiddenPages(['/quotations', '/quotations', '/app', 'javascript:x', '/invoices/'])).toEqual([
      '/quotations',
      '/invoices',
    ])
  })

  it('matches links by page', () => {
    expect(isPageHidden('/quotations', ['/quotations'])).toBe(true)
    expect(isPageHidden('/invoices', ['/quotations'])).toBe(false)
    expect(isPageHidden('/app', ['/app'])).toBe(false)
  })

  it('ticking a group shows all its pages, unticking hides all', () => {
    expect(toggleGroup(['/a', '/b', '/c'], ['/a', '/b'], true)).toEqual(['/c'])
    expect(toggleGroup(['/c'], ['/a', '/b', '/app'], false).sort()).toEqual(['/a', '/b', '/c'])
  })

  it('applies to every role but admin', () => {
    const roles: UserRole[] = ['admin', 'manager', 'sales', 'staff', 'viewer']
    expect(roles.filter(canPickPagesFor)).toEqual(['manager', 'sales', 'staff', 'viewer'])
  })
})
