import { describe, expect, it } from 'vitest'
import { driveFolderId, isGoogleDriveUrl } from './googleDrive'

describe('googleDrive links', () => {
  it('accepts Google Drive and Docs links only', () => {
    expect(isGoogleDriveUrl('https://drive.google.com/file/d/1AbC/view')).toBe(true)
    expect(isGoogleDriveUrl('https://docs.google.com/document/d/1AbC/edit')).toBe(true)
    expect(isGoogleDriveUrl('https://workdrive.zoho.com/file/abc')).toBe(false)
    expect(isGoogleDriveUrl('http://drive.google.com/file/d/1AbC/view')).toBe(false)
    expect(isGoogleDriveUrl('not a link')).toBe(false)
  })

  it('finds the folder id in a Google Drive folder link, like the Edge Function', () => {
    const id = '1AbCdEfGhIjKlMnOpQrStUvWxYz012345'
    expect(driveFolderId(`https://drive.google.com/drive/folders/${id}`)).toBe(id)
    expect(driveFolderId(`https://drive.google.com/drive/u/1/folders/${id}?usp=sharing`)).toBe(id)
    expect(driveFolderId(`https://drive.google.com/open?id=${id}`)).toBe(id)
    expect(driveFolderId(id)).toBe(id)
    expect(driveFolderId('https://workdrive.zoho.com/home/abc/folders/f1a2b3c4d5e6f7g8h9')).toBeNull()
    expect(driveFolderId('https://drive.google.com/drive/u/0/')).toBeNull()
    expect(driveFolderId('')).toBeNull()
  })
})
