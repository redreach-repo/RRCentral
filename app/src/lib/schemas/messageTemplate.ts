import { z } from 'zod'
import { templateProblem, type TemplateChannel, type TemplatePurpose } from '../quoteNudges'
import { firstZodError } from './common'

export type MessageTemplateFormInput = {
  name: string
  division_code: string
  channel: TemplateChannel
  purpose: TemplatePurpose
  subject: string
  body: string
  active: boolean
}

export const messageTemplateFormSchema = z
  .object({
    name: z.string(),
    division_code: z.string(),
    channel: z.enum(['whatsapp', 'email']),
    purpose: z.enum(['quote_followup', 'general']),
    subject: z.string(),
    body: z.string(),
    active: z.boolean(),
  })
  .superRefine((val, ctx) => {
    const problem = templateProblem(val)
    if (problem) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: problem })
    }
  })

export function parseMessageTemplateForm(
  input: MessageTemplateFormInput,
): { ok: true; data: MessageTemplateFormInput } | { ok: false; error: string } {
  const result = messageTemplateFormSchema.safeParse(input)
  if (!result.success) {
    return { ok: false, error: firstZodError(result.error, 'Check the template form') }
  }
  const d = result.data
  return {
    ok: true,
    data: {
      ...d,
      name: d.name.trim(),
      subject: d.subject.trim(),
      body: d.body.trim(),
    },
  }
}
