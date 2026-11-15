import { describe, expect, it } from 'vitest'
import { withoutSoftDeleted } from './softDelete'

describe('crm soft-delete filter', () => {
  it('drops rows with deleted_at set', () => {
    const rows = [
      { id: 'a', deleted_at: null },
      { id: 'b', deleted_at: '2026-11-15T00:00:00Z' },
      { id: 'c' },
    ]
    expect(withoutSoftDeleted(rows).map((r) => r.id)).toEqual(['a', 'c'])
  })
})
