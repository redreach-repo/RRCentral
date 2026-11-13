import { z } from 'zod'
import { firstZodError } from './common'

export type SupportPolicyHourInput = {
  id: string
  label: string
  hours: string
}

export type SupportPolicyHourParsed = {
  id: string
  label: string
  first_response_hours: number
}

const policyHourSchema = z
  .object({
    id: z.string().min(1),
    label: z.string(),
    hours: z.string(),
  })
  .superRefine((val, ctx) => {
    const n = Number(val.hours)
    if (!Number.isFinite(n) || n < 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${val.label}: hours must be a number`,
        path: ['hours'],
      })
    }
  })

export const supportPoliciesFormSchema = z.array(policyHourSchema)

export function parseSupportPoliciesForm(
  input: SupportPolicyHourInput[],
): { ok: true; data: SupportPolicyHourParsed[] } | { ok: false; error: string } {
  const result = supportPoliciesFormSchema.safeParse(input)
  if (!result.success) {
    return { ok: false, error: firstZodError(result.error, 'Check the response times') }
  }
  return {
    ok: true,
    data: result.data.map((p) => ({
      id: p.id,
      label: p.label,
      first_response_hours: Number(p.hours),
    })),
  }
}

export type SupportWeekFormInput = {
  days: number[]
  start: string
  end: string
}

export type SupportWeekFormParsed = {
  days: number[]
  start: string
  end: string
}

export const supportWeekFormSchema = z
  .object({
    days: z.array(z.number().int().min(1).max(7)),
    start: z.string(),
    end: z.string(),
  })
  .superRefine((val, ctx) => {
    if (val.days.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Pick at least one working day',
        path: ['days'],
      })
    }
    if (!/^\d{2}:\d{2}$/.test(val.start) || !/^\d{2}:\d{2}$/.test(val.end) || val.end <= val.start) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Opening time must be before closing time',
        path: ['end'],
      })
    }
  })

export function parseSupportWeekForm(
  input: SupportWeekFormInput,
): { ok: true; data: SupportWeekFormParsed } | { ok: false; error: string } {
  const result = supportWeekFormSchema.safeParse(input)
  if (!result.success) {
    return { ok: false, error: firstZodError(result.error, 'Check the working week') }
  }
  return {
    ok: true,
    data: {
      days: [...result.data.days].sort((a, b) => a - b),
      start: result.data.start,
      end: result.data.end,
    },
  }
}
