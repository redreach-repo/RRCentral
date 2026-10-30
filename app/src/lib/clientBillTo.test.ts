import { describe, expect, it } from 'vitest'
import { billToDraftFor, clientBillToPatch, matchClient } from './clientBillTo'
import type { Client } from './types'

function client(partial: Partial<Client>): Client {
  return {
    id: 'c1',
    company_name: 'Arabian Sky Business',
    primary_contact: '',
    email: '',
    mobile: '',
    office: '',
    address: '',
    trn: '',
    notes: '',
    created_at: '',
    ...partial,
  }
}

describe('client bill-to on invoice and quotation forms', () => {
  const clients = [
    client({ id: 'a', company_name: 'Arabian Sky Business L.L.C', address: 'Office 4, Dubai', trn: '100000000000001' }),
    client({ id: 'b', company_name: 'Blank Co' }),
  ]

  it('matches the saved client despite L.L.C and case differences', () => {
    expect(matchClient(clients, 'arabian sky business')?.id).toBe('a')
    expect(matchClient(clients, 'Someone New')).toBeNull()
    expect(matchClient(clients, '  ')).toBeNull()
  })

  it('prefills address and TRN from the client record', () => {
    expect(billToDraftFor(clients, 'Arabian Sky Business')).toEqual({ address: 'Office 4, Dubai', trn: '100000000000001' })
  })

  it('prefills Mass Allied from the known letterhead even without a client row', () => {
    expect(billToDraftFor([], 'Mass Allied Freighters')?.trn).toBe('100286214000003')
  })

  it('returns empty fields for a saved client with no details, and null for an unknown name', () => {
    expect(billToDraftFor(clients, 'Blank Co')).toEqual({ address: '', trn: '' })
    expect(billToDraftFor(clients, 'Someone New')).toBeNull()
  })

  it('writes back only filled-in values that changed', () => {
    const existing = { address: 'Office 4, Dubai', trn: '100000000000001' }
    expect(clientBillToPatch(existing, { address: 'Office 4, Dubai', trn: '100000000000001' })).toEqual({})
    expect(clientBillToPatch(existing, { address: 'Office 9, Dubai ', trn: '' })).toEqual({ address: 'Office 9, Dubai' })
    expect(clientBillToPatch(null, { address: '', trn: '123' })).toEqual({ trn: '123' })
  })

  it('never wipes saved details when the fields are left blank', () => {
    expect(clientBillToPatch({ address: 'Office 4', trn: '1' }, { address: ' ', trn: '' })).toEqual({})
  })
})
