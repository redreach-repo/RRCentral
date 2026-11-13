import { z } from 'zod'
import {
  CUSTOM_FIELD_OBJECTS,
  CUSTOM_FIELD_TYPES,
  parseSelectOptions,
  type CustomFieldType,
} from '../customFields'
import { firstZodError } from './common'

const objectTypes = CUSTOM_FIELD_OBJECTS.map((o) => o.value) as unknown as [string, ...string[]]
const fieldTypes = CUSTOM_FIELD_TYPES.map((t) => t.value) as unknown as [string, ...string[]]

export type CustomFieldDefinitionFormInput = {
  object_type: string
  label: string
  field_type: string
  optionsText: string
  required: boolean
  sort_order: number
  active: boolean
}

export type CustomFieldDefinitionFormParsed = {
  object_type: string
  label: string
  field_type: CustomFieldType
  options: string[]
  required: boolean
  sort_order: number
  active: boolean
}

export const customFieldDefinitionFormSchema = z
  .object({
    object_type: z.enum(objectTypes, { message: 'Pick an object type' }),
    label: z.string().trim().min(1, 'Label is required'),
    field_type: z.enum(fieldTypes, { message: 'Pick a field type' }),
    optionsText: z.string(),
    required: z.boolean(),
    sort_order: z.number().finite(),
    active: z.boolean(),
  })
  .superRefine((val, ctx) => {
    if (val.field_type === 'select' || val.field_type === 'multiselect') {
      const opts = parseSelectOptions(val.optionsText)
      if (!opts.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Add at least one option (one per line)',
          path: ['optionsText'],
        })
      }
    }
  })

export function parseCustomFieldDefinitionForm(
  input: CustomFieldDefinitionFormInput,
): { ok: true; data: CustomFieldDefinitionFormParsed } | { ok: false; error: string } {
  const result = customFieldDefinitionFormSchema.safeParse(input)
  if (!result.success) {
    return { ok: false, error: firstZodError(result.error, 'Check the custom field form') }
  }
  const d = result.data
  return {
    ok: true,
    data: {
      object_type: d.object_type,
      label: d.label,
      field_type: d.field_type as CustomFieldType,
      options: parseSelectOptions(d.optionsText),
      required: d.required,
      sort_order: d.sort_order,
      active: d.active,
    },
  }
}
