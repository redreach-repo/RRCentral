import { describe, expect, it } from 'vitest'
import { obligationIsOverdue } from './obligationBoard'

describe('obligationIsOverdue', () => {
  it('flags open items past due', () => {
    expect(obligationIsOverdue({ status: 'open', due_date: '2026-01-01' }, '2026-11-13')).toBe(true)
    expect(obligationIsOverdue({ status: 'open', due_date: '2026-12-01' }, '2026-11-13')).toBe(false)
    expect(obligationIsOverdue({ status: 'done', due_date: '2026-01-01' }, '2026-11-13')).toBe(false)
    expect(obligationIsOverdue({ status: 'open', due_date: null }, '2026-11-13')).toBe(false)
  })
})
