import { z } from 'zod'
import { firstZodError } from './common'

export type ClientUpdateBodyInput = {
  body: string
}

export type ClientUpdateBodyParsed = {
  body: string
}

export const clientUpdateBodySchema = z.object({
  body: z.string().trim().min(1, 'Write the weekly update before saving or sending'),
})

export function parseClientUpdateBody(
  input: ClientUpdateBodyInput,
): { ok: true; data: ClientUpdateBodyParsed } | { ok: false; error: string } {
  const result = clientUpdateBodySchema.safeParse(input)
  if (!result.success) {
    return { ok: false, error: firstZodError(result.error, 'Check the update') }
  }
  return { ok: true, data: { body: result.data.body } }
}
