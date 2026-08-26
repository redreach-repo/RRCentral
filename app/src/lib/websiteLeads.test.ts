import { describe, expect, it } from 'vitest'
import {
  buildCrmLeadFromInquiry,
  buildWebsiteInquiry,
  mailtoForInquiry,
  validateWebsiteInquiry,
  verticalBrandForInquiry,
} from './websiteLeads'

describe('websiteLeads', () => {
  it('rejects empty inquiries', () => {
    const result = validateWebsiteInquiry({
      name: '',
      email: 'not-an-email',
      phone: '',
      vertical: '',
      message: '',
    })
    expect(result.ok).toBe(false)
    expect(result.errors.name).toBeTruthy()
    expect(result.errors.email).toBeTruthy()
    expect(result.errors.message).toBeTruthy()
  })

  it('accepts a complete inquiry', () => {
    const result = validateWebsiteInquiry({
      name: 'Aisha Khan',
      email: 'aisha@example.com',
      phone: '+971500000000',
      vertical: 'connect',
      message: 'Need two VAs for operations.',
    })
    expect(result.ok).toBe(true)
  })

  it('maps slugs to vertical brands and builds a CRM lead', () => {
    expect(verticalBrandForInquiry('wanders')).toBe('RR Wanders')
    const inquiry = buildWebsiteInquiry(
      {
        name: 'Aisha Khan',
        email: 'aisha@example.com',
        phone: '+971500000000',
        vertical: 'connect',
        message: 'Need two VAs for operations.',
      },
      new Date('2026-08-26T10:00:00.000Z'),
      'inq-1',
    )
    expect(inquiry.status).toBe('new')
    const lead = buildCrmLeadFromInquiry(inquiry, new Date('2026-08-26T10:00:00.000Z'), 'crm-1')
    expect(lead.pipeline_stage).toBe('Lead')
    expect(lead.created_by).toBe('website')
    expect(lead.notes).toContain('RR Connect')
    expect(lead.email_phone).toBe('aisha@example.com')
    expect(lead.contacts?.[0]?.role).toBe('Primary')
  })

  it('builds a mailto fallback', () => {
    const href = mailtoForInquiry({
      name: 'Aisha',
      email: 'aisha@example.com',
      phone: '1',
      vertical: 'threads',
      message: 'Coveralls',
    })
    expect(href).toContain('mailto:info@redreach.ae')
    expect(decodeURIComponent(href)).toContain('RR Threads')
  })
})
