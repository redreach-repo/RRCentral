import { describe, expect, it } from 'vitest'
import { isAskRrPath } from '../components/CrmAskHost'

describe('isAskRrPath', () => {
  it('matches Sales CRM routes', () => {
    expect(isAskRrPath('/crm')).toBe(true)
    expect(isAskRrPath('/quotations')).toBe(true)
    expect(isAskRrPath('/follow-ups')).toBe(true)
    expect(isAskRrPath('/invoices')).toBe(true)
    expect(isAskRrPath('/delivery-notes')).toBe(true)
    expect(isAskRrPath('/customer-files')).toBe(true)
    expect(isAskRrPath('/quick-add')).toBe(true)
  })

  it('does not match unrelated app routes', () => {
    expect(isAskRrPath('/app')).toBe(false)
    expect(isAskRrPath('/accounts')).toBe(false)
    expect(isAskRrPath('/sales')).toBe(false)
    expect(isAskRrPath('/settings')).toBe(false)
  })
})
