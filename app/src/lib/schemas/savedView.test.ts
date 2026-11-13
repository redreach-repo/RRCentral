import { describe, expect, it } from 'vitest'
import { parseSavedViewForm } from './savedView'

describe('parseSavedViewForm', () => {
  it('requires a name', () => {
    const r = parseSavedViewForm({
      name: '  ',
      module_id: 'crm',
      filters: { q: 'x' },
      owner_user_id: null,
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toMatch(/Name/i)
  })

  it('accepts a named view', () => {
    const r = parseSavedViewForm({
      name: ' My open ',
      module_id: 'crm',
      filters: { stage: 'open' },
      owner_user_id: 'u1',
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.name).toBe('My open')
    expect(r.data.is_shared).toBe(false)
  })
})
