import { describe, expect, it } from 'vitest'
import { parseDeliveryRequirementForm } from './deliveryRequirement'

describe('parseDeliveryRequirementForm', () => {
  it('rejects blank title', () => {
    const r = parseDeliveryRequirementForm({ title: '  ', detail: 'notes' })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toMatch(/title/i)
  })

  it('trims title and detail', () => {
    const r = parseDeliveryRequirementForm({ title: '  Portal login  ', detail: '  from call  ' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data).toEqual({ title: 'Portal login', detail: 'from call' })
  })
})
