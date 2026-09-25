import { describe, expect, it } from 'vitest'
import {
  buildCustomerFolder,
  buildFolderChecklist,
  companiesMatch,
  communicationKindLabel,
  CUSTOMER_FOLDER_SECTIONS,
  filterFolderItems,
  folderFileCounts,
  isWorkDriveShareUrl,
  normalizeCompanyKey,
  relatedRefOptionsForSection,
  sectionForCategory,
  suggestedDocumentTitle,
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

  it('maps signed, communication, and purchasing categories onto folder sections', () => {
    expect(sectionForCategory('signed_quotation')).toBe('quotation')
    expect(sectionForCategory('signed_invoice')).toBe('invoice')
    expect(sectionForCategory('signed_delivery_note')).toBe('delivery_note')
    expect(sectionForCategory('email')).toBe('communication')
    expect(sectionForCategory('whatsapp')).toBe('communication')
    expect(sectionForCategory('supplier_invoice')).toBe('purchasing')
    expect(sectionForCategory('payment_slip')).toBe(null)
    expect(sectionForCategory('other')).toBe(null)
  })

  it('labels communication kinds and suggests titles', () => {
    expect(communicationKindLabel('whatsapp')).toBe('WhatsApp chat')
    expect(suggestedDocumentTitle('signed_quotation', 'RR-01-26001')).toBe('Signed RR-01-26001')
    expect(suggestedDocumentTitle('whatsapp', 'RR-01-26001')).toBe('WhatsApp – RR-01-26001')
    expect(suggestedDocumentTitle('supplier_invoice', 'RR-01-26001')).toBe(
      'Supplier invoice – RR-01-26001',
    )
  })

  it('exposes five folder sections including Communications and Purchasing', () => {
    expect(CUSTOMER_FOLDER_SECTIONS.map((s) => s.id)).toEqual([
      'quotation',
      'invoice',
      'delivery_note',
      'communication',
      'purchasing',
    ])
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

  it('groups CRM docs, signed copies, communications, and purchasing; hides payment slips', () => {
    const folder = buildCustomerFolder({
      company: 'Maxtherm',
      crm: {
        id: 'c1',
        company_name: 'Maxtherm',
        drive_folder_url: '',
      } as never,
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
          id: 'f4',
          company_name: 'Maxtherm',
          crm_id: null,
          category: 'supplier_invoice',
          title: 'Supplier invoice – RR-01-26001',
          file_name: 'Supplier invoice – RR-01-26001',
          drive_url: 'https://workdrive.zoho.com/file/si123',
          related_ref: 'RR-01-26001',
          notes: '',
          storage_provider: 'zoho_workdrive',
          uploaded_by: 'a@b.c',
          uploaded_at: '2026-09-11T10:00:00.000Z',
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
    expect(folder.bySection.communication).toHaveLength(1)
    expect(folder.bySection.purchasing).toHaveLength(1)
    expect(folder.items.some((i) => i.category === 'payment_slip')).toBe(false)

    const refs = relatedRefOptionsForSection(folder, 'communication')
    expect(refs.some((r) => r.value === 'RR-01-26001')).toBe(true)

    const checklist = buildFolderChecklist(folder)
    expect(checklist.some((c) => c.id === 'no-folder')).toBe(true)
    expect(checklist.some((c) => c.id.includes('signed-missing'))).toBe(true)

    const counts = folderFileCounts(folder)
    expect(counts.communication).toBe(1)
    expect(counts.purchasing).toBe(1)
    expect(counts.hasFolderUrl).toBe(false)

    expect(filterFolderItems(folder.items, 'whatsapp')).toHaveLength(1)
  })
})
