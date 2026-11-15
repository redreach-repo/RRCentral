import { describe, expect, it } from 'vitest'
import { isSoftDeleted, withoutSoftDeleted } from './softDelete'

describe('softDelete', () => {
  it('filters deleted rows', () => {
    expect(isSoftDeleted({})).toBe(false)
    expect(isSoftDeleted({ deleted_at: '2026-01-01' })).toBe(true)
    expect(
      withoutSoftDeleted([{ id: 1 }, { id: 2, deleted_at: 'x' }, { id: 3, deleted_at: null }]).map(
        (r) => r.id,
      ),
    ).toEqual([1, 3])
  })
})
