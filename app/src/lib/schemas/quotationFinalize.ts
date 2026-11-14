import { z } from 'zod'
import { firstZodError } from './common'

export type QuotationFinalizeFormInput = {
  client: string
}

export type QuotationFinalizeFormParsed = {
  client: string
}

export const quotationFinalizeFormSchema = z.object({
  client: z.string().trim().min(1, 'Client is required before finalizing'),
})

export function parseQuotationFinalizeForm(
  input: QuotationFinalizeFormInput,
): { ok: true; data: QuotationFinalizeFormParsed } | { ok: false; error: string } {
  const result = quotationFinalizeFormSchema.safeParse(input)
  if (!result.success) {
    return { ok: false, error: firstZodError(result.error, 'Check the quotation before finalizing') }
  }
  return { ok: true, data: { client: result.data.client } }
}
