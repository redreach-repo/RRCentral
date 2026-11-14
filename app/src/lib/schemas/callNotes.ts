import { z } from 'zod'
import { firstZodError } from './common'

export type CallNotesFormInput = {
  notes: string
}

export type CallNotesFormParsed = {
  notes: string
}

export const callNotesFormSchema = z.object({
  notes: z.string().trim().min(1, 'Paste the call notes first'),
})

export function parseCallNotesForm(
  input: CallNotesFormInput,
): { ok: true; data: CallNotesFormParsed } | { ok: false; error: string } {
  const result = callNotesFormSchema.safeParse(input)
  if (!result.success) {
    return { ok: false, error: firstZodError(result.error, 'Check the call notes') }
  }
  return { ok: true, data: { notes: result.data.notes } }
}
