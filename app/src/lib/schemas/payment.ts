import { z } from 'zod'
import { PAYMENT_METHODS } from '../config'
import { PAYMENT_STATUSES, PAYMENT_TYPES } from '../bookingMoney'
import { SUPPORTED_CURRENCIES } from '../currency'
import { firstZodError } from './common'

const ymd = z
  .string()
  .trim()
  .refine((v) => /^\d{4}-\d{2}-\d{2}$/.test(v), { message: 'Date must be YYYY-MM-DD' })

const optionalYmd = z
  .string()
  .trim()
  .refine((v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v), { message: 'Date must be YYYY-MM-DD' })

const currencyCode = z
  .string()
  .trim()
  .min(1, 'Pick a currency')
  .refine((v) => (SUPPORTED_CURRENCIES as readonly string[]).includes(v.toUpperCase()), {
    message: 'Unsupported currency',
  })
  .transform((v) => v.toUpperCase())

export type CustomerPaymentFormInput = {
  booking_id: string
  quote_ref: string
  invoice_ref: string
  client: string
  payment_date: string
  amount_received: number
  currency: string
  fx_rate: number
  fx_rate_date: string
  payment_method: string
  bank_provider: string
  processing_fee: number
  conversion_fee: number
  payment_type: string
  transaction_ref: string
  proof_url: string
  status: string
  notes: string
}

export const customerPaymentFormSchema = z
  .object({
    booking_id: z.string(),
    quote_ref: z.string().trim(),
    invoice_ref: z.string().trim(),
    client: z.string().trim(),
    payment_date: ymd,
    amount_received: z.number().finite(),
    currency: currencyCode,
    fx_rate: z.number().finite().positive('FX rate must be greater than zero'),
    fx_rate_date: ymd,
    payment_method: z
      .string()
      .trim()
      .min(1, 'Pick a payment method')
      .refine((v) => (PAYMENT_METHODS as readonly string[]).includes(v), {
        message: 'Pick a payment method',
      }),
    bank_provider: z.string().trim(),
    processing_fee: z.number().finite().min(0, 'Fee cannot be negative'),
    conversion_fee: z.number().finite().min(0, 'Fee cannot be negative'),
    payment_type: z
      .string()
      .trim()
      .refine((v) => (PAYMENT_TYPES as readonly string[]).includes(v), {
        message: 'Pick a payment type',
      }),
    transaction_ref: z.string().trim(),
    proof_url: z.string().trim(),
    status: z
      .string()
      .trim()
      .refine((v) => (PAYMENT_STATUSES as readonly string[]).includes(v), {
        message: 'Pick a status',
      }),
    notes: z.string(),
  })
  .superRefine((val, ctx) => {
    if (!(val.amount_received > 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['amount_received'],
        message: 'Enter amount received',
      })
    }
  })

export function parseCustomerPaymentForm(
  input: CustomerPaymentFormInput,
): { ok: true; data: CustomerPaymentFormInput } | { ok: false; error: string } {
  const result = customerPaymentFormSchema.safeParse(input)
  if (!result.success) {
    return { ok: false, error: firstZodError(result.error, 'Check the payment form') }
  }
  return { ok: true, data: { ...result.data, notes: result.data.notes.trim() } }
}

export type CustomerRefundFormInput = {
  amount_refunded: number
  reason: string
}

export const customerRefundFormSchema = z
  .object({
    amount_refunded: z.number().finite(),
    reason: z.string().trim().min(1, 'Enter a refund reason'),
  })
  .superRefine((val, ctx) => {
    if (!(val.amount_refunded > 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['amount_refunded'],
        message: 'Enter a refund amount greater than zero',
      })
    }
  })

export function parseCustomerRefundForm(
  input: CustomerRefundFormInput,
): { ok: true; data: CustomerRefundFormInput } | { ok: false; error: string } {
  const result = customerRefundFormSchema.safeParse(input)
  if (!result.success) {
    return { ok: false, error: firstZodError(result.error, 'Check the refund form') }
  }
  return { ok: true, data: result.data }
}

export type SupplierCommitmentFormInput = {
  supplier_name: string
  description: string
  amount: number
  currency: string
  fx_rate: number
  fx_rate_date: string
  due_date: string
  notes: string
}

export const supplierCommitmentFormSchema = z
  .object({
    supplier_name: z.string().trim().min(1, 'Supplier name and amount required'),
    description: z.string().trim(),
    amount: z.number().finite(),
    currency: currencyCode,
    fx_rate: z.number().finite().positive('FX rate must be greater than zero'),
    fx_rate_date: ymd,
    due_date: optionalYmd,
    notes: z.string(),
  })
  .superRefine((val, ctx) => {
    if (!(val.amount > 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['amount'],
        message: 'Supplier name and amount required',
      })
    }
  })

export function parseSupplierCommitmentForm(
  input: SupplierCommitmentFormInput,
): { ok: true; data: SupplierCommitmentFormInput } | { ok: false; error: string } {
  const result = supplierCommitmentFormSchema.safeParse(input)
  if (!result.success) {
    return { ok: false, error: firstZodError(result.error, 'Check the supplier form') }
  }
  return {
    ok: true,
    data: { ...result.data, notes: result.data.notes.trim() },
  }
}
