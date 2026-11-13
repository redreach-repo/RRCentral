import { z } from 'zod'
import { crmMoveProblem } from '../dealRules'
import type { CrmEntry } from '../types'
import { firstZodError } from './common'

export type FollowupUpdateFormInput = {
  update_text: string
  pipeline_stage: string
  next_action: string
  follow_up_date: string
  clearDate: boolean
  /** Current CRM row used for move-rule checks. */
  entry: Pick<
    CrmEntry,
    'pipeline_stage' | 'next_action' | 'follow_up_date' | 'outcome_reason' | 'lost_note'
  >
}

export type FollowupUpdateFormParsed = {
  update_text: string
  pipeline_stage: string
  next_action: string
  follow_up_date: string | null
  clearDate: boolean
}

export const followupUpdateFormSchema = z
  .object({
    update_text: z.string().trim().min(1, 'Write an update'),
    pipeline_stage: z.string(),
    next_action: z.string(),
    follow_up_date: z
      .string()
      .trim()
      .refine((v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v), { message: 'Follow-up date must be YYYY-MM-DD' }),
    clearDate: z.boolean(),
    entry: z.object({
      pipeline_stage: z.string(),
      next_action: z.string(),
      follow_up_date: z.string().nullable(),
      outcome_reason: z.string().optional(),
      lost_note: z.string().optional(),
    }),
  })
  .superRefine((val, ctx) => {
    const stage = val.pipeline_stage || val.entry.pipeline_stage
    const next_action = val.next_action || val.entry.next_action
    const follow_up_date = val.clearDate ? null : val.follow_up_date || val.entry.follow_up_date
    const problem = crmMoveProblem(
      val.entry as CrmEntry,
      { pipeline_stage: stage, next_action, follow_up_date },
      { askedForReason: false },
    )
    if (problem) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: problem })
    }
  })

export function parseFollowupUpdateForm(
  input: FollowupUpdateFormInput,
): { ok: true; data: FollowupUpdateFormParsed } | { ok: false; error: string } {
  const result = followupUpdateFormSchema.safeParse(input)
  if (!result.success) {
    return { ok: false, error: firstZodError(result.error, 'Check the follow-up update') }
  }
  const d = result.data
  return {
    ok: true,
    data: {
      update_text: d.update_text,
      pipeline_stage: d.pipeline_stage,
      next_action: d.next_action.trim(),
      follow_up_date: d.clearDate ? null : d.follow_up_date || null,
      clearDate: d.clearDate,
    },
  }
}
