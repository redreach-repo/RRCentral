import { describe, expect, it } from 'vitest'
import { parseLinkDriveFileForm } from './linkDriveFile'

const okUrl = 'https://drive.google.com/file/d/abc123/view?usp=sharing'

describe('parseLinkDriveFileForm', () => {
  it('accepts a Drive share link', () => {
    const r = parseLinkDriveFileForm({
      company: ' Acme ',
      driveUrl: okUrl,
      docTitle: ' Signed quote ',
      notes: ' n ',
      relatedRef: ' Q-1 ',
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.company).toBe('Acme')
    expect(r.data.docTitle).toBe('Signed quote')
    expect(r.data.notes).toBe('n')
  })

  it('requires company', () => {
    const r = parseLinkDriveFileForm({
      company: ' ',
      driveUrl: okUrl,
      docTitle: 'X',
      notes: '',
      relatedRef: '',
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toMatch(/Company/i)
  })

  it('rejects non-Drive URLs', () => {
    const r = parseLinkDriveFileForm({
      company: 'Acme',
      driveUrl: 'https://example.com/file.pdf',
      docTitle: 'X',
      notes: '',
      relatedRef: '',
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toMatch(/Google Drive/i)
  })
})
