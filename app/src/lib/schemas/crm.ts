import { z } from 'zod'
import { isLostReason } from '../dealRules'
import { firstZodError } from './common'

const optionalUrl = z
  .string()
  .trim()
  .refine((v) => !v || /^https?:\/\//i.test(v) || /^[a-z0-9.-]+\.[a-z]{2,}/i.test(v), {
    message: 'Website looks invalid',
  })

const optionalTrn = z
  .string()
  .trim()
  .refine((v) => !v || /^\d{9,15}$/.test(v.replace(/\s/g, '')), {
    message: 'TRN should be 9–15 digits',
  })

export type CrmFormInput = {
  company_name: string
  company_owner: string
  address: string
  website: string
  trn: string
  notes: string
  follow_up_date: string
  next_action: string
  owner: string
  pipeline_stage: string
  quote_ref: string
  outcome_reason: string
  lost_note: string
  /** Prior stage when editing; used to require lost note only on move into Lost. */
  previous_stage?: string
}

export type CrmFormParsed = Omit<CrmFormInput, 'previous_stage'>

export const crmFormSchema = z
  .object({
    company_name: z.string().trim().min(1, 'Company name is required'),
    company_owner: z.string().trim(),
    address: z.string().trim(),
    website: optionalUrl,
    trn: optionalTrn,
    notes: z.string(),
    follow_up_date: z
      .string()
      .trim()
      .refine((v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v), { message: 'Follow-up date must be YYYY-MM-DD' }),
    next_action: z.string(),
    owner: z.string(),
    pipeline_stage: z.string().trim().min(1, 'Pick a stage'),
    quote_ref: z.string().trim(),
    outcome_reason: z.string().trim(),
    lost_note: z.string(),
    previous_stage: z.string().optional(),
  })
  .superRefine((val, ctx) => {
    const stage = val.pipeline_stage || 'Lead'
    const closed = stage === 'Won' || stage === 'Lost'
    if (!closed) {
      if (!val.follow_up_date) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['follow_up_date'],
          message: 'Follow-up date is required for open deals',
        })
      }
      if (!val.next_action.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['next_action'],
          message: 'Next action is required for open deals',
        })
      }
    }
    if (closed && !val.outcome_reason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['outcome_reason'],
        message: `${stage} reason is required`,
      })
    }
    if (stage === 'Lost' && (val.previous_stage || '') !== 'Lost') {
      if (!isLostReason(val.outcome_reason)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['outcome_reason'],
          message: 'Pick why the deal was lost from the list',
        })
      }
      if (!val.lost_note.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['lost_note'],
          message: 'Add a note on why the deal was lost',
        })
      }
    }
  })

export function parseCrmForm(
  input: CrmFormInput,
): { ok: true; data: CrmFormParsed } | { ok: false; error: string } {
  const result = crmFormSchema.safeParse(input)
  if (!result.success) {
    return { ok: false, error: firstZodError(result.error, 'Check the CRM form') }
  }
  const { previous_stage: _p, ...data } = result.data
  return {
    ok: true,
    data: {
      ...data,
      trn: data.trn.replace(/\s/g, ''),
      next_action: data.next_action.trim(),
      lost_note: data.lost_note.trim(),
    },
  }
}
