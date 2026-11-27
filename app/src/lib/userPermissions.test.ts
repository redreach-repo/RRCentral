import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { UserRole } from './types'
import { USER_PERMISSION_KEYS, hasUserPermission, isSalesLocked, rolesWithSwitches } from './userPermissions'

const MIGRATION = join(
  __dirname, '..', '..', '..', 'supabase', 'migrations', '20261332090000_sales_own_clients.sql',
)

describe('per-person switches', () => {
  it('match the check constraint in the migration', () => {
    const sql = readFileSync(MIGRATION, 'utf8')
    const check = sql.match(/check \(permission in \(([^)]*)\)\)/)
    expect(check, 'check constraint on user_permissions.permission').not.toBeNull()
    const inSql = [...(check?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1]).sort()
    expect(inSql).toEqual([...USER_PERMISSION_KEYS].sort())
  })

  it('apply to Sales only', () => {
    expect(rolesWithSwitches()).toEqual(['sales'])
  })
})

describe('isSalesLocked (mirrors rr_sales_locked)', () => {
  const roles: UserRole[] = ['admin', 'manager', 'sales', 'staff', 'viewer']
  for (const role of roles) {
    it(`${role}: ${role === 'sales' ? 'locked' : 'not locked'} without switches`, () => {
      expect(isSalesLocked(role, [])).toBe(role === 'sales')
    })
  }

  it('the company money switch lifts the lock', () => {
    expect(isSalesLocked('sales', ['finance.company'])).toBe(false)
  })

  it('other switches keep the lock', () => {
    expect(isSalesLocked('sales', ['clients.view_all', 'export.csv'])).toBe(true)
  })
})

describe('hasUserPermission', () => {
  it('admins and managers have every switch', () => {
    for (const key of USER_PERMISSION_KEYS) {
      expect(hasUserPermission('admin', [], key)).toBe(true)
      expect(hasUserPermission('manager', [], key)).toBe(true)
    }
  })

  it('sales has only what was switched on', () => {
    expect(hasUserPermission('sales', ['export.csv'], 'export.csv')).toBe(true)
    expect(hasUserPermission('sales', ['export.csv'], 'quotes.margin')).toBe(false)
  })

  it('staff and viewer get nothing by default', () => {
    expect(hasUserPermission('staff', [], 'clients.view_all')).toBe(false)
    expect(hasUserPermission('viewer', [], 'finance.company')).toBe(false)
  })
})
