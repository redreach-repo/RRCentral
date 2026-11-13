import { describe, expect, it } from 'vitest'
import { parseCrmLogTouchForm } from './crmLogTouch'

describe('parseCrmLogTouchForm', () => {
  it('requires what happened', () => {
    const r = parseCrmLogTouchForm({
      text: '  ',
      follow_up_date: '2026-11-20',
      clearDate: false,
      pipeline_stage: 'Lead',
      next_action: 'Call',
    })
    expect(r.ok).toBe(false)
  })

  it('clears the follow-up date when asked', () => {
    const r = parseCrmLogTouchForm({
      text: 'Left a voicemail',
      follow_up_date: '2026-11-20',
      clearDate: true,
      pipeline_stage: 'Lead',
      next_action: 'Call back',
    })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.follow_up_date).toBeNull()
  })
})
