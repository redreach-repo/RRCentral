import { describe, expect, it } from 'vitest'
import { parseMessageTemplateForm } from './messageTemplate'

describe('parseMessageTemplateForm', () => {
  it('requires a name and body', () => {
    const r = parseMessageTemplateForm({
      name: '  ',
      division_code: '',
      channel: 'whatsapp',
      purpose: 'quote_followup',
      subject: '',
      body: '',
      active: true,
    })
    expect(r.ok).toBe(false)
  })

  it('requires subject for email', () => {
    const r = parseMessageTemplateForm({
      name: 'Follow up',
      division_code: '',
      channel: 'email',
      purpose: 'quote_followup',
      subject: '',
      body: 'Hi {{name}}',
      active: true,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/subject/i)
  })

  it('rejects unknown merge fields', () => {
    const r = parseMessageTemplateForm({
      name: 'Follow up',
      division_code: '',
      channel: 'whatsapp',
      purpose: 'quote_followup',
      subject: '',
      body: 'Hi {{nmae}}',
      active: true,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/Unknown merge field/i)
  })

  it('accepts a valid WhatsApp template', () => {
    const r = parseMessageTemplateForm({
      name: 'Follow up',
      division_code: '03',
      channel: 'whatsapp',
      purpose: 'quote_followup',
      subject: '',
      body: 'Hi {{name}}, quote {{quote_number}} for {{amount}}',
      active: true,
    })
    expect(r.ok).toBe(true)
  })
})
