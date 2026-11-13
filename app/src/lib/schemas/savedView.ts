import { z } from 'zod'
import { firstZodError } from './common'

export type SavedViewFormInput = {
  name: string
  module_id: string
  filters: Record<string, unknown>
  owner_user_id: string | null
}

export type SavedViewFormParsed = {
  name: string
  module_id: string
  filters: Record<string, unknown>
  owner_user_id: string | null
  is_shared: false
}

export const savedViewFormSchema = z.object({
  name: z.string().trim().min(1, 'Name the view'),
  module_id: z.string().trim().min(1, 'Module is required'),
  filters: z.record(z.string(), z.unknown()),
  owner_user_id: z.string().nullable(),
})

export function parseSavedViewForm(
  input: SavedViewFormInput,
): { ok: true; data: SavedViewFormParsed } | { ok: false; error: string } {
  const result = savedViewFormSchema.safeParse(input)
  if (!result.success) {
    return { ok: false, error: firstZodError(result.error, 'Check the saved view') }
  }
  return {
    ok: true,
    data: {
      name: result.data.name,
      module_id: result.data.module_id,
      filters: result.data.filters,
      owner_user_id: result.data.owner_user_id,
      is_shared: false,
    },
  }
}
