import { describe, expect, it } from 'vitest'
import { parseDeliveryNoteForm } from './deliveryNote'

const base = {
  delivery_date: '2026-11-13',
  status: 'Issued',
  delivery_terms: '',
  ship_to: 'Warehouse A',
  notes: '',
  received_by: '',
  vehicle_notes: '',
}

describe('parseDeliveryNoteForm', () => {
  it('rejects an unknown status', () => {
    const r = parseDeliveryNoteForm({ ...base, status: 'Shipped' })
    expect(r.ok).toBe(false)
  })

  it('rejects a bad date', () => {
    const r = parseDeliveryNoteForm({ ...base, delivery_date: '13/11/2026' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/date/i)
  })

  it('accepts a valid note', () => {
    const r = parseDeliveryNoteForm(base)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.ship_to).toBe('Warehouse A')
  })

  it('allows an empty delivery date', () => {
    const r = parseDeliveryNoteForm({ ...base, delivery_date: '' })
    expect(r.ok).toBe(true)
  })
})
