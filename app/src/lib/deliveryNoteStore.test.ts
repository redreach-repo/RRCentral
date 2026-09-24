import { beforeEach, describe, expect, it, vi } from 'vitest'

const mem = vi.hoisted(() => ({
  settings: new Map<string, string>(),
  quoteLines: [
    {
      id: 'li-1',
      doc_type: 'Quote',
      reference: 'Q-max',
      line_no: 1,
      description: 'Heat-resistant gloves',
      qty: 24,
      unit_price: 18,
      unit_cost: 7,
      vat_rate: 0.05,
      amount: 432,
      vat_amount: 21.6,
      line_total: 453.6,
      remarks: '',
      sku: 'GLV-HT',
      sizes_json: null,
      created_at: '2026-09-01T00:00:00.000Z',
    },
  ] as Array<Record<string, unknown>>,
}))

const missingTable = {
  code: 'PGRST205',
  message: "Could not find the table 'public.delivery_notes' in the schema cache",
}
const checkErr = {
  code: '23514',
  message: 'new row for relation "line_items" violates check constraint "line_items_doc_type_check"',
}

class FakeQuery {
  table: string
  op = 'select'
  payload: unknown = null
  filters: Array<{ col: string; val: unknown }> = []
  single = false

  constructor(table: string) {
    this.table = table
  }

  select() {
    return this
  }
  eq(col: string, val: unknown) {
    this.filters.push({ col, val })
    return this
  }
  ilike() {
    return this
  }
  order() {
    return this
  }
  maybeSingle() {
    this.single = true
    return this
  }
  insert(row: unknown) {
    this.op = 'insert'
    this.payload = row
    return this
  }
  upsert(row: unknown) {
    this.op = 'upsert'
    this.payload = row
    return this
  }
  update(row: unknown) {
    this.op = 'update'
    this.payload = row
    return this
  }
  delete() {
    this.op = 'delete'
    return this
  }

  then<T>(onFulfilled?: (v: { data: unknown; error: unknown }) => T, onRejected?: (e: unknown) => T) {
    return this.execute().then(onFulfilled, onRejected)
  }

  private async execute(): Promise<{ data: unknown; error: unknown }> {
    if (this.table === 'delivery_notes') {
      return { data: this.single ? null : [], error: missingTable }
    }
    if (this.table === 'clients') {
      return { data: null, error: null }
    }
    if (this.table === 'line_items') {
      if (this.op === 'insert' || this.op === 'delete') {
        const docType = this.filters.find((f) => f.col === 'doc_type')?.val
        const payloadType = Array.isArray(this.payload)
          ? (this.payload[0] as { doc_type?: string } | undefined)?.doc_type
          : (this.payload as { doc_type?: string } | null)?.doc_type
        if (docType === 'DeliveryNote' || payloadType === 'DeliveryNote') {
          return { data: null, error: checkErr }
        }
        return { data: null, error: null }
      }
      const docType = this.filters.find((f) => f.col === 'doc_type')?.val
      const ref = this.filters.find((f) => f.col === 'reference')?.val
      if (docType === 'Quote' && (ref === 'Q-max' || ref === 'RR-01-26003')) {
        const rows = mem.quoteLines.filter((r) => r.reference === ref || r.reference === 'Q-max')
        return { data: rows, error: null }
      }
      return { data: [], error: null }
    }
    if (this.table === 'app_settings') {
      if (this.op === 'upsert') {
        const row = this.payload as { key: string; value: string }
        mem.settings.set(row.key, row.value)
        return { data: row, error: null }
      }
      const key = this.filters.find((f) => f.col === 'key')?.val
      const value = typeof key === 'string' ? mem.settings.get(key) : undefined
      if (this.single) {
        return { data: value != null ? { key, value } : null, error: null }
      }
      return { data: value != null ? [{ key, value }] : [], error: null }
    }
    return { data: this.single ? null : [], error: null }
  }
}

vi.mock('./db', () => ({
  db: {
    from(table: string) {
      return new FakeQuery(table)
    },
  },
}))

vi.mock('./activity', () => ({
  logActivity: vi.fn(async () => undefined),
}))

import { createDeliveryNoteFromQuote } from './deliveryNotes'
import { listDeliveryNotes, loadDeliveryNoteLineItems } from './deliveryNoteStore'
import type { Quotation } from './types'

describe('create delivery note when Supabase has no delivery_notes table', () => {
  beforeEach(() => {
    mem.settings.clear()
  })

  it('still issues Maxtherm RR-01-26003 via app_settings fallback', async () => {
    const quote = {
      id: 'uuid-max',
      client: 'Maxtherm',
      vertical: 'RR Threads',
      division_code: '01',
      reference_number: 'RR-01-26003',
      quote_id: 'Q-max',
      description: 'Industrial PPE',
      delivery_terms: 'Ex-works Dubai',
      notes: '',
      status: 'Sent',
    } as Quotation

    const note = await createDeliveryNoteFromQuote({
      quote,
      who: 'info@redreach.ae',
      prefix: 'DN',
    })

    expect(note.client).toBe('Maxtherm')
    expect(note.quote_ref).toBe('RR-01-26003')
    expect(note.status).toBe('Issued')
    expect(note.reference_number).toMatch(/^DN-01-\d{5}$/)

    const listed = await listDeliveryNotes()
    expect(listed.some((n) => n.id === note.id)).toBe(true)

    const items = await loadDeliveryNoteLineItems(note.reference_number)
    expect(items).toHaveLength(1)
    expect(items[0].description).toBe('Heat-resistant gloves')
    expect(items[0].qty).toBe(24)
    expect(items[0].unit_price).toBe(0)

    const blob = JSON.parse(mem.settings.get('delivery_notes_store') || '{}') as {
      notes: Array<{ quote_ref: string }>
      items: Array<{ description: string; unit_price: number }>
    }
    expect(blob.notes[0].quote_ref).toBe('RR-01-26003')
    expect(blob.items[0].unit_price).toBe(0)
  })
})
