import { describe, expect, it } from 'vitest'
import type { UserRole } from '../lib/types'
import { visibleAppModules } from './nav'

/** Role access for the sidebar: sensitive pages only show to the right roles. */
const ROLES: UserRole[] = ['admin', 'manager', 'sales', 'staff', 'viewer']

const MANAGER_UP = ['/hr/people', '/hr/leave', '/hr/attendance', '/payroll', '/ledger', '/approvals', '/mrr']
const ADMIN_ONLY = ['/settings', '/audit-log', '/public-api', '/ai-connector', '/app-errors', '/system-check', '/dsr', '/theme-studio', '/saas-billing']

function visiblePaths(role: UserRole): Set<string> {
  return new Set(visibleAppModules(role, {}).flatMap((m) => m.items.map((i) => i.to)))
}

describe('sidebar role access', () => {
  for (const role of ROLES) {
    const seen = visiblePaths(role)
    const isManagerUp = role === 'admin' || role === 'manager'

    it(`${role}: HR, payroll and finance admin pages ${isManagerUp ? 'shown' : 'hidden'}`, () => {
      for (const path of MANAGER_UP) expect(seen.has(path), `${role} ${path}`).toBe(isManagerUp)
    })

    it(`${role}: admin pages ${role === 'admin' ? 'shown' : 'hidden'}`, () => {
      for (const path of ADMIN_ONLY) expect(seen.has(path), `${role} ${path}`).toBe(role === 'admin')
    })
  }
})
