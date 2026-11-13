import { z } from 'zod'
import { unknownPlaceholders } from '../nda'
import { firstZodError } from './common'
export { parseAgreementApproveForm as parseNdaApproveForm } from './agreementTemplate'
export type { AgreementApproveFormInput as NdaApproveFormInput, AgreementApproveFormParsed as NdaApproveFormParsed } from './agreementTemplate'

export type NdaDraftFormInput = {
  title: string
  body: string
}

export type NdaDraftFormParsed = {
  title: string
  body: string
}

export const ndaDraftFormSchema = z
  .object({
    title: z.string().trim().min(1, 'Give the NDA a title'),
    body: z.string().trim().min(1, 'Paste or write the NDA wording'),
  })
  .superRefine((val, ctx) => {
    const unknown = unknownPlaceholders(val.body)
    if (unknown.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Unknown placeholders: ${unknown.map((k) => `{{${k}}}`).join(', ')}`,
        path: ['body'],
      })
    }
  })

export function parseNdaDraftForm(
  input: NdaDraftFormInput,
): { ok: true; data: NdaDraftFormParsed } | { ok: false; error: string } {
  const result = ndaDraftFormSchema.safeParse(input)
  if (!result.success) {
    return { ok: false, error: firstZodError(result.error, 'Check the NDA template') }
  }
  return { ok: true, data: { title: result.data.title, body: result.data.body } }
}
