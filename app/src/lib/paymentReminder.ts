import { format, parseISO } from 'date-fns'
import type { ReminderStage } from './contractBilling'
import { normalizePhone } from './whatsapp'

/**
 * One tap payment reminders: who a reminder goes to, the WhatsApp template
 * values and the timeline line. Shared by the app and the payment-reminder
 * Edge Function (bundled by app/scripts/build-support-function.mjs), which
 * also gets the reminder rules and message from contractBilling.ts through
 * the re-exports below. Only pure modules are imported.
 *
 * A reminder is never sent automatically: a person presses Send. Each
 * stage (3, 7, 14 days) goes out once per invoice: the function records it in
 * invoice_reminders (unique invoice and stage) before sending.
 */
export { dueReminder, reminderMessage, REMINDER_STAGES } from './contractBilling'
export { formatAED } from './money'

export type ReminderChannel = 'email' | 'whatsapp'

export type ReminderContact = { id: string; name: string; email: string; phone: string; whatsapp: string; is_primary: boolean }

/**
 * Who a one tap reminder goes to: the chosen contact, else the primary, else
 * the first with an address for that channel. WhatsApp numbers come back as
 * digits with the country code.
 */
export function reminderRecipient<C extends ReminderContact>(
  contacts: C[],
  channel: ReminderChannel,
  contactId?: string | null,
  countryCode = '971',
): { contact: C; to: string } | null {
  const address = (c: C) => {
    if (channel === 'email') {
      const email = String(c.email || '').trim()
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : ''
    }
    const phone = normalizePhone(c.whatsapp || c.phone, countryCode)
    return phone.length >= 10 ? phone : ''
  }
  const ordered = [...contacts].sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
  const pick = contactId ? ordered.filter((c) => c.id === contactId) : ordered
  for (const contact of pick) {
    const to = address(contact)
    if (to) return { contact, to }
  }
  return null
}

/**
 * Values for the WhatsApp template `rr_payment_reminder` (see
 * docs/payment-reminders.md), in order. A reminder starts the conversation,
 * so Meta only allows it through an approved template.
 *   Dear {{1}}, a reminder that invoice {{2}} for {{3}} was due on {{4}} and
 *   is now {{5}} days overdue. If you have already paid, thank you, and please
 *   ignore this message. Best regards, {{6}} accounts team.
 */
export function reminderWhatsAppValues(input: {
  contactName: string
  reference: string
  balanceText: string
  dueDate: string
  daysLate: number
  companyName: string
}): string[] {
  return [
    input.contactName || 'team',
    input.reference,
    input.balanceText,
    format(parseISO(input.dueDate), 'd MMMM yyyy'),
    String(input.daysLate),
    input.companyName,
  ]
}

/** The account timeline line for a sent reminder. */
export function reminderTimelineText(input: {
  stage: ReminderStage
  channel: ReminderChannel
  to: string
  reference: string
  balanceText: string
  sentBy: string
}): string {
  const how = input.channel === 'email' ? 'by email' : 'on WhatsApp'
  return `${input.stage} day payment reminder for ${input.reference} (${input.balanceText} owing) sent ${how} to ${input.to} by ${input.sentBy}`
}
