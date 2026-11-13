import { z } from 'zod'
import { isDriveShareUrl } from '../customerFiles'
import { firstZodError } from './common'

export type LinkDriveFileFormInput = {
  company: string
  driveUrl: string
  docTitle: string
  notes: string
  relatedRef: string
}

export type LinkDriveFileFormParsed = {
  company: string
  driveUrl: string
  docTitle: string
  notes: string
  relatedRef: string
}

export const linkDriveFileFormSchema = z
  .object({
    company: z.string().trim().min(1, 'Company is required'),
    driveUrl: z.string().trim(),
    docTitle: z.string().trim().min(1, 'Give the file a short title'),
    notes: z.string(),
    relatedRef: z.string(),
  })
  .superRefine((val, ctx) => {
    if (!isDriveShareUrl(val.driveUrl)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Use a Google Drive share link',
        path: ['driveUrl'],
      })
    }
  })

export function parseLinkDriveFileForm(
  input: LinkDriveFileFormInput,
): { ok: true; data: LinkDriveFileFormParsed } | { ok: false; error: string } {
  const result = linkDriveFileFormSchema.safeParse(input)
  if (!result.success) {
    return { ok: false, error: firstZodError(result.error, 'Check the Drive link form') }
  }
  return {
    ok: true,
    data: {
      company: result.data.company,
      driveUrl: result.data.driveUrl,
      docTitle: result.data.docTitle,
      notes: result.data.notes.trim(),
      relatedRef: result.data.relatedRef.trim(),
    },
  }
}
