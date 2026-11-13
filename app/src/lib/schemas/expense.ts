import { z } from 'zod'
import { firstZodError } from './common'

export const EXPENSE_CATEGORIES = [
  'Uniforms / Cost of goods',
  'Office',
  'Travel',
  'Marketing',
  'Salary',
  'Rent',
  'Utilities',
  'Supplies',
  'Shipping',
  'Professional fees',
  'Other',
] as const

export type ExpenseFormInput = {
  date: string
  vendor: string
  category: string
  amount: number
  amount_ex_vat: number
  vat_amount: number
  charges_vat: boolean
  payment_method: string
  references_text: string
  notes: string
  quote_ref: string
  supplier_invoice_no: string
}

export const expenseFormSchema = z
  .object({
    date: z
      .string()
      .trim()
      .refine((v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v), { message: 'Date must be YYYY-MM-DD' }),
    vendor: z.string().trim().min(1, 'Vendor is required'),
    /** Prefer catalog values; allow legacy rows that are not in the list. */
    category: z.string().trim().min(1, 'Pick a category'),
    amount: z.number().finite().min(0, 'Amount cannot be negative'),
    amount_ex_vat: z.number().finite().min(0, 'Amount cannot be negative'),
    vat_amount: z.number().finite().min(0, 'VAT cannot be negative'),
    charges_vat: z.boolean(),
    payment_method: z.string().trim().min(1, 'Pick a payment method'),
    references_text: z.string().trim(),
    notes: z.string(),
    quote_ref: z.string().trim(),
    supplier_invoice_no: z.string().trim(),
  })
  .superRefine((val, ctx) => {
    const total = val.amount > 0 ? val.amount : val.amount_ex_vat + val.vat_amount
    if (total <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['amount'],
        message: 'Enter an amount greater than zero',
      })
    }
  })

export function parseExpenseForm(
  input: ExpenseFormInput,
): { ok: true; data: ExpenseFormInput } | { ok: false; error: string } {
  const result = expenseFormSchema.safeParse(input)
  if (!result.success) {
    return { ok: false, error: firstZodError(result.error, 'Check the expense form') }
  }
  return { ok: true, data: result.data }
}
