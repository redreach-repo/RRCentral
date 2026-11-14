import { z } from 'zod'
import { firstZodError } from './common'

export type TicketReplyFormInput = {
  body: string
  internal: boolean
}

export type TicketReplyFormParsed = {
  body: string
  internal: boolean
}

export const ticketReplyFormSchema = z.object({
  body: z.string().trim().min(1, 'Write a reply first'),
  internal: z.boolean(),
})

export function parseTicketReplyForm(
  input: TicketReplyFormInput,
): { ok: true; data: TicketReplyFormParsed } | { ok: false; error: string } {
  const result = ticketReplyFormSchema.safeParse(input)
  if (!result.success) {
    return { ok: false, error: firstZodError(result.error, 'Check the reply') }
  }
  return { ok: true, data: { body: result.data.body, internal: result.data.internal } }
}
