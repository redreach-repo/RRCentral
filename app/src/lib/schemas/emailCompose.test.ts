import { describe, expect, it } from 'vitest'
import { parseEmailComposeForm } from './emailCompose'

describe('parseEmailComposeForm', () => {
  it('rejects blank recipient', () => {
    const r = parseEmailComposeForm({ to: '  ', subject: 'Hi', body: 'Body' })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toMatch(/recipient/i)
  })

  it('rejects invalid recipient', () => {
    const r = parseEmailComposeForm({ to: 'not-an-email', subject: 'Hi', body: 'Body' })
    expect(r.ok).toBe(false)
  })

  it('trims fields', () => {
    const r = parseEmailComposeForm({
      to: '  client@example.com  ',
      subject: '  Hello  ',
      body: '  Notes  ',
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data).toEqual({
      to: 'client@example.com',
      subject: 'Hello',
      body: 'Notes',
    })
  })
})
