import { z } from 'zod'
import { firstZodError } from './common'

const MSG = 'Choose a PDF to fill the form. Store the file on Google Drive and paste the link below.'

export type ExpensePdfPickInput = {
  fileName: string
  mimeType: string
}

export type ExpensePdfPickParsed = {
  fileName: string
  mimeType: string
}

export const expensePdfPickSchema = z
  .object({
    fileName: z.string().trim().min(1, MSG),
    mimeType: z.string().trim(),
  })
  .superRefine((val, ctx) => {
    const isPdf = val.mimeType === 'application/pdf' || /\.pdf$/i.test(val.fileName)
    if (!isPdf) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: MSG })
    }
  })

export function parseExpensePdfPick(
  input: ExpensePdfPickInput,
): { ok: true; data: ExpensePdfPickParsed } | { ok: false; error: string } {
  const result = expensePdfPickSchema.safeParse(input)
  if (!result.success) {
    return { ok: false, error: firstZodError(result.error, MSG) }
  }
  return { ok: true, data: { fileName: result.data.fileName, mimeType: result.data.mimeType } }
}
