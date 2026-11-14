import { z } from 'zod'
import { isLostReason } from '../dealRules'
import { firstZodError } from './common'

export type CrmOutcomeFormInput = {
  stage: 'Won' | 'Lost'
  outcome_reason: string
  lost_note: string
}

export type CrmOutcomeFormParsed = {
  stage: 'Won' | 'Lost'
  outcome_reason: string
  lost_note: string
}

export const crmOutcomeFormSchema = z
  .object({
    stage: z.enum(['Won', 'Lost']),
    outcome_reason: z.string().trim().min(1, 'Outcome reason is required'),
    lost_note: z.string(),
  })
  .superRefine((val, ctx) => {
    if (val.stage === 'Lost') {
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

export function parseCrmOutcomeForm(
  input: CrmOutcomeFormInput,
): { ok: true; data: CrmOutcomeFormParsed } | { ok: false; error: string } {
  const result = crmOutcomeFormSchema.safeParse(input)
  if (!result.success) {
    return { ok: false, error: firstZodError(result.error, 'Check the outcome') }
  }
  return {
    ok: true,
    data: {
      stage: result.data.stage,
      outcome_reason: result.data.outcome_reason,
      lost_note: result.data.lost_note.trim(),
    },
  }
}
