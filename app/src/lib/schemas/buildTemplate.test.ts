import { describe, expect, it } from 'vitest'
import { parseBuildTemplateForm, parseBuildTemplateItemForm } from './buildTemplate'

describe('parseBuildTemplateForm', () => {
  it('requires a name', () => {
    const r = parseBuildTemplateForm({ name: '  ', description: '', package_id: '', active: true })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toMatch(/name/i)
  })

  it('nulls empty package_id', () => {
    const r = parseBuildTemplateForm({ name: 'Starter', description: ' x ', package_id: '', active: true })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.package_id).toBeNull()
    expect(r.data.description).toBe('x')
  })
})

describe('parseBuildTemplateItemForm', () => {
  it('requires a title', () => {
    const r = parseBuildTemplateItemForm({
      kind: 'task',
      stage: 'build',
      title: '  ',
      detail: '',
      hours: '2',
      owner: 'red_reach',
      dueDays: '',
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toMatch(/title/i)
  })

  it('rejects bad hours', () => {
    const r = parseBuildTemplateItemForm({
      kind: 'task',
      stage: 'build',
      title: 'Logo',
      detail: '',
      hours: 'x',
      owner: 'red_reach',
      dueDays: '',
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toMatch(/Hours/i)
  })

  it('validates go-live due days', () => {
    const r = parseBuildTemplateItemForm({
      kind: 'golive',
      stage: 'live',
      title: 'Go live',
      detail: '',
      hours: '',
      owner: 'red_reach',
      dueDays: '',
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toMatch(/days/i)
  })

  it('accepts a go-live item', () => {
    const r = parseBuildTemplateItemForm({
      kind: 'golive',
      stage: 'live',
      title: 'Go live',
      detail: ' ship ',
      hours: '',
      owner: 'client',
      dueDays: '14',
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.due_days).toBe(14)
    expect(r.data.detail).toBe('ship')
    expect(r.data.est_hours).toBe(0)
  })
})
