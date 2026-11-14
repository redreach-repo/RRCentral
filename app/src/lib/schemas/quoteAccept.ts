import { acceptProblem } from '../quoteAccept'
import { firstZodError } from './common'
import { z } from 'zod'

export type QuoteAcceptFormInput = {
  name: string
  date: string
  agreed: boolean
}

export type QuoteAcceptFormParsed = {
  name: string
  date: string
  agreed: true
}

const quoteAcceptFormSchema = z.object({
  name: z.string(),
  date: z.string(),
  agreed: z.boolean(),
})

/** Zod shell + shared `acceptProblem` rules (name, date window, tick). */
export function parseQuoteAcceptForm(
  input: QuoteAcceptFormInput,
  now: Date = new Date(),
): { ok: true; data: QuoteAcceptFormParsed } | { ok: false; error: string } {
  const shape = quoteAcceptFormSchema.safeParse(input)
  if (!shape.success) {
    return { ok: false, error: firstZodError(shape.error, 'Check the accept form') }
  }
  const problem = acceptProblem(shape.data, now)
  if (problem) return { ok: false, error: problem }
  return {
    ok: true,
    data: {
      name: shape.data.name.trim(),
      date: shape.data.date.trim(),
      agreed: true,
    },
  }
}
