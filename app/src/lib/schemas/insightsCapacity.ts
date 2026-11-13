import { z } from 'zod'
import { firstZodError } from './common'

export type InsightsCapacityFormInput = {
  hours: string | number
}

export type InsightsCapacityFormParsed = {
  hours: number
}

export const insightsCapacityFormSchema = z.object({
  hours: z.coerce
    .number({ invalid_type_error: 'Enter the hours a month you can deliver, for example 100' })
    .finite()
    .gt(0, 'Enter the hours a month you can deliver, for example 100')
    .lte(2000, 'Enter the hours a month you can deliver, for example 100'),
})

export function parseInsightsCapacityForm(
  input: InsightsCapacityFormInput,
): { ok: true; data: InsightsCapacityFormParsed } | { ok: false; error: string } {
  const result = insightsCapacityFormSchema.safeParse(input)
  if (!result.success) {
    return {
      ok: false,
      error: firstZodError(result.error, 'Enter the hours a month you can deliver, for example 100'),
    }
  }
  return { ok: true, data: { hours: result.data.hours } }
}
