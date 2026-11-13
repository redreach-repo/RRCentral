import { describe, expect, it } from 'vitest'
import { parseSupportPoliciesForm, parseSupportWeekForm } from './supportSettings'

describe('parseSupportPoliciesForm', () => {
  it('parses non-negative hours', () => {
    const r = parseSupportPoliciesForm([
      { id: 'a', label: 'Package A', hours: '8' },
      { id: 'b', label: 'VIP', hours: '0' },
    ])
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data).toEqual([
      { id: 'a', label: 'Package A', first_response_hours: 8 },
      { id: 'b', label: 'VIP', first_response_hours: 0 },
    ])
  })

  it('rejects invalid hours with label in message', () => {
    const r = parseSupportPoliciesForm([{ id: 'a', label: 'Package A', hours: 'x' }])
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toMatch(/Package A/)
  })
})

describe('parseSupportWeekForm', () => {
  it('accepts a valid week and sorts days', () => {
    const r = parseSupportWeekForm({ days: [5, 1, 3], start: '09:00', end: '18:00' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.days).toEqual([1, 3, 5])
  })

  it('requires at least one day', () => {
    const r = parseSupportWeekForm({ days: [], start: '09:00', end: '18:00' })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toMatch(/working day/i)
  })

  it('requires open before close', () => {
    const r = parseSupportWeekForm({ days: [1], start: '18:00', end: '09:00' })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toMatch(/Opening time/i)
  })
})
