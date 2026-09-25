import { describe, expect, it } from 'vitest'
import {
  isZohoMessageAlreadyFiled,
  zohoMessageRelatedRef,
} from './zohoEmailArchive'
import { parseWorkDriveResourceId } from './zohoWorkDrive'

describe('zohoWorkDrive parseWorkDriveResourceId', () => {
  it('parses folder URLs and bare ids', () => {
    expect(parseWorkDriveResourceId('https://workdrive.zoho.com/folder/abc123XYZ99')).toBe(
      'abc123XYZ99',
    )
    expect(
      parseWorkDriveResourceId('https://workdrive.zoho.eu/home/xxx/folders/folderIdHere99'),
    ).toBe('folderIdHere99')
    expect(parseWorkDriveResourceId('plainResourceId99')).toBe('plainResourceId99')
    expect(parseWorkDriveResourceId('https://example.com/nope')).toBe(null)
  })
})

describe('zohoEmailArchive dedupe', () => {
  it('detects already-filed Zoho messages', () => {
    const ref = zohoMessageRelatedRef('msg-123')
    expect(ref).toBe('zoho-msg:msg-123')
    expect(
      isZohoMessageAlreadyFiled(
        [
          {
            id: '1',
            company_name: 'Acme',
            crm_id: null,
            category: 'email',
            title: 'Email',
            file_name: 'Email',
            drive_url: 'https://workdrive.zoho.com/file/x',
            related_ref: ref,
            notes: '',
            storage_provider: 'zoho_workdrive',
            uploaded_by: 'a@b.c',
            uploaded_at: '',
          },
        ],
        'msg-123',
      ),
    ).toBe(true)
    expect(isZohoMessageAlreadyFiled([], 'msg-123')).toBe(false)
  })
})
