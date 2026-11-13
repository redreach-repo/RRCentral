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

export const CUSTOM_FIELD_TYPES: { value: CustomFieldType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'boolean', label: 'Yes / No' },
  { value: 'select', label: 'Select' },
  { value: 'multiselect', label: 'Multi-select' },
  { value: 'url', label: 'URL' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
]

export const CUSTOM_FIELD_OBJECTS: { value: string; label: string }[] = [
  { value: 'account', label: 'Account' },
  { value: 'crm', label: 'CRM lead' },
  { value: 'quotation', label: 'Quotation' },
]

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

export type CustomFieldValueRow = {
  id: string
  definition_id: string
  object_type: string
  record_id: string
  value: unknown
}

export type CustomFieldDefinitionInput = {
  object_type: string
  field_key?: string
  label: string
  field_type: CustomFieldType
  options?: string[]
  required?: boolean
  sort_order?: number
  active?: boolean
}

/** Slug used as field_key — stable once created. */
export function slugifyFieldKey(label: string): string {
  return String(label || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48) || 'field'
}

export function parseSelectOptions(options: unknown): string[] {
  if (Array.isArray(options)) {
    return options.map((o) => String(o).trim()).filter(Boolean)
  }
  if (typeof options === 'string') {
    return options
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean)
  }
  return []
}

export function coerceFieldValue(fieldType: CustomFieldType, raw: unknown): unknown {
  if (raw == null || raw === '') {
    if (fieldType === 'boolean') return false
    if (fieldType === 'multiselect') return []
    return null
  }
  switch (fieldType) {
    case 'number': {
      const n = Number(raw)
      return Number.isFinite(n) ? n : null
    }
    case 'boolean':
      return raw === true || raw === 'true' || raw === '1' || raw === 1
    case 'multiselect':
      return Array.isArray(raw) ? raw.map(String) : [String(raw)]
    default:
      return String(raw)
  }
}

export function displayFieldValue(def: CustomFieldDefinition, value: unknown): string {
  if (value == null || value === '') return '—'
  if (def.field_type === 'boolean') return value ? 'Yes' : 'No'
  if (def.field_type === 'multiselect' && Array.isArray(value)) {
    return value.length ? value.join(', ') : '—'
  }
  return String(value)
}

export async function listCustomFieldDefinitions(
  objectType: string,
  opts?: { includeInactive?: boolean },
): Promise<CustomFieldDefinition[]> {
  let q = db
    .from('custom_field_definitions')
    .select(
      'id, object_type, field_key, label, field_type, options, required, sort_order, active',
    )
    .eq('object_type', objectType)
    .order('sort_order')
    .order('label')
  if (!opts?.includeInactive) q = q.eq('active', true)
  const { data, error } = await q
  if (error || !data) return []
  return data as CustomFieldDefinition[]
}

export async function listAllCustomFieldDefinitions(): Promise<CustomFieldDefinition[]> {
  const { data, error } = await db
    .from('custom_field_definitions')
    .select(
      'id, object_type, field_key, label, field_type, options, required, sort_order, active',
    )
    .order('object_type')
    .order('sort_order')
    .order('label')
  if (error || !data) return []
  return data as CustomFieldDefinition[]
}

export async function saveCustomFieldDefinition(
  input: CustomFieldDefinitionInput,
  existingId?: string,
): Promise<CustomFieldDefinition> {
  const field_key = (input.field_key || slugifyFieldKey(input.label)).slice(0, 48)
  const row = {
    object_type: input.object_type,
    field_key,
    label: input.label.trim(),
    field_type: input.field_type,
    options: input.options || [],
    required: Boolean(input.required),
    sort_order: Number(input.sort_order) || 0,
    active: input.active !== false,
    updated_at: new Date().toISOString(),
  }
  if (existingId) {
    const { data, error } = await db
      .from('custom_field_definitions')
      .update(row)
      .eq('id', existingId)
      .select(
        'id, object_type, field_key, label, field_type, options, required, sort_order, active',
      )
      .single()
    if (error) throw error
    return data as CustomFieldDefinition
  }
  const { data, error } = await db
    .from('custom_field_definitions')
    .insert(row)
    .select(
      'id, object_type, field_key, label, field_type, options, required, sort_order, active',
    )
    .single()
  if (error) throw error
  return data as CustomFieldDefinition
}

export async function setCustomFieldDefinitionActive(id: string, active: boolean): Promise<void> {
  const { error } = await db
    .from('custom_field_definitions')
    .update({ active, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function loadCustomFieldValues(
  objectType: string,
  recordId: string,
): Promise<Record<string, unknown>> {
  const { data, error } = await db
    .from('custom_field_values')
    .select('definition_id, value')
    .eq('object_type', objectType)
    .eq('record_id', recordId)
  if (error || !data) return {}
  const out: Record<string, unknown> = {}
  for (const row of data as { definition_id: string; value: unknown }[]) {
    out[row.definition_id] = row.value
  }
  return out
}

export async function saveCustomFieldValues(
  objectType: string,
  recordId: string,
  defs: CustomFieldDefinition[],
  values: Record<string, unknown>,
): Promise<void> {
  const now = new Date().toISOString()
  for (const def of defs) {
    const coerced = coerceFieldValue(def.field_type, values[def.id])
    if (def.required && (coerced == null || coerced === '' || (Array.isArray(coerced) && !coerced.length))) {
      throw new Error(`${def.label} is required`)
    }
    const { data: existing, error: findErr } = await db
      .from('custom_field_values')
      .select('id')
      .eq('definition_id', def.id)
      .eq('record_id', recordId)
      .maybeSingle()
    if (findErr) throw findErr
    if (existing?.id) {
      const { error } = await db
        .from('custom_field_values')
        .update({ value: coerced, updated_at: now })
        .eq('id', existing.id)
      if (error) throw error
    } else {
      const { error } = await db.from('custom_field_values').insert({
        definition_id: def.id,
        object_type: objectType,
        record_id: recordId,
        value: coerced,
        updated_at: now,
      })
      if (error) throw error
    }
  }
}
