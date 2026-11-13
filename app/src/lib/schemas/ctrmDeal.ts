import { z } from 'zod'
import { isLostReason } from '../dealRules'
import { isOpenDeal } from '../ctrm'
import type { CtrmCompanyType, CtrmRegion, CtrmStage } from '../types'
import { firstZodError } from './common'

const CTRM_STAGES = [
  'identified',
  'contacted',
  'intro_call_booked',
  'demo_done',
  'evaluating',
  'decision_pending',
  'signed',
  'lost',
] as const

const CTRM_REGIONS = ['middle_east', 'india'] as const
const CTRM_COMPANY_TYPES = ['trading_house', 'energy', 'other'] as const

export type CtrmDealFormInput = {
  accountId: string
  newCompany: string
  stage: CtrmStage
  region: CtrmRegion
  company_type: CtrmCompanyType
  primary_contact_id: string | null
  source: string
  owner_user_id: string | null
  next_action: string
  next_action_date: string | null
  lost_reason: string
  lost_reason_code?: string
  notes: string
  commission: { expected: number; received: number } | null
}

export type CtrmDealFormParsed = CtrmDealFormInput

const optionalYmd = z
  .string()
  .nullable()
  .refine((v) => v == null || v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v), {
    message: 'Date must be YYYY-MM-DD',
  })
  .transform((v) => (v && v.trim() ? v : null))

export const ctrmDealFormSchema = z
  .object({
    accountId: z.string(),
    newCompany: z.string(),
    stage: z.enum(CTRM_STAGES),
    region: z.enum(CTRM_REGIONS),
    company_type: z.enum(CTRM_COMPANY_TYPES),
    primary_contact_id: z.string().nullable(),
    source: z.string(),
    owner_user_id: z.string().nullable(),
    next_action: z.string(),
    next_action_date: optionalYmd,
    lost_reason: z.string(),
    lost_reason_code: z.string().optional().default(''),
    notes: z.string(),
    commission: z
      .object({
        expected: z.number().finite(),
        received: z.number().finite(),
      })
      .nullable(),
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
    if (isOpenDeal(val)) {
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

export function parseCtrmDealForm(
  input: CtrmDealFormInput,
): { ok: true; data: CtrmDealFormParsed } | { ok: false; error: string } {
  const result = ctrmDealFormSchema.safeParse(input)
  if (!result.success) {
    return { ok: false, error: firstZodError(result.error, 'Check the CTRM deal form') }
  }
  const d = result.data
  return {
    ok: true,
    data: {
      ...d,
      newCompany: d.newCompany.trim(),
      next_action: d.next_action.trim(),
      lost_reason: d.lost_reason.trim(),
      source: d.source.trim(),
      notes: d.notes.trim(),
    },
  }
}
