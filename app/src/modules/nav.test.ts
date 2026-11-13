import { describe, expect, it } from 'vitest'
import { APP_MODULES, moduleIdForPath, titleForPath } from './nav'

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
