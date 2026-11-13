import { z } from 'zod'
import { DIVISIONS } from '../config'
import { firstZodError } from './common'

const divisionCodes = DIVISIONS.map((d) => d.code) as unknown as [string, ...string[]]

export type QuoteTemplateLineInput = {
  description: string
  qty: number
  unit_price: number
  remarks?: string
  sku?: string
}

export type QuoteTemplateFormInput = {
  name: string
  division_code: string
  description: string
  items: QuoteTemplateLineInput[]
}

export type QuoteTemplateLineParsed = {
  description: string
  qty: number
  unit_price: number
  remarks: string
  sku: string
}

export type QuoteTemplateFormParsed = {
  name: string
  division_code: string
  description: string
  items_json: QuoteTemplateLineParsed[]
}

const lineSchema = z.object({
  description: z.string(),
  qty: z.number().finite(),
  unit_price: z.number().finite(),
  remarks: z.string().optional(),
  sku: z.string().optional(),
})

export const quoteTemplateFormSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  division_code: z.enum(divisionCodes, { message: 'Pick a division' }),
  description: z.string(),
  items: z.array(lineSchema),
})

export function parseQuoteTemplateForm(
  input: QuoteTemplateFormInput,
): { ok: true; data: QuoteTemplateFormParsed } | { ok: false; error: string } {
  const result = quoteTemplateFormSchema.safeParse(input)
  if (!result.success) {
    return { ok: false, error: firstZodError(result.error, 'Check the template form') }
  }
  const d = result.data
  return {
    ok: true,
    data: {
      name: d.name,
      division_code: d.division_code,
      description: d.description.trim(),
      items_json: d.items
        .filter((i) => i.description.trim() || i.unit_price)
        .map((i) => ({
          description: i.description.trim(),
          qty: Number(i.qty) || 0,
          unit_price: Number(i.unit_price) || 0,
          remarks: i.remarks || '',
          sku: i.sku || '',
        })),
    },
  }
}
