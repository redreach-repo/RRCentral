import { describe, expect, it } from 'vitest'
import { parseCustomFieldDefinitionForm } from './customFieldDefinition'

const base = {
  object_type: 'account',
  label: ' Industry ',
  field_type: 'text',
  optionsText: '',
  required: false,
  sort_order: 0,
  active: true,
}

describe('parseCustomFieldDefinitionForm', () => {
  it('accepts a text field', () => {
    const r = parseCustomFieldDefinitionForm(base)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.label).toBe('Industry')
    expect(r.data.field_type).toBe('text')
  })

  it('requires a label', () => {
    const r = parseCustomFieldDefinitionForm({ ...base, label: '  ' })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toMatch(/Label/i)
  })

  it('requires options for select fields', () => {
    const r = parseCustomFieldDefinitionForm({
      ...base,
      field_type: 'select',
      optionsText: '',
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toMatch(/option/i)
  })

  it('parses select options', () => {
    const r = parseCustomFieldDefinitionForm({
      ...base,
      field_type: 'select',
      optionsText: 'A\nB\n',
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.options).toEqual(['A', 'B'])
  })
})
