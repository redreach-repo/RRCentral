import { describe, expect, it } from 'vitest'
import {
  buildCustomerFolder,
  companiesMatch,
  communicationKindLabel,
  CUSTOMER_FOLDER_SECTIONS,
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

  it('maps signed and communication categories onto folder sections', () => {
    expect(sectionForCategory('signed_quotation')).toBe('quotation')
    expect(sectionForCategory('signed_invoice')).toBe('invoice')
    expect(sectionForCategory('signed_delivery_note')).toBe('delivery_note')
    expect(sectionForCategory('email')).toBe('communication')
    expect(sectionForCategory('whatsapp')).toBe('communication')
    expect(sectionForCategory('call_notes')).toBe('communication')
    expect(sectionForCategory('communication')).toBe('communication')
    expect(sectionForCategory('payment_slip')).toBe(null)
    expect(sectionForCategory('other')).toBe(null)
  })

  it('labels communication kinds for display', () => {
    expect(communicationKindLabel('whatsapp')).toBe('WhatsApp chat')
    expect(communicationKindLabel('email')).toBe('Email')
  })

  it('exposes four folder sections including Communications', () => {
    expect(CUSTOMER_FOLDER_SECTIONS.map((s) => s.id)).toEqual([
      'quotation',
      'invoice',
      'delivery_note',
      'communication',
    ])
    expect(CUSTOMER_FOLDER_SECTIONS.find((s) => s.id === 'communication')?.mode).toBe(
      'communication',
    )
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

  it('groups CRM docs, signed copies, and communications; hides payment slips', () => {
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
          id: 'f3',
          company_name: 'Maxtherm',
          crm_id: null,
          category: 'whatsapp',
          title: 'WhatsApp – uniforms follow-up',
          file_name: 'WhatsApp – uniforms follow-up',
          drive_url: 'https://workdrive.zoho.com/file/wa123',
          related_ref: 'RR-01-26001',
          notes: 'Exported Mar 2026',
          storage_provider: 'zoho_workdrive',
          uploaded_by: 'a@b.c',
          uploaded_at: '2026-09-13T10:00:00.000Z',
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
    expect(folder.bySection.communication).toHaveLength(1)
    expect(folder.bySection.communication[0].category).toBe('whatsapp')
    expect(folder.bySection.communication[0].subtitle).toContain('WhatsApp chat')
    expect(folder.items.some((i) => i.category === 'payment_slip')).toBe(false)
  })
})
