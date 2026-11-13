import { describe, expect, it } from 'vitest'
import { parseGoLiveStepForm } from './goLiveStep'

describe('parseGoLiveStepForm', () => {
  it('requires a title', () => {
    const r = parseGoLiveStepForm({ stage: 'live', title: '  ', owner: 'red_reach', due: '' })
    expect(r.ok).toBe(false)
  })

  it('accepts a valid step', () => {
    const r = parseGoLiveStepForm({
      stage: 'live',
      title: 'Cutover',
      owner: 'client',
      due: '2026-12-01',
    })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.due_date).toBe('2026-12-01')
  })
})
