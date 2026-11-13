import { z } from 'zod'
import { firstZodError } from './common'

export type CatalogProductFormInput = {
  sku: string
  name: string
  division_code: string
  unit_price: number
  unit_cost: number
  moq: number
  fabric: string
  unit: string
  active: boolean
  notes: string
  stock_on_hand: number
  reorder_level: number
  track_sizes: boolean
}

export const catalogProductFormSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  sku: z.string().trim(),
  division_code: z.string().trim().min(1, 'Pick a division'),
  unit_price: z.number().finite().min(0, 'Price cannot be negative'),
  unit_cost: z.number().finite().min(0, 'Cost cannot be negative'),
  moq: z.number().finite().min(0, 'MOQ cannot be negative'),
  fabric: z.string().trim(),
  unit: z.string().trim().min(1, 'Unit is required'),
  active: z.boolean(),
  notes: z.string(),
  stock_on_hand: z.number().finite(),
  reorder_level: z.number().finite().min(0, 'Reorder level cannot be negative'),
  track_sizes: z.boolean(),
})

export function parseCatalogProductForm(
  input: CatalogProductFormInput,
): { ok: true; data: CatalogProductFormInput } | { ok: false; error: string } {
  const result = catalogProductFormSchema.safeParse(input)
  if (!result.success) {
    return { ok: false, error: firstZodError(result.error, 'Check the product form') }
  }
  return {
    ok: true,
    data: {
      ...result.data,
      notes: result.data.notes.trim(),
    },
  }
}
