import { describe, expect, it } from 'vitest'
import { can, normalizeUserRole, roleAtLeast } from './permissions'

describe('permissions hierarchy', () => {
  it('normalizes unknown roles to sales', () => {
    expect(normalizeUserRole('admin')).toBe('admin')
    expect(normalizeUserRole('manager')).toBe('manager')
    expect(normalizeUserRole('sales')).toBe('sales')
    expect(normalizeUserRole('owner')).toBe('sales')
    expect(normalizeUserRole(null)).toBe('sales')
  })

  it('gives admin Settings and finance deletes', () => {
    expect(can('admin', 'settings.manage')).toBe(true)
    expect(can('admin', 'users.manage')).toBe(true)
    expect(can('admin', 'invoice.delete')).toBe(true)
    expect(can('admin', 'invoice.markPaid')).toBe(true)
    expect(can('admin', 'expense.delete')).toBe(true)
    expect(can('admin', 'audit.read')).toBe(true)
  })

  it('gives manager pipeline power without Settings', () => {
    expect(can('manager', 'settings.manage')).toBe(false)
    expect(can('manager', 'users.manage')).toBe(false)
    expect(can('manager', 'audit.read')).toBe(false)
    expect(can('manager', 'invoice.delete')).toBe(false)
    expect(can('manager', 'crm.reassignOwner')).toBe(true)
    expect(can('manager', 'crm.deleteAny')).toBe(true)
    expect(can('manager', 'quote.deleteAny')).toBe(true)
    expect(can('manager', 'crm.viewAll')).toBe(true)
  })

  it('limits sales to day-to-day work', () => {
    expect(can('sales', 'settings.manage')).toBe(false)
    expect(can('sales', 'invoice.delete')).toBe(false)
    expect(can('sales', 'invoice.markPaid')).toBe(false)
    expect(can('sales', 'crm.reassignOwner')).toBe(false)
    expect(can('sales', 'crm.viewAll')).toBe(false)
    expect(can('sales', 'finance.reports')).toBe(true)
  })

  it('orders roles admin > manager > sales', () => {
    expect(roleAtLeast('admin', 'manager')).toBe(true)
    expect(roleAtLeast('manager', 'manager')).toBe(true)
    expect(roleAtLeast('sales', 'manager')).toBe(false)
    expect(roleAtLeast('manager', 'admin')).toBe(false)
  })
})
