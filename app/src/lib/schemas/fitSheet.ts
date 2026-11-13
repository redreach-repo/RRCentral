import { z } from 'zod'
import { FIT_FOCUS, parseUserCount, type FitSheetDraft } from '../fitSheet'
import type { CtrmFitFocus } from '../types'
import { firstZodError } from './common'

const FOCUS_VALUES = ['', ...FIT_FOCUS.map((f) => f.value)] as [string, ...string[]]

export type FitSheetFormInput = {
  commodities: string
  focus: CtrmFitFocus | ''
  users: string
  current_system: string
  decision_maker_id: string | null
  modules: string[]
  notes: string
}

export type FitSheetFormParsed = FitSheetDraft

export const fitSheetFormSchema = z
  .object({
    commodities: z.string(),
    focus: z.enum(FOCUS_VALUES),
    users: z.string(),
    current_system: z.string(),
    decision_maker_id: z.string().nullable(),
    modules: z.array(z.string()),
    notes: z.string(),
  })
  .superRefine((val, ctx) => {
    const t = val.users.trim()
    if (t && parseUserCount(t) === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['users'],
        message: 'Number of users must be a whole number',
      })
    }
  })

export function parseFitSheetForm(
  input: FitSheetFormInput,
): { ok: true; data: FitSheetFormParsed } | { ok: false; error: string } {
  const result = fitSheetFormSchema.safeParse(input)
  if (!result.success) {
    return { ok: false, error: firstZodError(result.error, 'Check the fit sheet') }
  }
  const d = result.data
  return {
    ok: true,
    data: {
      commodities: d.commodities.trim(),
      focus: d.focus as CtrmFitFocus | '',
      user_count: parseUserCount(d.users),
      current_system: d.current_system.trim(),
      decision_maker_id: d.decision_maker_id,
      modules: d.modules.map((m) => m.trim()).filter(Boolean),
      notes: d.notes.trim(),
    },
  }
}
