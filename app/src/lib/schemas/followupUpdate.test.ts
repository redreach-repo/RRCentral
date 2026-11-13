import { describe, expect, it } from 'vitest'
import { parseFollowupUpdateForm } from './followupUpdate'

const entry = {
  pipeline_stage: 'Lead',
  next_action: 'Call',
  follow_up_date: '2026-11-20',
  outcome_reason: '',
  lost_note: '',
}

describe('parseFollowupUpdateForm', () => {
  it('requires update text', () => {
    const r = parseFollowupUpdateForm({
      update_text: '  ',
      pipeline_stage: '',
      next_action: '',
      follow_up_date: '',
      clearDate: false,
      entry,
    })
    expect(r.ok).toBe(false)
  })

  it('accepts a note that keeps the open deal next step', () => {
    const r = parseFollowupUpdateForm({
      update_text: 'Left a voicemail',
      pipeline_stage: '',
      next_action: '',
      follow_up_date: '',
      clearDate: false,
      entry,
    })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.update_text).toBe('Left a voicemail')
  })
})
