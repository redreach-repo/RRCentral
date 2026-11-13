import { z } from 'zod'
import { emailKey, phoneKey } from '../duplicates'
import { QUICK_LEAD_PIPELINES, type QuickLeadPipeline } from '../quickAdd'
import { firstZodError } from './common'

const PIPELINE_VALUES = QUICK_LEAD_PIPELINES.map((p) => p.value) as [
  QuickLeadPipeline,
  ...QuickLeadPipeline[],
]

export type QuickLeadFormInput = {
  phone: string
  name: string
  company: string
  email: string
  source: string
  pipeline: QuickLeadPipeline
  note: string
  countryCode?: string
}

export type QuickLeadFormParsed = {
  phone: string
  name: string
  company: string
  email: string
  source: string
  pipeline: QuickLeadPipeline
  note: string
}

export const quickLeadFormSchema = z
  .object({
    phone: z.string(),
    name: z.string().trim().min(2, 'Add a name'),
    company: z.string().trim(),
    email: z.string().trim(),
    source: z.string().trim().min(1, 'Pick a source'),
    pipeline: z.enum(PIPELINE_VALUES),
    note: z.string(),
    countryCode: z.string().optional(),
  })
  .superRefine((val, ctx) => {
    const cc = val.countryCode || '971'
    if (!phoneKey(val.phone, cc)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['phone'], message: 'Type the phone number first' })
    }
    if (val.email && !emailKey(val.email)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['email'],
        message: 'That email does not look right',
      })
    }
  })

export function parseQuickLeadForm(
  input: QuickLeadFormInput,
): { ok: true; data: QuickLeadFormParsed } | { ok: false; error: string } {
  const result = quickLeadFormSchema.safeParse(input)
  if (!result.success) {
    return { ok: false, error: firstZodError(result.error, 'Check the quick-add form') }
  }
  const d = result.data
  return {
    ok: true,
    data: {
      phone: d.phone.trim(),
      name: d.name,
      company: d.company,
      email: d.email,
      source: d.source,
      pipeline: d.pipeline,
      note: d.note.trim(),
    },
  }
}
