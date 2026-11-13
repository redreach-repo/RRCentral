import { z } from 'zod'
import { firstZodError } from './common'

export type InventoryAdjustInput = {
  sku: string
  delta: string
  reason: string
}

export type InventoryAdjustParsed = {
  sku: string
  qtyDelta: number
  reason: string
}

export const inventoryAdjustSchema = z
  .object({
    sku: z.string().trim().min(1, 'Pick a SKU'),
    delta: z.string().trim(),
    reason: z.string().trim().min(1, 'Enter a reason'),
  })
  .superRefine((val, ctx) => {
    const n = Number(val.delta)
    if (!Number.isFinite(n) || n === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['delta'],
        message: 'Enter a non-zero quantity',
      })
    }
  })

export function parseInventoryAdjust(
  input: InventoryAdjustInput,
): { ok: true; data: InventoryAdjustParsed } | { ok: false; error: string } {
  const result = inventoryAdjustSchema.safeParse(input)
  if (!result.success) {
    return { ok: false, error: firstZodError(result.error, 'Check the stock adjustment') }
  }
  return {
    ok: true,
    data: {
      sku: result.data.sku,
      qtyDelta: Number(result.data.delta),
      reason: result.data.reason,
    },
  }
}
