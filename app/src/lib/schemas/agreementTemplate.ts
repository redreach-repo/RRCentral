import { z } from 'zod'
import { checkTemplate } from '../serviceAgreement'
import { firstZodError } from './common'

export type AgreementDraftFormInput = {
  title: string
  body: string
}

export type AgreementDraftFormParsed = {
  title: string
  body: string
}

export const agreementDraftFormSchema = z
  .object({
    title: z.string(),
    body: z.string().trim().min(1, 'Paste or write the agreement wording'),
  })
  .superRefine((val, ctx) => {
    const problems = checkTemplate(val.body)
    if (problems.unknown.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `RR Central does not know ${problems.unknown.map((k) => `{{${k}}}`).join(', ')}. Pick from the known merge fields.`,
        path: ['body'],
      })
    }
  })

export function parseAgreementDraftForm(
  input: AgreementDraftFormInput,
): { ok: true; data: AgreementDraftFormParsed } | { ok: false; error: string } {
  const result = agreementDraftFormSchema.safeParse(input)
  if (!result.success) {
    return { ok: false, error: firstZodError(result.error, 'Check the agreement template') }
  }
  return {
    ok: true,
    data: {
      title: result.data.title.trim(),
      body: result.data.body,
    },
  }
}

export type AgreementApproveFormInput = {
  approvedBy: string
  approvedOn: string
  note: string
}

export type AgreementApproveFormParsed = {
  approvedBy: string
  approvedOn: string
  note: string
}

export const agreementApproveFormSchema = z.object({
  approvedBy: z.string().trim().min(1, 'Type the name of the lawyer who approved it.'),
  approvedOn: z.string(),
  note: z.string(),
})

export function parseAgreementApproveForm(
  input: AgreementApproveFormInput,
): { ok: true; data: AgreementApproveFormParsed } | { ok: false; error: string } {
  const result = agreementApproveFormSchema.safeParse(input)
  if (!result.success) {
    return { ok: false, error: firstZodError(result.error, 'Check the approval form') }
  }
  return {
    ok: true,
    data: {
      approvedBy: result.data.approvedBy,
      approvedOn: result.data.approvedOn.trim(),
      note: result.data.note.trim(),
    },
  }
}
