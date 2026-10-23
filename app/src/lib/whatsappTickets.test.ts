import { describe, expect, it } from 'vitest'
import {
  messageText,
  nextDeliveryStatus,
  parseWebhook,
  phoneMatches,
  serviceWindow,
  textMessagePayload,
  ticketSubject,
  validSignature,
} from './whatsappTickets'

const webhook = {
  object: 'whatsapp_business_account',
  entry: [
    {
      id: 'WABA',
      changes: [
        {
          field: 'messages',
          value: {
            messaging_product: 'whatsapp',
            metadata: { display_phone_number: '97140000000', phone_number_id: 'PNID' },
            contacts: [{ profile: { name: 'Sara' }, wa_id: '971501234567' }],
            messages: [
              { from: '971501234567', id: 'wamid.A', timestamp: '1792771200', type: 'text', text: { body: 'Hi\nReminders stopped' } },
              { from: '971501234567', id: 'wamid.B', timestamp: '1792771260', type: 'image', image: { caption: 'Screenshot' } },
              { from: '971501234567', id: 'wamid.C', timestamp: '1792771270', type: 'reaction', reaction: { emoji: '👍' } },
            ],
            statuses: [
              { id: 'wamid.OUT', status: 'read', timestamp: '1792771300', recipient_id: '971501234567' },
              {
                id: 'wamid.OUT2',
                status: 'failed',
                errors: [{ code: 131047, title: 'Re-engagement message', error_data: { details: 'More than 24 hours' } }],
              },
              { id: 'wamid.OUT3', status: 'deleted' },
            ],
          },
        },
      ],
    },
  ],
}

describe('whatsappTickets', () => {
  it('reads messages and delivery updates from the webhook', () => {
    const { messages, statuses } = parseWebhook(webhook)
    expect(messages).toHaveLength(2)
    expect(messages[0]).toEqual({
      wamid: 'wamid.A',
      from: '971501234567',
      name: 'Sara',
      sentAt: new Date(1792771200 * 1000).toISOString(),
      body: 'Hi\nReminders stopped',
      phoneNumberId: 'PNID',
    })
    expect(messages[1].body).toBe('[Photo: Screenshot] Open WhatsApp to see it.')
    expect(statuses).toEqual([
      { wamid: 'wamid.OUT', status: 'read', error: '' },
      { wamid: 'wamid.OUT2', status: 'failed', error: 'More than 24 hours' },
    ])
    expect(parseWebhook(null)).toEqual({ messages: [], statuses: [] })
    expect(parseWebhook({ entry: 'x' })).toEqual({ messages: [], statuses: [] })
  })

  it('shows other message types as plain notes', () => {
    expect(messageText({ type: 'location', location: { latitude: 25.2, longitude: 55.3, name: 'Clinic' } })).toBe(
      '[Location: Clinic] 25.2,55.3',
    )
    expect(messageText({ type: 'interactive', interactive: { button_reply: { title: 'Yes' } } })).toBe('Yes')
    expect(messageText({ type: 'something_new' })).toMatch(/cannot show/)
    expect(messageText({ type: 'system' })).toBeNull()
  })

  it('never moves a delivery status backwards', () => {
    expect(nextDeliveryStatus('sent', 'delivered')).toBe('delivered')
    expect(nextDeliveryStatus('read', 'delivered')).toBeNull()
    expect(nextDeliveryStatus('', 'sent')).toBe('sent')
    expect(nextDeliveryStatus('delivered', 'failed')).toBe('failed')
    expect(nextDeliveryStatus('failed', 'read')).toBeNull()
  })

  it('matches saved numbers in any common format', () => {
    expect(phoneMatches('050 123 4567', '971501234567')).toBe(true)
    expect(phoneMatches('+971 50 123 4567', '971501234567')).toBe(true)
    expect(phoneMatches('00971501234567', '971501234567')).toBe(true)
    expect(phoneMatches('', '971501234567')).toBe(false)
    expect(phoneMatches('055 123 4567', '971501234567')).toBe(false)
  })

  it('makes a subject from the first line', () => {
    expect(ticketSubject('\n  Reminders stopped working \nsince Monday')).toBe('Reminders stopped working')
    expect(ticketSubject('[Photo] Open WhatsApp to see it.')).toBe('WhatsApp message')
    expect(ticketSubject('x'.repeat(100))).toHaveLength(80)
  })

  it('knows when the 24 hour reply window is open', () => {
    const now = new Date('2026-11-03T12:00:00Z')
    expect(serviceWindow('2026-11-02T13:00:00Z', now)).toEqual({ open: true, closesAt: '2026-11-03T13:00:00.000Z' })
    expect(serviceWindow('2026-11-02T11:00:00Z', now).open).toBe(false)
    expect(serviceWindow(null, now)).toEqual({ open: false, closesAt: null })
  })

  it('builds the send request', () => {
    expect(textMessagePayload('+971 50 123 4567', 'Hello')).toEqual({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: '971501234567',
      type: 'text',
      text: { body: 'Hello', preview_url: false },
    })
  })

  it('checks Meta signatures', async () => {
    const body = '{"entry":[]}'
    // HMAC-SHA256 of body with key "secret".
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('secret'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)))
    const hex = [...mac].map((b) => b.toString(16).padStart(2, '0')).join('')
    expect(await validSignature(body, `sha256=${hex}`, 'secret')).toBe(true)
    expect(await validSignature(body + ' ', `sha256=${hex}`, 'secret')).toBe(false)
    expect(await validSignature(body, `sha256=${hex}`, 'other')).toBe(false)
    expect(await validSignature(body, '', 'secret')).toBe(false)
    expect(await validSignature(body, `sha256=${hex}`, '')).toBe(false)
  })
})
