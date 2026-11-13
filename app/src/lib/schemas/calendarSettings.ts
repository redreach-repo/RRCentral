import { z } from 'zod'
import { firstZodError } from './common'

export type CalendarSettingsFormInput = {
  enabled: string
  domain: string
  calendarUid: string
}

export type CalendarSettingsFormParsed = {
  enabled: 'yes' | 'no'
  domain: string
  calendarUid: string
}

export const calendarSettingsFormSchema = z
  .object({
    enabled: z.enum(['yes', 'no']),
    domain: z.string(),
    calendarUid: z.string(),
  })
  .superRefine((val, ctx) => {
    const domain = val.domain.trim()
    if (domain) {
      try {
        const u = new URL(domain)
        if (u.protocol !== 'https:') {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Calendar domain must start with https://',
            path: ['domain'],
          })
        }
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Enter a valid calendar domain URL',
          path: ['domain'],
        })
      }
    }
    if (val.enabled === 'yes' && !val.calendarUid.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Pick a Zoho calendar (or paste its UID) before turning sync on',
        path: ['calendarUid'],
      })
    }
  })

export function parseCalendarSettingsForm(
  input: CalendarSettingsFormInput,
): { ok: true; data: CalendarSettingsFormParsed } | { ok: false; error: string } {
  const enabled = input.enabled.toLowerCase() === 'yes' ? 'yes' : 'no'
  const result = calendarSettingsFormSchema.safeParse({ ...input, enabled })
  if (!result.success) {
    return { ok: false, error: firstZodError(result.error, 'Check the calendar settings') }
  }
  const d = result.data
  return {
    ok: true,
    data: {
      enabled: d.enabled,
      domain: d.domain.trim() || 'https://calendar.zoho.com',
      calendarUid: d.calendarUid.trim(),
    },
  }
}
