import { describe, expect, it } from 'vitest'
import { parseBuildTaskForm } from './buildTask'

describe('parseBuildTaskForm', () => {
  it('requires a title', () => {
    expect(parseBuildTaskForm({ stage: 'build', title: ' ', hours: '' }).ok).toBe(false)
  })

  it('rejects bad hours', () => {
    const r = parseBuildTaskForm({ stage: 'build', title: 'Wire CRM', hours: 'x' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/Hours/i)
  })

  it('defaults blank hours to 0', () => {
    const r = parseBuildTaskForm({ stage: 'build', title: 'Wire CRM', hours: '' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.est_hours).toBe(0)
  })
})
