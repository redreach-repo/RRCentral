import { z } from 'zod'
import { termsProblem } from '../ctrmRenewals'
import { firstZodError } from './common'

export type CtrmTermsFormInput = {
  contract_start: string | null
  renewal_date: string | null
  notice: string
}

export type CtrmTermsFormParsed = {
  contract_start: string | null
  renewal_date: string | null
  notice_days: number
}

const optionalYmd = z
  .string()
  .nullable()
  .refine((v) => v == null || v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v), {
    message: 'Date must be YYYY-MM-DD',
  })
  .transform((v) => (v && v.trim() ? v : null))

export const ctrmTermsFormSchema = z
  .object({
    contract_start: optionalYmd,
    renewal_date: optionalYmd,
    notice: z.string(),
  })
  .superRefine((val, ctx) => {
    const notice_days = Number(val.notice || 0)
    const problem = termsProblem({
      contract_start: val.contract_start,
      renewal_date: val.renewal_date,
      notice_days,
    })
    if (problem) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: problem })
    }
  })

export function parseCtrmTermsForm(
  input: CtrmTermsFormInput,
): { ok: true; data: CtrmTermsFormParsed } | { ok: false; error: string } {
  const result = ctrmTermsFormSchema.safeParse(input)
  if (!result.success) {
    return { ok: false, error: firstZodError(result.error, 'Check the contract dates') }
  }
  return {
    ok: true,
    data: {
      contract_start: result.data.contract_start,
      renewal_date: result.data.renewal_date,
      notice_days: Number(result.data.notice || 0),
    },
  }
}
