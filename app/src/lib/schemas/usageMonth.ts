import { z } from 'zod'
import { firstZodError } from './common'

const nonNegOrBlank = (label: string) =>
  z
    .string()
    .trim()
    .superRefine((raw, ctx) => {
      if (raw === '') return
      const n = Number(raw)
      if (!Number.isFinite(n) || n < 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} must be a number` })
      }
    })
    .transform((raw) => (raw === '' ? 0 : Number(raw)))

export type UsageMonthFormInput = {
  marketing: string
  service: string
  ai: string
  leads: string
}

export type UsageMonthFormParsed = {
  whatsapp_marketing_count: number
  whatsapp_service_count: number
  ai_cost_usd: number
  lead_credits_cost_usd: number
}

export const usageMonthFormSchema = z.object({
  marketing: nonNegOrBlank('Marketing WhatsApp count'),
  service: nonNegOrBlank('Service WhatsApp count'),
  ai: nonNegOrBlank('AI cost USD'),
  leads: nonNegOrBlank('Lead credits USD'),
})

export function parseUsageMonthForm(
  input: UsageMonthFormInput,
): { ok: true; data: UsageMonthFormParsed } | { ok: false; error: string } {
  const result = usageMonthFormSchema.safeParse(input)
  if (!result.success) {
    return { ok: false, error: firstZodError(result.error, 'Check the usage figures') }
  }
  return {
    ok: true,
    data: {
      whatsapp_marketing_count: result.data.marketing,
      whatsapp_service_count: result.data.service,
      ai_cost_usd: result.data.ai,
      lead_credits_cost_usd: result.data.leads,
    },
  }
}
