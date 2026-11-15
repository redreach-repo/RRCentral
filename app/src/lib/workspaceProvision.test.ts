import { describe, expect, it } from 'vitest'
import {
  buildIdempotencyKey,
  packKeyForBusinessType,
  provisionRequestProblem,
  workspaceNameProblem,
} from './workspaceProvision'

describe('workspaceProvision', () => {
  it('maps business types to packs', () => {
    expect(packKeyForBusinessType('engineering')).toBe('engineering')
    expect(packKeyForBusinessType('nope')).toBeNull()
  })

  it('validates provision input', () => {
    expect(workspaceNameProblem('')).toBe('workspace_name_required')
    expect(
      provisionRequestProblem({
        workspaceName: 'Al Noor',
        adminEmail: 'a@b.co',
        businessType: 'services',
      }),
    ).toBeNull()
    expect(buildIdempotencyKey({ workspaceName: 'A', adminEmail: 'a@b.co', businessType: 'services' })).toMatch(/^ws_/)
  })
})
