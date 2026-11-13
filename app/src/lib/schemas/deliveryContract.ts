import { z } from 'zod'
import { firstZodError } from './common'

const nonNegNumber = (label: string) =>
  z.preprocess(
    (v) => (v === null || v === undefined ? '' : String(v)),
    z
      .string()
      .trim()
      .superRefine((raw, ctx) => {
        if (raw === '') {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} must be a number` })
          return
        }
        const n = Number(raw)
        if (!Number.isFinite(n) || n < 0) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} must be a number` })
        }
      })
      .transform((raw) => Number(raw)),
  )

const nonNegInt = (label: string) =>
  z.preprocess(
    (v) => (v === null || v === undefined ? '' : String(v)),
    z
      .string()
      .trim()
      .superRefine((raw, ctx) => {
        if (raw === '') {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} must be a whole number` })
          return
        }
        const n = Number(raw)
        if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} must be a whole number` })
        }
      })
      .transform((raw) => Number(raw)),
  )

const optionalDate = z.preprocess(
  (v) => (v === null || v === undefined ? '' : String(v).trim()),
  z
    .string()
    .refine((v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v), { message: 'Use YYYY-MM-DD dates' })
    .transform((v) => (v === '' ? null : v)),
)

export type DeliveryContractFormInput = {
  package_id: string | null
  option: string
  monthly_fee: string | number
  setup_fee: string | number
  setup_fee_paid: string | number
  discount_percent: string | number
  discount_months_left: string | number
  term_start: string | null
  term_end: string | null
  annual_prepay: boolean
  status: string
  notes: string
  auto_invoice?: boolean
  billing_from?: string | null
}

export type DeliveryContractFormParsed = {
  package_id: string | null
  option: 'A' | 'B'
  monthly_fee: number
  setup_fee: number
  setup_fee_paid: number
  discount_percent: number
  discount_months_left: number
  term_start: string | null
  term_end: string | null
  annual_prepay: boolean
  status: 'draft' | 'active' | 'ended' | 'cancelled'
  notes: string
  auto_invoice: boolean
  billing_from: string | null
}

export const deliveryContractFormSchema = z.object({
  package_id: z.string().nullable(),
  option: z.enum(['A', 'B'], { message: 'Pick option A or B' }),
  monthly_fee: nonNegNumber('Monthly fee'),
  setup_fee: nonNegNumber('Setup fee'),
  setup_fee_paid: nonNegNumber('Setup fee paid'),
  discount_percent: nonNegNumber('Discount %'),
  discount_months_left: nonNegInt('Discount months left'),
  term_start: optionalDate,
  term_end: optionalDate,
  annual_prepay: z.boolean(),
  status: z.enum(['draft', 'active', 'ended', 'cancelled'], { message: 'Pick a contract status' }),
  notes: z.string(),
  auto_invoice: z.boolean().optional(),
  billing_from: optionalDate.optional(),
})

export function parseDeliveryContractForm(
  input: DeliveryContractFormInput,
): { ok: true; data: DeliveryContractFormParsed } | { ok: false; error: string } {
  const result = deliveryContractFormSchema.safeParse(input)
  if (!result.success) {
    return { ok: false, error: firstZodError(result.error, 'Check the contract') }
  }
  const d = result.data
  return {
    ok: true,
    data: {
      package_id: d.package_id,
      option: d.option,
      monthly_fee: d.monthly_fee as number,
      setup_fee: d.setup_fee as number,
      setup_fee_paid: d.setup_fee_paid as number,
      discount_percent: d.discount_percent as number,
      discount_months_left: d.discount_months_left as number,
      term_start: d.term_start as string | null,
      term_end: d.term_end as string | null,
      annual_prepay: d.annual_prepay,
      status: d.status,
      notes: d.notes,
      auto_invoice: Boolean(d.auto_invoice),
      billing_from: d.auto_invoice ? ((d.billing_from as string | null | undefined) ?? null) : null,
    },
  }
}
