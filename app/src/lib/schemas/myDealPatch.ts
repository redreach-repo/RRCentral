import { z } from 'zod'
import { firstZodError } from './common'

export type MyDealPatchFormInput = {
  next_action: string
  next_action_date: string
  owner_user_id: string
  notes: string
  quote_ref: string
  source: string
  pipeline: 'crm' | 'sales' | 'ctrm'
  /** When true, open deals must have action + date (matches stageMoveProblem). */
  open: boolean
}

export type MyDealPatchFormParsed = {
  next_action: string
  next_action_date: string | null
  owner_user_id: string | null
  notes: string
  quote_ref?: string
  source?: string
}

export const myDealPatchFormSchema = z
  .object({
    next_action: z.string(),
    next_action_date: z.string(),
    owner_user_id: z.string(),
    notes: z.string(),
    quote_ref: z.string(),
    source: z.string(),
    pipeline: z.enum(['crm', 'sales', 'ctrm']),
    open: z.boolean(),
  })
  .superRefine((val, ctx) => {
    const action = val.next_action.trim()
    const date = val.next_action_date.trim()
    if (val.open) {
      if (!action) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Every open deal needs a next action', path: ['next_action'] })
      }
      if (!date) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Give the next action a date',
          path: ['next_action_date'],
        })
      } else if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Use YYYY-MM-DD dates', path: ['next_action_date'] })
      }
    } else if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Use YYYY-MM-DD dates', path: ['next_action_date'] })
    }
  })

export function parseMyDealPatchForm(
  input: MyDealPatchFormInput,
): { ok: true; data: MyDealPatchFormParsed } | { ok: false; error: string } {
  const result = myDealPatchFormSchema.safeParse(input)
  if (!result.success) {
    return { ok: false, error: firstZodError(result.error, 'Check the next step') }
  }
  const d = result.data
  const parsed: MyDealPatchFormParsed = {
    next_action: d.next_action.trim(),
    next_action_date: d.next_action_date.trim() || null,
    owner_user_id: d.owner_user_id.trim() || null,
    notes: d.notes.trim(),
  }
  if (d.pipeline === 'crm') {
    parsed.quote_ref = d.quote_ref.trim()
  } else {
    parsed.source = d.source.trim()
  }
  return { ok: true, data: parsed }
}
