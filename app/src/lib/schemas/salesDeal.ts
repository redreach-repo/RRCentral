import { z } from 'zod'
import { isLostReason } from '../dealRules'
import { hasQuote, isOpenSalesDeal } from '../salesPipeline'
import type { SalesStage } from '../types'
import { firstZodError } from './common'

const SALES_STAGES = ['lead', 'discovery_call', 'quote_sent', 'signed', 'lost'] as const

export type SalesDealFormInput = {
  accountId: string
  newCompany: string
  stage: SalesStage
  source: string
  owner_user_id: string | null
  next_action: string
  next_action_date: string | null
  lost_reason: string
  lost_reason_code: string
  notes: string
  discovery_call_date: string | null
  package_id: string | null
  option: 'A' | 'B'
  monthly_fee: number
  setup_fee: number
  discount_percent: number
  discount_months: number
  start_date: string | null
  quote_reference: string
  /** Existing contract when editing a signed deal. */
  contract_id?: string | null
}

export type SalesDealFormParsed = Omit<SalesDealFormInput, 'contract_id'>

const optionalYmd = z
  .string()
  .nullable()
  .refine((v) => v == null || v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v), {
    message: 'Date must be YYYY-MM-DD',
  })
  .transform((v) => (v && v.trim() ? v : null))

export const salesDealFormSchema = z
  .object({
    accountId: z.string(),
    newCompany: z.string(),
    stage: z.enum(SALES_STAGES),
    source: z.string(),
    owner_user_id: z.string().nullable(),
    next_action: z.string(),
    next_action_date: optionalYmd,
    lost_reason: z.string(),
    lost_reason_code: z.string(),
    notes: z.string(),
    discovery_call_date: optionalYmd,
    package_id: z.string().nullable(),
    option: z.enum(['A', 'B']),
    monthly_fee: z.number().finite(),
    setup_fee: z.number().finite(),
    discount_percent: z.number().finite().min(0).max(100),
    discount_months: z.number().finite().min(0).max(12),
    start_date: optionalYmd,
    quote_reference: z.string(),
    contract_id: z.string().nullable().optional(),
  })
  .superRefine((val, ctx) => {
    if (!val.accountId && !val.newCompany.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['newCompany'],
        message: 'Pick the company, or type a new one',
      })
    }
    if (val.stage === 'lost') {
      if (!isLostReason(val.lost_reason_code)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['lost_reason_code'],
          message: 'Pick why the deal was lost',
        })
      }
      if (!val.lost_reason.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['lost_reason'],
          message: 'Add a note on why the deal was lost',
        })
      }
    }
    if (val.stage === 'quote_sent' && !hasQuote(val)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['package_id'],
        message: 'Pick the package and fees that were quoted',
      })
    }
    if (val.stage === 'signed' && !val.contract_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['stage'],
        message: 'Use Make contract to sign a deal, so the contract is created from the quote',
      })
    }
    if (isOpenSalesDeal(val)) {
      if (!val.next_action.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['next_action'],
          message: 'Every open deal needs a next action',
        })
      }
      if (!val.next_action_date) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['next_action_date'],
          message: 'Give the next action a date',
        })
      }
    }
  })

export function parseSalesDealForm(
  input: SalesDealFormInput,
): { ok: true; data: SalesDealFormParsed } | { ok: false; error: string } {
  const result = salesDealFormSchema.safeParse(input)
  if (!result.success) {
    return { ok: false, error: firstZodError(result.error, 'Check the sales deal form') }
  }
  const { contract_id: _c, ...data } = result.data
  return {
    ok: true,
    data: {
      ...data,
      newCompany: data.newCompany.trim(),
      next_action: data.next_action.trim(),
      lost_reason: data.lost_reason.trim(),
      quote_reference: data.quote_reference.trim(),
      source: data.source.trim(),
      notes: data.notes.trim(),
    },
  }
}
