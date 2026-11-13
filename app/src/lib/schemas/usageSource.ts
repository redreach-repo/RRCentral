import { z } from 'zod'
import { parsePhoneList } from '../usageImport'
import { firstZodError } from './common'

export type UsageSourceFormInput = {
  phones: string
  workspace: string
}

export type UsageSourceFormParsed = {
  phones: string
  workspace: string
}

export const usageSourceFormSchema = z
  .object({
    phones: z.string(),
    workspace: z.string().trim(),
  })
  .superRefine((val, ctx) => {
    const trimmedPhones = val.phones.trim()
    if (!trimmedPhones && !val.workspace) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Add a WhatsApp number or Anthropic workspace ID',
        path: ['phones'],
      })
      return
    }
    if (trimmedPhones && parsePhoneList(trimmedPhones).length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Enter WhatsApp numbers with at least 7 digits',
        path: ['phones'],
      })
    }
  })
  .transform((val) => ({
    phones: val.phones.trim(),
    workspace: val.workspace,
  }))

export function parseUsageSourceForm(
  input: UsageSourceFormInput,
): { ok: true; data: UsageSourceFormParsed } | { ok: false; error: string } {
  const result = usageSourceFormSchema.safeParse(input)
  if (!result.success) {
    return { ok: false, error: firstZodError(result.error, 'Check the usage links') }
  }
  return { ok: true, data: { phones: result.data.phones, workspace: result.data.workspace } }
}
