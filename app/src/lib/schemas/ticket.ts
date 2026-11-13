import { z } from 'zod'
import { TICKET_CHANNELS, TICKET_PRIORITIES } from '../support'
import type { TicketChannel, TicketPriority } from '../types'
import { firstZodError } from './common'

const CHANNEL_VALUES = TICKET_CHANNELS.map((c) => c.value) as [TicketChannel, ...TicketChannel[]]
const PRIORITY_VALUES = TICKET_PRIORITIES.map((p) => p.value) as [TicketPriority, ...TicketPriority[]]

export type TicketFormInput = {
  accountId: string
  contactId: string | null
  subject: string
  details: string
  channel: TicketChannel
  priority: TicketPriority
  assigneeUserId: string | null
}

export const ticketFormSchema = z.object({
  accountId: z.string().trim().min(1, 'Pick a client or church'),
  contactId: z.string().trim().nullable(),
  subject: z.string().trim().min(1, 'Enter a subject'),
  details: z.string(),
  channel: z.enum(CHANNEL_VALUES),
  priority: z.enum(PRIORITY_VALUES),
  assigneeUserId: z.string().trim().nullable(),
})

export function parseTicketForm(
  input: TicketFormInput,
): { ok: true; data: TicketFormInput } | { ok: false; error: string } {
  const result = ticketFormSchema.safeParse({
    ...input,
    contactId: input.contactId?.trim() ? input.contactId.trim() : null,
    assigneeUserId: input.assigneeUserId?.trim() ? input.assigneeUserId.trim() : null,
  })
  if (!result.success) {
    return { ok: false, error: firstZodError(result.error, 'Check the ticket form') }
  }
  return {
    ok: true,
    data: {
      accountId: result.data.accountId,
      contactId: result.data.contactId,
      subject: result.data.subject,
      details: result.data.details,
      channel: result.data.channel,
      priority: result.data.priority,
      assigneeUserId: result.data.assigneeUserId,
    },
  }
}
