import { z } from 'zod'
import { DELIVERY_NOTE_STATUSES } from '../config'
import { firstZodError } from './common'

const STATUS_VALUES = [...DELIVERY_NOTE_STATUSES] as [string, ...string[]]

export type DeliveryNoteFormInput = {
  delivery_date: string
  status: string
  delivery_terms: string
  ship_to: string
  notes: string
  received_by: string
  vehicle_notes: string
}

export const deliveryNoteFormSchema = z.object({
  delivery_date: z
    .string()
    .trim()
    .refine((v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v), { message: 'Delivery date must be YYYY-MM-DD' }),
  status: z.enum(STATUS_VALUES),
  delivery_terms: z.string().trim(),
  ship_to: z.string().trim(),
  notes: z.string().trim(),
  received_by: z.string().trim(),
  vehicle_notes: z.string().trim(),
})

export function parseDeliveryNoteForm(
  input: DeliveryNoteFormInput,
): { ok: true; data: DeliveryNoteFormInput } | { ok: false; error: string } {
  const result = deliveryNoteFormSchema.safeParse(input)
  if (!result.success) {
    return { ok: false, error: firstZodError(result.error, 'Check the delivery note form') }
  }
  return { ok: true, data: result.data }
}
