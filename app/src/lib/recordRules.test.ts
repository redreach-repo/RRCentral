import { describe, expect, it } from 'vitest'
import { recordVisible } from './recordRules'

describe('recordRules', () => {
  it('allows all when no rules', () => {
    expect(recordVisible([], 'deal', { owner_email: 'a@x.com' }, { email: 'b@x.com' })).toBe(true)
  })

  it('owner scope filters', () => {
    const rules = [{ object_type: 'deal', scope: 'owner', active: true }]
    expect(
      recordVisible(rules, 'deal', { owner_email: 'a@x.com' }, { email: 'a@x.com' }),
    ).toBe(true)
    expect(
      recordVisible(rules, 'deal', { owner_email: 'a@x.com' }, { email: 'b@x.com' }),
    ).toBe(false)
    expect(
      recordVisible(rules, 'deal', { owner_email: 'a@x.com' }, { email: 'b@x.com', role: 'admin' }),
    ).toBe(true)
  })
})
