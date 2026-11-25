import { describe, expect, it } from 'vitest'
import {
  EMPTY_PO,
  clientPoSetupNotes,
  formatPoMoney,
  PO_SCHEMA,
  matchPoClient,
  normaliseExtractedPo,
  parseExtractedPo,
  poContentType,
  poCurrency,
  poDate,
  poDriveFilename,
  poFileProblem,
  poIsEmpty,
  poNumber,
  poReaderContent,
  poReaderCostUsd,
  poTotal,
  poTotalsWarnings,
} from './clientPoReader'

describe('PO file checks', () => {
  it('takes PDFs and common photos, by type or by extension', () => {
    expect(poContentType('po.pdf', 'application/pdf')).toBe('application/pdf')
    expect(poContentType('PO.PDF', '')).toBe('application/pdf')
    expect(poContentType('scan.jpg', 'image/jpg')).toBe('image/jpeg')
    expect(poContentType('scan.jpeg', '')).toBe('image/jpeg')
    expect(poFileProblem('application/pdf', 2_000_000)).toBeNull()
    expect(poFileProblem('image/png', 1_000_000)).toBeNull()
  })

  it('explains what is wrong with other files', () => {
    expect(poFileProblem('image/heic', 1000)).toMatch(/HEIC/)
    expect(poFileProblem('application/vnd.ms-excel', 1000)).toMatch(/PDF or a photo/)
    expect(poFileProblem('application/pdf', 0)).toMatch(/empty/)
    expect(poFileProblem('application/pdf', 11 * 1024 * 1024)).toMatch(/10 MB/)
    expect(poFileProblem('image/jpeg', 6 * 1024 * 1024)).toMatch(/5 MB/)
  })

  it('sends a PDF as a document and a photo as an image, file first', () => {
    const pdf = poReaderContent('application/pdf', 'AAA') as { type: string; source: { media_type: string } }[]
    expect(pdf[0].type).toBe('document')
    expect(pdf[0].source.media_type).toBe('application/pdf')
    expect(pdf[1].type).toBe('text')
    const img = poReaderContent('image/png', 'BBB') as { type: string; source: { media_type: string } }[]
    expect(img[0].type).toBe('image')
    expect(img[0].source.media_type).toBe('image/png')
  })

  it('schema asks for every field and nothing else', () => {
    expect((PO_SCHEMA.required as string[]).sort()).toEqual(Object.keys(EMPTY_PO).sort())
    expect(PO_SCHEMA.additionalProperties).toBe(false)
  })

  it('costs the call at the Opus 5.5 price', () => {
    expect(poReaderCostUsd({ input_tokens: 1_000_000, output_tokens: 0 })).toBe(4)
    expect(poReaderCostUsd({ input_tokens: 0, output_tokens: 100_000 })).toBe(2)
  })
})

describe('cleaning what was read', () => {
  it('reads money written in different ways and refuses negatives', () => {
    expect(poNumber('AED 1,250.50')).toBe(1250.5)
    expect(poNumber(42)).toBe(42)
    expect(poNumber('')).toBeNull()
    expect(poNumber(-5)).toBeNull()
    expect(poNumber('n/a')).toBeNull()
    expect(poNumber(null)).toBeNull()
  })

  it('keeps only real dates', () => {
    expect(poDate('2026-04-03')).toBe('2026-04-03')
    expect(poDate('2026-02-30')).toBe('')
    expect(poDate('03/04/2026')).toBe('')
    expect(poDate(undefined)).toBe('')
  })

  it('turns dirham spellings into AED', () => {
    expect(poCurrency('Dhs')).toBe('AED')
    expect(poCurrency('aed')).toBe('AED')
    expect(poCurrency('usd')).toBe('USD')
    expect(poCurrency('dollars')).toBe('')
  })

  it('normalises a full answer and drops empty lines', () => {
    const po = normaliseExtractedPo({
      po_number: ' LPO-2026-118 ',
      client_name: 'Mass Allied Freighters L.L.C',
      client_trn: '100286214000003',
      contact_name: 'Ravi',
      issued_on: '2026-11-10',
      delivery_date: 'next week',
      currency: 'Dhs',
      line_items: [
        { description: 'Polo shirt, navy, embroidered', quantity: '120', unit: 'pcs', unit_price: '35', amount: '4,200' },
        { description: '', quantity: null, unit: '', unit_price: null, amount: null },
      ],
      subtotal: 4200,
      vat_rate: 5,
      vat_amount: 210,
      total: 4410,
      delivery_address: 'Jebel Ali',
      delivery_terms: 'Within 14 days',
      payment_terms: '30 days',
      notes: '',
      extra: 'ignored',
    })
    expect(po.po_number).toBe('LPO-2026-118')
    expect(po.currency).toBe('AED')
    expect(po.delivery_date).toBe('')
    expect(po.line_items).toEqual([
      { description: 'Polo shirt, navy, embroidered', quantity: 120, unit: 'pcs', unit_price: 35, amount: 4200 },
    ])
    expect(po.total).toBe(4410)
    expect('extra' in po).toBe(false)
  })

  it('bad JSON or nothing gives an empty PO', () => {
    expect(parseExtractedPo('not json')).toEqual(EMPTY_PO)
    expect(poIsEmpty(parseExtractedPo('{}'))).toBe(true)
    expect(poIsEmpty({ ...EMPTY_PO, po_number: 'X1' })).toBe(false)
  })

  it('a VAT rate over 100 is not a rate', () => {
    expect(normaliseExtractedPo({ vat_rate: 210 }).vat_rate).toBeNull()
  })
})

