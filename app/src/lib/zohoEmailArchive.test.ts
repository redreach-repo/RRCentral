import { describe, expect, it } from 'vitest'
import {
  isZohoMessageAlreadyFiled,
  zohoMessageRelatedRef,
} from './zohoEmailArchive'

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
            drive_url: 'https://drive.google.com/file/d/x/view',
            related_ref: ref,
            notes: '',
            storage_provider: 'google_drive',
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
