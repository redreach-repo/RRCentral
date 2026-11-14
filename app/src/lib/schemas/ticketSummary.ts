import { z } from 'zod'
import { firstZodError } from './common'

export type TicketSummaryFormInput = {
  summary: string
}

export type TicketSummaryFormParsed = {
  summary: string
}

export const ticketSummaryFormSchema = z.object({
  summary: z.string().trim().min(1, 'Add a summary before saving it as a note'),
})

export function parseTicketSummaryForm(
  input: TicketSummaryFormInput,
): { ok: true; data: TicketSummaryFormParsed } | { ok: false; error: string } {
  const result = ticketSummaryFormSchema.safeParse(input)
  if (!result.success) {
    return { ok: false, error: firstZodError(result.error, 'Check the summary') }
  }
  return { ok: true, data: { summary: result.data.summary } }
}
