import { z } from 'zod'
import { TIME_CATEGORIES } from '../delivery'
import { firstZodError } from './common'

const categoryValues = TIME_CATEGORIES.map((c) => c.value) as [string, ...string[]]

export type TimeEntryFormInput = {
  date: string
  hours: string
  category: string
  note: string
}

export type TimeEntryFormParsed = {
  date: string
  hours: number
  category: (typeof TIME_CATEGORIES)[number]['value']
  note: string
}

export const timeEntryFormSchema = z.object({
  date: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date'),
  hours: z
    .string()
    .trim()
    .superRefine((raw, ctx) => {
      const n = Number(raw)
      if (!Number.isFinite(n) || n <= 0 || n > 24) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter hours between 0.25 and 24' })
      }
    })
    .transform((raw) => Number(raw)),
  category: z.enum(categoryValues, { message: 'Pick a category' }),
  note: z.string().trim(),
})

export function parseTimeEntryForm(
  input: TimeEntryFormInput,
): { ok: true; data: TimeEntryFormParsed } | { ok: false; error: string } {
  const result = timeEntryFormSchema.safeParse(input)
  if (!result.success) {
    return { ok: false, error: firstZodError(result.error, 'Check the hours entry') }
  }
  return {
    ok: true,
    data: {
      date: result.data.date,
      hours: result.data.hours,
      category: result.data.category as TimeEntryFormParsed['category'],
      note: result.data.note,
    },
  }
}