describe('totals', () => {
  const lines = [
    { description: 'A', quantity: 2, unit: '', unit_price: 50, amount: 100 },
    { description: 'B', quantity: 1, unit: '', unit_price: 200, amount: 200 },
  ]

  it('uses the printed total, else subtotal plus VAT, else the lines', () => {
    expect(poTotal({ total: 315, subtotal: 300, vat_amount: 15, line_items: lines })).toBe(315)
    expect(poTotal({ total: null, subtotal: 300, vat_amount: 15, line_items: lines })).toBe(315)
    expect(poTotal({ total: null, subtotal: null, vat_amount: null, line_items: lines })).toBe(300)
    expect(poTotal({ total: null, subtotal: null, vat_amount: null, line_items: [] })).toBeNull()
  })

  it('says nothing when the sums agree', () => {
    expect(poTotalsWarnings({ total: 315, subtotal: 300, vat_rate: 5, vat_amount: 15, line_items: lines })).toEqual([])
  })

  it('points at each sum that does not add up', () => {
    const w = poTotalsWarnings({
      total: 400,
      subtotal: 290,
      vat_rate: 5,
      vat_amount: 20,
      line_items: [{ description: 'A', quantity: 2, unit: '', unit_price: 50, amount: 90 }, lines[1]],
    })
    expect(w.some((x) => x.startsWith('Line 1'))).toBe(true)
    expect(w.some((x) => x.includes('subtotal says 290'))).toBe(false) // 90 + 200 = 290 agrees
    expect(w.some((x) => x.startsWith('VAT at 5%'))).toBe(true)
    expect(w.some((x) => x.startsWith('Subtotal plus VAT'))).toBe(true)
  })
})

describe('finding the client', () => {
  const clients = [
    { id: '1', company_name: 'Mass Allied Freighters L.L.C', trn: '100286214000003' },
    { id: '2', company_name: 'Emirates Uniforms Trading LLC', trn: '' },
    { id: '3', company_name: 'Gulf Steel FZE', trn: '' },
    { id: '4', company_name: 'Gulf Steel Industries', trn: '' },
  ]

  it('matches by TRN first', () => {
    expect(matchPoClient({ client_name: 'Someone else', client_trn: '100-2862-1400-0003' }, clients)?.id).toBe('1')
  })

  it('matches by name ignoring L.L.C, Trading and punctuation', () => {
    expect(matchPoClient({ client_name: 'MASS ALLIED FREIGHTERS LLC', client_trn: '' }, clients)?.id).toBe('1')
    expect(matchPoClient({ client_name: 'Emirates Uniforms', client_trn: '' }, clients)?.id).toBe('2')
  })

  it('picks nobody when two clients fit or none does', () => {
    expect(matchPoClient({ client_name: 'Gulf Steel', client_trn: '' }, clients)?.id).toBe('3')
    expect(matchPoClient({ client_name: 'Gulf', client_trn: '' }, clients)).toBeNull()
    expect(matchPoClient({ client_name: 'Unknown Buyer', client_trn: '' }, clients)).toBeNull()
    expect(matchPoClient({ client_name: '', client_trn: '' }, clients)).toBeNull()
  })

  it('names the Drive file after the PO', () => {
    expect(poDriveFilename('LPO-118', 'scan.pdf')).toBe('PO LPO-118 - scan.pdf')
    expect(poDriveFilename('', 'scan.pdf')).toBe('scan.pdf')
    expect(poDriveFilename('LPO-118', 'scan.pdf', 'RR-01-26003')).toBe('PO LPO-118 - Quote RR-01-26003 - scan.pdf')
    // relabelling an already filed name does not repeat the prefix
    expect(poDriveFilename('LPO-118', 'PO LPO-118 - Quote RR-01-26001 - scan.pdf', 'RR-01-26003')).toBe('PO LPO-118 - Quote RR-01-26003 - scan.pdf')
  })
})

describe('setup notes', () => {
  it('says nothing when everything is set up', () => {
    expect(clientPoSetupNotes({ reader: true, drive: true, reachable: true }, true)).toEqual([])
  })

  it('names each missing step on its own', () => {
    const notes = clientPoSetupNotes({ reader: false, drive: false, reachable: true }, false)
    expect(notes).toHaveLength(3)
    expect(notes[0]).toMatch(/client-po-file-and-details\.sql/)
    expect(notes[1]).toMatch(/ANTHROPIC_API_KEY/)
    expect(notes[2]).toMatch(/Settings > Google Drive/)
  })

  it('asks for the deploy first when the function is not there', () => {
    const notes = clientPoSetupNotes({ reader: false, drive: false, reachable: false }, true)
    expect(notes).toHaveLength(1)
    expect(notes[0]).toMatch(/Deploy Edge Functions/)
  })

  it('shows money with its currency', () => {
    expect(formatPoMoney(4410, 'aed')).toBe('4,410.00 AED')
    expect(formatPoMoney(null, 'USD')).toBe('—')
  })
})
