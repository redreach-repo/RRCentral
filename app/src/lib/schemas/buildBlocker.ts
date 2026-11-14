import { z } from 'zod'
import { firstZodError } from './common'

export type BuildBlockerFormInput = {
  note: string
}

export type BuildBlockerFormParsed = {
  note: string
}

export const buildBlockerFormSchema = z.object({
  note: z.string().trim().min(1, 'Say what is blocking this stage'),
})

export function parseBuildBlockerNote(
  input: BuildBlockerFormInput,
): { ok: true; data: BuildBlockerFormParsed } | { ok: false; error: string } {
  const result = buildBlockerFormSchema.safeParse(input)
  if (!result.success) {
    return { ok: false, error: firstZodError(result.error, 'Check the blocker note') }
  }
  return { ok: true, data: { note: result.data.note } }
}
