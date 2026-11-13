import { describe, expect, it } from 'vitest'
import {
  coerceFieldValue,
  displayFieldValue,
  parseSelectOptions,
  slugifyFieldKey,
  type CustomFieldDefinition,
} from './customFields'

const def = (over: Partial<CustomFieldDefinition> = {}): CustomFieldDefinition => ({
  id: '1',
  object_type: 'account',
  field_key: 'x',
  label: 'X',
  field_type: 'text',
  options: [],
  required: false,
  sort_order: 0,
  active: true,
  ...over,
})

describe('customFields helpers', () => {
  it('slugifies labels into stable keys', () => {
    expect(slugifyFieldKey('Preferred Carrier')).toBe('preferred_carrier')
    expect(slugifyFieldKey('  VAT # / TRN  ')).toBe('vat_trn')
  })

  it('parses select options from arrays or CSV', () => {
    expect(parseSelectOptions(['A', 'B'])).toEqual(['A', 'B'])
    expect(parseSelectOptions('Gold, Silver\nBronze')).toEqual(['Gold', 'Silver', 'Bronze'])
  })

  it('coerces values by field type', () => {
    expect(coerceFieldValue('number', '12.5')).toBe(12.5)
    expect(coerceFieldValue('boolean', 'true')).toBe(true)
    expect(coerceFieldValue('multiselect', 'a')).toEqual(['a'])
    expect(coerceFieldValue('text', '')).toBeNull()
  })

  it('displays values for the UI', () => {
    expect(displayFieldValue(def({ field_type: 'boolean' }), true)).toBe('Yes')
    expect(displayFieldValue(def({ field_type: 'multiselect' }), ['A', 'B'])).toBe('A, B')
    expect(displayFieldValue(def(), null)).toBe('—')
  })
})
