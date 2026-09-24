import { describe, expect, it } from 'vitest'
import {
  buildCustomerFolder,
  isWorkDriveShareUrl,
  suggestedDriveFolderName,
} from './customerFiles'

describe('customerFiles', () => {
  it('accepts Zoho WorkDrive share URLs', () => {
    expect(
      isWorkDriveShareUrl('https://workdrive.zoho.com/folder/abc'),
    ).toBe(true)
    expect(
      isWorkDriveShareUrl('https://workdrive.zohoexternal.com/external/3iWUoMURXKC-OCgNc'),
    ).toBe(true)
    expect(
      isWorkDriveShareUrl('https://workdrive.zoho.eu/folder/xyz'),
    ).toBe(true)
    expect(isWorkDriveShareUrl('https://drive.google.com/file/d/abc/view')).toBe(false)
    expect(isWorkDriveShareUrl('https://example.com/file.pdf')).toBe(false)
  })

  it('sanitizes folder names for WorkDrive', () => {
    expect(suggestedDriveFolderName('Acme / Trading: LLC')).toBe('Acme Trading LLC')
  })

  it('groups CRM docs and WorkDrive links into category folders', () => {
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
          category: 'payment_slip',
          title: 'Transfer 12 Sep',
          file_name: 'Transfer 12 Sep',
          drive_url: 'https://workdrive.zohoexternal.com/external/abc123',
          related_ref: 'INV-01',
          notes: '',
          storage_provider: 'zoho_workdrive',
          uploaded_by: 'a@b.c',
          uploaded_at: '2026-09-12T10:00:00.000Z',
        },
      ],
    })

    expect(folder.byCategory.quotation).toHaveLength(1)
    expect(folder.byCategory.delivery_note).toHaveLength(1)
    expect(folder.byCategory.payment_slip).toHaveLength(1)
    expect(folder.byCategory.quotation[0].href).toContain('/document/quote/')
    expect(folder.byCategory.payment_slip[0].driveUrl).toContain('workdrive.zoho')
    expect(folder.byCategory.payment_slip[0].kind).toBe('workdrive')
  })
})
