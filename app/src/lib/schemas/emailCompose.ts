import { z } from 'zod'
import { firstZodError } from './common'

export type EmailComposeFormInput = {
  to: string
  subject: string
  body: string
}

export type EmailComposeFormParsed = {
  to: string
  subject: string
  body: string
}

export const emailComposeFormSchema = z.object({
  to: z
    .string()
    .trim()
    .min(1, 'Choose a recipient email')
    .email('Enter a valid recipient email'),
  subject: z.string().trim(),
  body: z.string().trim(),
})

export function parseEmailComposeForm(
  input: EmailComposeFormInput,
): { ok: true; data: EmailComposeFormParsed } | { ok: false; error: string } {
  const result = emailComposeFormSchema.safeParse(input)
  if (!result.success) {
    return { ok: false, error: firstZodError(result.error, 'Check the email') }
  }
  return {
    ok: true,
    data: {
      to: result.data.to,
      subject: result.data.subject,
      body: result.data.body,
    },
  }
}
