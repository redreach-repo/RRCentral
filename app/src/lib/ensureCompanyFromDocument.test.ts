import { describe, expect, it } from 'vitest'
import { ensureCompanyFromDocument } from './ensureCompanyFromDocument'

describe('ensureCompanyFromDocument', () => {
  it('skips when the company name is blank', async () => {
    const result = await ensureCompanyFromDocument({ company: '  ' })
    expect(result).toEqual({
      client: 'unchanged',
      crm: 'skipped',
      crmId: null,
      driveFolder: 'skipped',
      detail: 'No company name',
    })
  })
})
