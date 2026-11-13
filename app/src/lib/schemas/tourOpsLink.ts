import { z } from 'zod'
import { firstZodError } from './common'

export type TourOpsLinkFormInput = {
  packageId: string
  departureId: string
  dealId: string
  pax: string | number
}

export type TourOpsLinkFormParsed = {
  packageId: string
  departureId: string
  dealId: string
  pax: number
}

export const tourOpsLinkFormSchema = z.object({
  packageId: z.string().trim().min(1, 'Select a package with at least one departure'),
  departureId: z.string().trim().min(1, 'Select a package with at least one departure'),
  dealId: z.string().trim().min(1, 'Create a customer lead/deal first, then link a booking'),
  pax: z
    .union([z.string(), z.number()])
    .transform((raw) => (typeof raw === 'number' ? String(raw) : raw))
    .pipe(
      z
        .string()
        .trim()
        .superRefine((raw, ctx) => {
          const n = Number(raw)
          if (!Number.isFinite(n) || n <= 0 || n > 500) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter a passenger count' })
          }
        })
        .transform((raw) => Number(raw)),
    ),
})

export function parseTourOpsLinkForm(
  input: TourOpsLinkFormInput,
): { ok: true; data: TourOpsLinkFormParsed } | { ok: false; error: string } {
  const result = tourOpsLinkFormSchema.safeParse(input)
  if (!result.success) {
    return { ok: false, error: firstZodError(result.error, 'Check the booking link') }
  }
  return {
    ok: true,
    data: {
      packageId: result.data.packageId,
      departureId: result.data.departureId,
      dealId: result.data.dealId,
      pax: result.data.pax,
    },
  }
}
