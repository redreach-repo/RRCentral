import { z } from 'zod'
import { firstZodError } from './common'

export type FirefliesMeetingInput = {
  input: string
}

export type FirefliesMeetingParsed = {
  input: string
}

export const firefliesMeetingInputSchema = z.object({
  input: z
    .string()
    .trim()
    .min(1, "Paste the meeting's Fireflies link or ID"),
})

export function parseFirefliesMeetingInput(
  input: FirefliesMeetingInput,
): { ok: true; data: FirefliesMeetingParsed } | { ok: false; error: string } {
  const result = firefliesMeetingInputSchema.safeParse(input)
  if (!result.success) {
    return { ok: false, error: firstZodError(result.error, 'Check the Fireflies link') }
  }
  return { ok: true, data: { input: result.data.input } }
}
