import { z } from 'zod'
import { firstZodError } from './common'

const optionalEmail = z
  .string()
  .trim()
  .refine((v) => !v || z.string().email().safeParse(v).success, {
    message: 'Contact email looks invalid',
  })

export type QuotationFormInput = {
  client: string
  contact_name: string
  contact_email: string
  contact_phone: string
  division_code: string
  description: string
  payment_terms: string
  delivery_terms: string
  moq: string
  notes: string
  date: string
  quotation_currency: string
  payment_currency: string
  fx_rate: number
  discount_percent: number
  discount_amount: number
  /** True when at least one line has a description (draft may omit client). */
  has_line_items: boolean
}

export const quotationFormSchema = z
  .object({
    client: z.string().trim(),
    contact_name: z.string().trim(),
    contact_email: optionalEmail,
    contact_phone: z.string().trim(),
    division_code: z.string().trim().min(1, 'Pick a division'),
    description: z.string().trim(),
    payment_terms: z.string(),
    delivery_terms: z.string(),
    moq: z.string(),
    notes: z.string(),
    date: z
      .string()
      .trim()
      .refine((v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v), { message: 'Date must be YYYY-MM-DD' }),
    quotation_currency: z.string().trim().min(1, 'Pick a currency'),
    payment_currency: z.string().trim().min(1, 'Pick a payment currency'),
    fx_rate: z.number().finite().positive('FX rate must be greater than zero'),
    discount_percent: z.number().finite().min(0, 'Discount % cannot be negative').max(100, 'Discount % cannot exceed 100'),
    discount_amount: z.number().finite().min(0, 'Discount amount cannot be negative'),
    has_line_items: z.boolean(),
  })
  .superRefine((val, ctx) => {
    if (!val.client && !val.has_line_items) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['client'],
        message: 'Add a client or line items before saving',
      })
    }
  })

export function parseQuotationForm(
  input: QuotationFormInput,
): { ok: true; data: QuotationFormInput } | { ok: false; error: string } {
  const result = quotationFormSchema.safeParse(input)
  if (!result.success) {
    return { ok: false, error: firstZodError(result.error, 'Check the quotation form') }
  }
  return { ok: true, data: result.data }
}
