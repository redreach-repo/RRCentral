import { z } from 'zod'
import { firstZodError } from './common'

export type DeliveryNoteFromQuoteFormInput = {
  quoteId: string
}

export type DeliveryNoteFromQuoteFormParsed = {
  quoteId: string
}

export const deliveryNoteFromQuoteFormSchema = z.object({
  quoteId: z.string().trim().min(1, 'Select a quotation'),
})

export function parseDeliveryNoteFromQuoteForm(
  input: DeliveryNoteFromQuoteFormInput,
): { ok: true; data: DeliveryNoteFromQuoteFormParsed } | { ok: false; error: string } {
  const result = deliveryNoteFromQuoteFormSchema.safeParse(input)
  if (!result.success) {
    return { ok: false, error: firstZodError(result.error, 'Select a quotation') }
  }
  return { ok: true, data: { quoteId: result.data.quoteId } }
}
