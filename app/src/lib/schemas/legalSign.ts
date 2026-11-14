import { signProblem } from '../legalDocuments'
import { firstZodError } from './common'
import { z } from 'zod'

export type LegalSignFormInput = {
  name: string
  date: string
  agreed: boolean
  signaturePng: string
}

export type LegalSignFormParsed = {
  name: string
  date: string
  agreed: true
  signature_png: string
}

const legalSignFormSchema = z.object({
  name: z.string(),
  date: z.string(),
  agreed: z.boolean(),
  signaturePng: z.string(),
})

/** Zod shell + shared `signProblem` rules (date window, signature PNG). */
export function parseLegalSignForm(
  input: LegalSignFormInput,
  now: Date = new Date(),
): { ok: true; data: LegalSignFormParsed } | { ok: false; error: string } {
  const shape = legalSignFormSchema.safeParse(input)
  if (!shape.success) {
    return { ok: false, error: firstZodError(shape.error, 'Check the signature form') }
  }
  const problem = signProblem(shape.data, now)
  if (problem) return { ok: false, error: problem }
  return {
    ok: true,
    data: {
      name: shape.data.name.trim(),
      date: shape.data.date.trim(),
      agreed: true,
      signature_png: shape.data.signaturePng.trim(),
    },
  }
}
