import { describe, expect, it } from 'vitest'
import { canEditField, canViewField, visibleFields } from './fieldPermissions'

describe('fieldPermissions', () => {
  it('gates CTRM commission like ctrm.commission', () => {
    expect(canViewField('sales', 'ctrm.commission')).toBe(true)
    expect(canViewField('staff', 'ctrm.commission')).toBe(false)
    expect(canViewField('viewer', 'ctrm.commission')).toBe(false)
  })

  it('gates finance profit to managers and admins', () => {
    expect(canViewField('admin', 'finance.profit')).toBe(true)
    expect(canViewField('manager', 'finance.profit')).toBe(true)
    expect(canViewField('sales', 'finance.profit')).toBe(false)
  })

  it('requires write for vendor.trn edits; viewAll may only view', () => {
    expect(canViewField('staff', 'vendor.trn')).toBe(true) // accounts.write
    expect(canEditField('staff', 'vendor.trn')).toBe(true)
    expect(canViewField('viewer', 'vendor.trn')).toBe(true) // accounts.viewAll
    expect(canEditField('viewer', 'vendor.trn')).toBe(false)
  })

  it('lists visible fields for sales without profit keys', () => {
    const keys = visibleFields('sales')
    expect(keys).toContain('ctrm.commission')
    expect(keys).not.toContain('finance.profit')
    expect(keys).not.toContain('delivery.profitability')
  })

  it('gates delivery.profitability like finance.profit roles', () => {
    expect(canViewField('admin', 'delivery.profitability')).toBe(true)
    expect(canViewField('manager', 'delivery.profitability')).toBe(true)
    expect(canViewField('sales', 'delivery.profitability')).toBe(false)
  })
})
