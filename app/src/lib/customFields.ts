import { db } from './db'

export type CustomFieldType =
  | 'text'
  | 'number'
  | 'date'
  | 'boolean'
  | 'select'
  | 'multiselect'
  | 'url'
  | 'email'
  | 'phone'

export type CustomFieldDefinition = {
  id: string
  object_type: string
  field_key: string
  label: string
  field_type: CustomFieldType
  options: unknown
  required: boolean
  sort_order: number
  active: boolean
}

/** List active custom field definitions for an object (M2 foundation). */
export async function listCustomFieldDefinitions(
  objectType: string,
): Promise<CustomFieldDefinition[]> {
  const { data, error } = await db
    .from('custom_field_definitions')
    .select(
      'id, object_type, field_key, label, field_type, options, required, sort_order, active',
    )
    .eq('object_type', objectType)
    .eq('active', true)
    .order('sort_order')
  if (error || !data) return []
  return data as CustomFieldDefinition[]
}
