import { describe, expect, it } from 'vitest'
import {
  buildCustomerFolder,
  companiesMatch,
  isWorkDriveShareUrl,
  normalizeCompanyKey,
  sectionForCategory,
  suggestedDriveFolderName,
} from './customerFiles'

describe('customerFiles', () => {
  it('accepts Zoho WorkDrive share URLs', () => {
    expect(isWorkDriveShareUrl('https://workdrive.zoho.com/folder/abc')).toBe(true)
    expect(
      isWorkDriveShareUrl('https://workdrive.zohoexternal.com/external/3iWUoMURXKC-OCgNc'),
    ).toBe(true)
    expect(isWorkDriveShareUrl('https://example.com/file.pdf')).toBe(false)
  })

  it('maps signed categories onto quote / invoice / DN sections', () => {
    expect(sectionForCategory('signed_quotation')).toBe('quotation')
    expect(sectionForCategory('signed_invoice')).toBe('invoice')
    expect(sectionForCategory('signed_delivery_note')).toBe('delivery_note')
    expect(sectionForCategory('payment_slip')).toBe(null)
    expect(sectionForCategory('other')).toBe(null)
  })

  it('sanitizes folder names for WorkDrive', () => {
    expect(suggestedDriveFolderName('Acme / Trading: LLC')).toBe('Acme Trading LLC')
  })

  it('matches CRM company names to quote clients despite suffixes/spacing', () => {
    expect(normalizeCompanyKey('  Maxtherm  LLC ')).toBe('maxtherm llc')
    expect(companiesMatch('Maxtherm LLC', 'Maxtherm')).toBe(true)
    expect(companiesMatch('Jose Maria Mora', 'jose maria mora')).toBe(true)
    expect(companiesMatch('Acme', 'Beta Trading')).toBe(false)
  })

  it('groups CRM docs and signed WorkDrive copies into three sections only', () => {
    const folder = buildCustomerFolder({
      company: 'Maxtherm',
      crm: null,
      quotations: [
        {
          id: 'q1',
          client: 'Maxtherm',
          reference_number: 'RR-01-26001',
          quote_id: 'q1',
          description: 'Uniforms',
          date: '2026-09-01',
          status: 'Awarded',
        } as never,
      ],
      invoices: [],
      deliveryNotes: [
        {
          id: 'd1',
          client: 'Maxtherm',
          reference_number: 'DN-01-26001',
          quote_ref: 'RR-01-26001',
          date: '2026-09-10',
          status: 'Delivered',
        } as never,
      ],
      documents: [
        {
          id: 'f1',
          company_name: 'Maxtherm',
          crm_id: null,
          category: 'signed_delivery_note',
          title: 'Signed DN-01-26001',
          file_name: 'Signed DN-01-26001',
          drive_url: 'https://workdrive.zohoexternal.com/external/abc123',
          related_ref: 'DN-01-26001',
          notes: 'Signed copy',
          storage_provider: 'zoho_workdrive',
          uploaded_by: 'a@b.c',
          uploaded_at: '2026-09-12T10:00:00.000Z',
        },
        {
          id: 'f2',
          company_name: 'Maxtherm',
          crm_id: null,
          category: 'payment_slip',
          title: 'Should hide',
          file_name: 'Should hide',
          drive_url: 'https://workdrive.zoho.com/x',
          related_ref: '',
          notes: '',
          storage_provider: 'zoho_workdrive',
          uploaded_by: 'a@b.c',
          uploaded_at: '2026-09-12T10:00:00.000Z',
        },
      ],
    })

    expect(folder.bySection.quotation).toHaveLength(1)
    expect(folder.bySection.delivery_note).toHaveLength(2)
    expect(folder.bySection.delivery_note.some((i) => i.kind === 'workdrive')).toBe(true)
    expect(folder.items.some((i) => i.category === 'payment_slip')).toBe(false)
  })
})
