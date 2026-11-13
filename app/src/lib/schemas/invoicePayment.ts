import { z } from 'zod'
import { firstZodError } from './common'

export type InvoicePaymentFormInput = {
  amount: string | number
  method: string
  notes: string
}

export type InvoicePaymentFormParsed = {
  amount: number
  method: string
  notes: string
}

export const invoicePaymentFormSchema = z.object({
  amount: z.coerce
    .number({ invalid_type_error: 'Enter a valid payment amount' })
    .finite()
    .gt(0, 'Enter a valid payment amount'),
  method: z.string().trim().min(1, 'Pick a payment method'),
  notes: z.string(),
})

export function parseInvoicePaymentForm(
  input: InvoicePaymentFormInput,
): { ok: true; data: InvoicePaymentFormParsed } | { ok: false; error: string } {
  const result = invoicePaymentFormSchema.safeParse(input)
  if (!result.success) {
    return { ok: false, error: firstZodError(result.error, 'Check the payment') }
  }
  return {
    ok: true,
    data: {
      amount: result.data.amount,
      method: result.data.method,
      notes: result.data.notes.trim(),
    },
  }
}
