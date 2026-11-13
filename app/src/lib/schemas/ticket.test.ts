import { describe, expect, it } from 'vitest'
import { parseTicketForm } from './ticket'

const base = {
  accountId: 'acc-1',
  contactId: null as string | null,
  subject: 'Bot stopped replying',
  details: 'Client WhatsApp silent since yesterday',
  channel: 'whatsapp' as const,
  priority: 'normal' as const,
  assigneeUserId: null as string | null,
}

describe('parseTicketForm', () => {
  it('accepts a valid ticket', () => {
    const parsed = parseTicketForm(base)
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.data.subject).toBe('Bot stopped replying')
      expect(parsed.data.channel).toBe('whatsapp')
    }
  })

  it('rejects a missing account', () => {
    const parsed = parseTicketForm({ ...base, accountId: '' })
    expect(parsed.ok).toBe(false)
    if (!parsed.ok) expect(parsed.error).toMatch(/client or church/i)
  })

  it('rejects a blank subject', () => {
    const parsed = parseTicketForm({ ...base, subject: '   ' })
    expect(parsed.ok).toBe(false)
    if (!parsed.ok) expect(parsed.error).toMatch(/subject/i)
  })

  it('rejects an unknown channel', () => {
    const parsed = parseTicketForm({ ...base, channel: 'carrier_pigeon' as 'email' })
    expect(parsed.ok).toBe(false)
  })

  it('normalizes empty contact and assignee to null', () => {
    const parsed = parseTicketForm({ ...base, contactId: '  ', assigneeUserId: '' })
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.data.contactId).toBeNull()
      expect(parsed.data.assigneeUserId).toBeNull()
    }
  })
})
