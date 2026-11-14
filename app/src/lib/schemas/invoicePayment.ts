import { z } from 'zod'
import { firstZodError } from './common'

const AMOUNT_MSG = 'Enter a valid payment amount'

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
  amount: z
    .union([z.string(), z.number()])
    .transform((raw) => (typeof raw === 'number' ? String(raw) : raw))
    .pipe(
      z
        .string()
        .trim()
        .superRefine((raw, ctx) => {
          const n = Number(raw)
          if (!Number.isFinite(n) || !(n > 0)) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: AMOUNT_MSG })
          }
        })
        .transform((raw) => Number(raw)),
    ),
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
