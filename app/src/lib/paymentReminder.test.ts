import { describe, expect, it } from 'vitest'
import { reminderRecipient, reminderTimelineText, reminderWhatsAppValues } from './paymentReminder'
import { roleAtLeast } from './permissions'
import type { UserRole } from './types'

const contact = (over: Partial<Parameters<typeof reminderRecipient>[0][number]>) => ({
  id: 'c',
  name: 'Dana',
  email: '',
  phone: '',
  whatsapp: '',
  is_primary: false,
  ...over,
})

describe('who a one tap reminder goes to', () => {
  const people = [
    contact({ id: 'a', name: 'Accounts', email: 'accounts@clinic.ae', phone: '04 123 4567' }),
    contact({ id: 'p', name: 'Dana', email: 'dana@clinic.ae', whatsapp: '050 123 4567', is_primary: true }),
    contact({ id: 'x', name: 'No address', email: 'not an email' }),
  ]

  it('the primary contact first', () => {
    expect(reminderRecipient(people, 'email')).toMatchObject({ to: 'dana@clinic.ae', contact: { id: 'p' } })
    expect(reminderRecipient(people, 'whatsapp')?.to).toBe('971501234567')
  })

  it('the chosen contact, or nobody when they have no address for that channel', () => {
    expect(reminderRecipient(people, 'email', 'a')?.to).toBe('accounts@clinic.ae')
    expect(reminderRecipient(people, 'email', 'x')).toBeNull()
  })

  it('skips contacts without a usable address', () => {
    expect(reminderRecipient([people[2]], 'email')).toBeNull()
    expect(reminderRecipient([contact({ whatsapp: '123' })], 'whatsapp')).toBeNull()
    expect(reminderRecipient([], 'whatsapp')).toBeNull()
  })
})

describe('message parts', () => {
  const parts = {
    contactName: '',
    reference: 'RR-03-26010',
    balanceText: 'AED 1,050.00',
    dueDate: '2026-10-27',
    daysLate: 14,
    companyName: 'Red Reach Middle East FZE',
  }

  it('WhatsApp template values, in order', () => {
    expect(reminderWhatsAppValues(parts)).toEqual(['team', 'RR-03-26010', 'AED 1,050.00', '27 October 2026', '14', 'Red Reach Middle East FZE'])
  })

  it('timeline line names the channel, the address and who sent it', () => {
    expect(
      reminderTimelineText({ stage: 14, channel: 'whatsapp', to: '971501234567', reference: 'RR-03-26010', balanceText: 'AED 1,050.00', sentBy: 'sara@redreach.ae' }),
    ).toBe('14 day payment reminder for RR-03-26010 (AED 1,050.00 owing) sent on WhatsApp to 971501234567 by sara@redreach.ae')
  })
})

describe('who sees the Send buttons (same roles the function and RLS allow)', () => {
  const expected: Record<UserRole, boolean> = { admin: true, manager: true, sales: true, staff: false, viewer: false }
  for (const [role, allowed] of Object.entries(expected) as [UserRole, boolean][]) {
    it(`${role} ${allowed ? 'can' : 'cannot'} send payment reminders`, () => {
      expect(roleAtLeast(role, 'sales')).toBe(allowed)
    })
  }
})
