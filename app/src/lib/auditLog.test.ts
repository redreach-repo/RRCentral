import { describe, expect, it } from 'vitest'
import { auditFieldChanges, auditRecordLabel, auditSummary, type AuditEntry } from './auditLog'

function entry(partial: Partial<AuditEntry>): AuditEntry {
  return {
    id: 1,
    table_name: 'invoices',
    operation: 'UPDATE',
    row_id: '9b2f1c3e-0000-0000-0000-000000000000',
    actor_email: 'sales@redreach.ae',
    changed_fields: [],
    old_data: null,
    new_data: null,
    created_at: '2026-09-26T10:00:00Z',
    ...partial,
  }
}

describe('auditLog', () => {
  it('labels records by their business reference, not UUID', () => {
    expect(auditRecordLabel(entry({ new_data: { reference_number: 'RR-01-26003', client: 'Maxtherm' } }))).toBe(
      'RR-01-26003',
    )
    expect(auditRecordLabel(entry({ old_data: { company_name: 'Acme' } }))).toBe('Acme')
    expect(auditRecordLabel(entry({}))).toBe('9b2f1c3e')
  })

  it('summarises inserts, deletes and updates', () => {
    expect(auditSummary(entry({ operation: 'INSERT', table_name: 'crm', new_data: { company_name: 'Lead Co' } }))).toBe(
      'Created CRM: Lead Co',
    )
    expect(auditSummary(entry({ operation: 'DELETE', old_data: { reference_number: 'RR-1' } }))).toBe(
      'Deleted Invoices: RR-1',
    )
    expect(
      auditSummary(
        entry({
          changed_fields: ['amount', 'status', 'notes', 'due_date'],
          new_data: { reference_number: 'RR-2' },
        }),
      ),
    ).toBe('Updated Invoices: RR-2 (amount, status, notes +1)')
  })

  it('lists before/after values for changed fields', () => {
    expect(
      auditFieldChanges(
        entry({
          changed_fields: ['status', 'notes'],
          old_data: { status: 'Draft', notes: '' },
          new_data: { status: 'Sent', notes: 'Emailed' },
        }),
      ),
    ).toEqual([
      { field: 'status', before: 'Draft', after: 'Sent' },
      { field: 'notes', before: '—', after: 'Emailed' },
    ])
  })
})

describe('audit focus', () => {
  it('puts contracts, prices and commission in their groups', async () => {
    const { auditFocusOf } = await import('./auditLog')
    expect(auditFocusOf({ table_name: 'contracts', row_id: 'x' })).toBe('contracts')
    expect(auditFocusOf({ table_name: 'delivery_packages', row_id: 'x' })).toBe('prices')
    expect(auditFocusOf({ table_name: 'ctrm_deal_commissions', row_id: 'x' })).toBe('commission')
    expect(auditFocusOf({ table_name: 'app_settings', row_id: 'deliveryMarketingRateAed' })).toBe('prices')
    expect(auditFocusOf({ table_name: 'app_settings', row_id: 'vatRate' })).toBe('prices')
    expect(auditFocusOf({ table_name: 'app_settings', row_id: 'deliveryInvoiceDivision' })).toBeNull()
    expect(auditFocusOf({ table_name: 'tickets', row_id: 'x' })).toBeNull()
  })

  it('names fields in plain words', async () => {
    const { auditFieldLabel } = await import('./auditLog')
    expect(auditFieldLabel('monthly_fee')).toBe('Monthly fee')
    expect(auditFieldLabel('expected_commission')).toBe('Expected commission')
    expect(auditFieldLabel('owner_user_id')).toBe('Owner user')
  })

  it('exports one CSV row per changed field', async () => {
    const { auditCsvRows } = await import('./auditLog')
    const rows = auditCsvRows([
      entry({
        table_name: 'contracts',
        changed_fields: ['monthly_fee', 'notes'],
        old_data: { monthly_fee: 4500, notes: '' },
        new_data: { monthly_fee: 4200, notes: 'Discount agreed' },
      }),
      entry({ operation: 'INSERT', table_name: 'crm', new_data: { company_name: 'Lead Co' } }),
    ])
    expect(rows).toHaveLength(4)
    expect(rows[1].slice(3)).toEqual(['Contracts', '9b2f1c3e', 'Monthly fee', '4500', '4200'])
    expect(rows[3].slice(2, 5)).toEqual(['INSERT', 'CRM', 'Lead Co'])
  })
})
