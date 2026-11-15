import { describe, expect, it } from 'vitest'
import { displayFieldValue, type CustomFieldDefinition } from './customFields'

describe('custom field list display', () => {
  it('formats values for list cells', () => {
    const def: CustomFieldDefinition = {
      id: 'd1',
      object_type: 'account',
      field_key: 'tier',
      label: 'Tier',
      field_type: 'text',
      options: [],
      required: false,
      sort_order: 0,
      active: true,
    }
    expect(displayFieldValue(def, 'Gold')).toBe('Gold')
    expect(displayFieldValue(def, null)).toMatch(/—|-/)
  })
})
