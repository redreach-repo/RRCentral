import { z } from 'zod'
import { firstZodError } from './common'

export type DeliveryRequirementFormInput = {
  title: string
  detail: string
}

export type DeliveryRequirementFormParsed = {
  title: string
  detail: string
}

export const deliveryRequirementFormSchema = z.object({
  title: z.string().trim().min(1, 'Add a requirement title'),
  detail: z.string().trim(),
})

export function parseDeliveryRequirementForm(
  input: DeliveryRequirementFormInput,
): { ok: true; data: DeliveryRequirementFormParsed } | { ok: false; error: string } {
  const result = deliveryRequirementFormSchema.safeParse(input)
  if (!result.success) {
    return { ok: false, error: firstZodError(result.error, 'Check the requirement') }
  }
  return { ok: true, data: { title: result.data.title, detail: result.data.detail } }
}
