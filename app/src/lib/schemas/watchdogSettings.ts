import { z } from 'zod'
import { firstZodError } from './common'

export type WatchdogPipeline = 'crm' | 'sales' | 'ctrm'

export type WatchdogSettingsFormInput = Record<WatchdogPipeline, string>

export type WatchdogSettingsFormParsed = Record<WatchdogPipeline, number>

const LABELS: Record<WatchdogPipeline, string> = {
  crm: 'CRM leads',
  sales: 'AI CRM sales deals',
  ctrm: 'CTRM Next deals',
}

const daysField = (label: string) =>
  z
    .string()
    .trim()
    .superRefine((raw, ctx) => {
      const n = Number(raw)
      if (!Number.isInteger(n) || n < 1 || n > 365) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${label}: enter whole days from 1 to 365`,
        })
      }
    })
    .transform((raw) => Number(raw))

export const watchdogSettingsFormSchema = z.object({
  crm: daysField(LABELS.crm),
  sales: daysField(LABELS.sales),
  ctrm: daysField(LABELS.ctrm),
})

export function parseWatchdogSettingsForm(
  input: WatchdogSettingsFormInput,
): { ok: true; data: WatchdogSettingsFormParsed } | { ok: false; error: string } {
  const result = watchdogSettingsFormSchema.safeParse(input)
  if (!result.success) {
    return { ok: false, error: firstZodError(result.error, 'Check the watchdog settings') }
  }
  return { ok: true, data: result.data }
}
