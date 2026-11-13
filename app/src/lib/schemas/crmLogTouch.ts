import { z } from 'zod'
import { firstZodError } from './common'

export type CrmLogTouchFormInput = {
  text: string
  follow_up_date: string
  clearDate: boolean
  pipeline_stage: string
  next_action: string
}

export type CrmLogTouchFormParsed = {
  text: string
  follow_up_date: string | null
  clearDate: boolean
  pipeline_stage: string
  next_action: string
}

export const crmLogTouchFormSchema = z.object({
  text: z.string().trim().min(1, 'Say what happened'),
  follow_up_date: z
    .string()
    .trim()
    .refine((v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v), { message: 'Follow-up date must be YYYY-MM-DD' }),
  clearDate: z.boolean(),
  pipeline_stage: z.string().trim().min(1, 'Pick a stage'),
  next_action: z.string(),
})

export function parseCrmLogTouchForm(
  input: CrmLogTouchFormInput,
): { ok: true; data: CrmLogTouchFormParsed } | { ok: false; error: string } {
  const result = crmLogTouchFormSchema.safeParse(input)
  if (!result.success) {
    return { ok: false, error: firstZodError(result.error, 'Check the log-touch form') }
  }
  const d = result.data
  return {
    ok: true,
    data: {
      text: d.text,
      follow_up_date: d.clearDate ? null : d.follow_up_date || null,
      clearDate: d.clearDate,
      pipeline_stage: d.pipeline_stage,
      next_action: d.next_action.trim(),
    },
  }
}
