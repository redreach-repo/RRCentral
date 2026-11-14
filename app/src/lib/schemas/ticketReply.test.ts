import { describe, expect, it } from 'vitest'
import { parseTicketReplyForm } from './ticketReply'

describe('parseTicketReplyForm', () => {
  it('rejects blank body', () => {
    const r = parseTicketReplyForm({ body: '   ', internal: false })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toMatch(/reply/i)
  })

  it('trims body and keeps internal flag', () => {
    const r = parseTicketReplyForm({ body: '  Looking into this  ', internal: true })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.body).toBe('Looking into this')
    expect(r.data.internal).toBe(true)
  })
})
