import { z } from 'zod'
import { firstZodError } from './common'

const MSG = 'Enter the hours a month you can deliver, for example 100'

export type InsightsCapacityFormInput = {
  hours: string | number
}

export type InsightsCapacityFormParsed = {
  hours: number
}

export const insightsCapacityFormSchema = z.object({
  hours: z
    .union([z.string(), z.number()])
    .transform((raw) => (typeof raw === 'number' ? String(raw) : raw))
    .pipe(
      z
        .string()
        .trim()
        .superRefine((raw, ctx) => {
          const n = Number(raw)
          if (!Number.isFinite(n) || n <= 0 || n > 2000) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: MSG })
          }
        })
        .transform((raw) => Number(raw)),
    ),
})

export function parseInsightsCapacityForm(
  input: InsightsCapacityFormInput,
): { ok: true; data: InsightsCapacityFormParsed } | { ok: false; error: string } {
  const result = insightsCapacityFormSchema.safeParse(input)
  if (!result.success) {
    return { ok: false, error: firstZodError(result.error, MSG) }
  }
  return { ok: true, data: { hours: result.data.hours } }
}
