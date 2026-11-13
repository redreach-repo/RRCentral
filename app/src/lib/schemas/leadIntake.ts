import { z } from 'zod'
import { firstZodError } from './common'

export type LeadIntakeFormInput = {
  mode: string
  fixed: string
  pool: string[]
  whatsapp: string
}

export type LeadIntakeFormParsed = {
  mode: 'fixed' | 'round_robin'
  fixed: string
  pool: string[]
  whatsappDigits: string
}

export const leadIntakeFormSchema = z
  .object({
    mode: z.enum(['fixed', 'round_robin']),
    fixed: z.string(),
    pool: z.array(z.string()),
    whatsapp: z.string(),
  })
  .superRefine((val, ctx) => {
    if (val.mode === 'round_robin' && val.pool.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Tick at least one person for the round robin',
        path: ['pool'],
      })
    }
    const digits = val.whatsapp.replace(/\D/g, '')
    if (val.whatsapp && digits.length < 8) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Enter the WhatsApp number with the country code, for example 971501234567',
        path: ['whatsapp'],
      })
    }
  })

export function parseLeadIntakeForm(
  input: LeadIntakeFormInput,
): { ok: true; data: LeadIntakeFormParsed } | { ok: false; error: string } {
  const mode = input.mode === 'round_robin' ? 'round_robin' : 'fixed'
  const result = leadIntakeFormSchema.safeParse({ ...input, mode })
  if (!result.success) {
    return { ok: false, error: firstZodError(result.error, 'Check the lead settings') }
  }
  const d = result.data
  return {
    ok: true,
    data: {
      mode: d.mode,
      fixed: d.fixed,
      pool: d.pool,
      whatsappDigits: d.whatsapp.replace(/\D/g, ''),
    },
  }
}
