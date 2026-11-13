import { describe, expect, it } from 'vitest'
import { parsePipelineStageForm } from './pipelineStage'

describe('parsePipelineStageForm', () => {
  it('accepts a labelled stage', () => {
    const r = parsePipelineStageForm({
      label: '  Qualified  ',
      color: '#112233',
      outcome: 'open',
      sort_order: 10,
      active: true,
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.label).toBe('Qualified')
    expect(r.data.outcome).toBe('open')
  })

  it('requires a label', () => {
    const r = parsePipelineStageForm({
      label: '   ',
      color: '#112233',
      outcome: 'open',
      sort_order: 0,
      active: true,
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toMatch(/Label/i)
  })

  it('rejects unknown outcomes', () => {
    const r = parsePipelineStageForm({
      label: 'X',
      color: '',
      outcome: 'maybe',
      sort_order: 0,
      active: true,
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toMatch(/outcome/i)
  })
})
