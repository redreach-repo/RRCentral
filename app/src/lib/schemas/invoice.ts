import { z } from 'zod'
import { firstZodError } from './common'

export type InvoiceFormInput = {
  client: string
  vertical: string
  reference_number: string
  description: string
  payment_terms: string
  delivery_terms: string
  moq: string
  notes: string
  date: string
  status: string
  vat_mode: 'standard' | 'zero' | 'custom'
  vat_percent: string
}

export const invoiceFormSchema = z
  .object({
    client: z.string().trim().min(1, 'Client is required'),
    vertical: z.string().trim().min(1, 'Pick a division'),
    reference_number: z.string().trim(),
    description: z.string().trim(),
    payment_terms: z.string(),
    delivery_terms: z.string(),
    moq: z.string(),
    notes: z.string(),
    date: z
      .string()
      .trim()
      .refine((v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v), { message: 'Date must be YYYY-MM-DD' }),
    status: z.string().trim().min(1, 'Pick a status'),
    vat_mode: z.enum(['standard', 'zero', 'custom']),
    vat_percent: z.string().trim(),
  })
  .superRefine((val, ctx) => {
    if (val.vat_mode === 'custom') {
      const n = Number(val.vat_percent)
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['vat_percent'],
          message: 'Enter a VAT % between 0 and 100',
        })
      }
    }
  })

export function parseInvoiceForm(
  input: InvoiceFormInput,
): { ok: true; data: InvoiceFormInput } | { ok: false; error: string } {
  const result = invoiceFormSchema.safeParse(input)
  if (!result.success) {
    return { ok: false, error: firstZodError(result.error, 'Check the invoice form') }
  }
  return { ok: true, data: result.data }
}
