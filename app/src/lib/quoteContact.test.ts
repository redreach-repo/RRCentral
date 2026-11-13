import { describe, expect, it } from 'vitest'
import { newContact } from './contacts'
import {
  contactsForCompany,
  contactToQuoteFields,
  resolveQuoteContactSelection,
  shouldShowQuoteContactPicker,
} from './quoteContact'

describe('quote contact picker', () => {
  it('prefers CRM contacts for the company', () => {
    const list = contactsForCompany('Mass Allied Freighters', {
      crm: [
        {
          company_name: 'MASS ALLIED FREIGHTERS L.L.C',
          primary_contact: '',
          email_phone: '',
          mobile_number: '',
          office_number: '',
          contacts: [
            newContact({ id: '1', name: 'Aisha', role: 'Primary', email: 'aisha@example.com' }),
            newContact({ id: '2', name: 'Omar', role: 'Accounts', email: 'omar@example.com' }),
          ],
        },
      ],
      clients: [
        {
          id: 'c1',
          company_name: 'Mass Allied Freighters',
          primary_contact: 'Legacy',
          email: 'legacy@example.com',
          mobile: '',
          office: '',
          address: '',
          trn: '',
          notes: '',
          contacts: [],
          created_at: '',
        },
      ],
    })
    expect(list.map((c) => c.name)).toEqual(['Aisha', 'Omar'])
    expect(shouldShowQuoteContactPicker(list)).toBe(true)
  })

  it('defaults to Primary and restores a saved contact', () => {
    const contacts = [
      newContact({ id: '1', name: 'Aisha', role: 'Primary', email: 'aisha@example.com' }),
      newContact({ id: '2', name: 'Omar', role: 'Accounts', email: 'omar@example.com', phone: '97150' }),
    ]
    const def = resolveQuoteContactSelection(contacts)
    expect(def.fields.contact_name).toBe('Aisha')
    expect(def.contactId).toBe('1')

    const restored = resolveQuoteContactSelection(contacts, {
      contact_name: 'Omar',
      contact_email: 'omar@example.com',
      contact_phone: '',
    })
    expect(restored.contactId).toBe('2')
    expect(contactToQuoteFields(contacts[1])).toEqual({
      contact_name: 'Omar',
      contact_email: 'omar@example.com',
      contact_phone: '97150',
    })
  })

  it('hides the picker for a single contact', () => {
    expect(shouldShowQuoteContactPicker([newContact({ name: 'Only' })])).toBe(false)
    expect(shouldShowQuoteContactPicker([])).toBe(false)
  })
})
