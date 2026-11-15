import { describe, expect, it } from 'vitest'
import {
  BUILTIN_INDUSTRY_PACKS,
  nextTenantPackStatus,
  packModuleHints,
} from './industryPacks'

describe('BUILTIN_INDUSTRY_PACKS', () => {
  it('includes core verticals', () => {
    expect(BUILTIN_INDUSTRY_PACKS.map((p) => p.pack_key)).toEqual(
      expect.arrayContaining(['uae_services', 'church_saas', 'trading_import', 'events_tours']),
    )
  })
})

describe('packModuleHints', () => {
  it('joins modules', () => {
    expect(packModuleHints(BUILTIN_INDUSTRY_PACKS[0])).toContain('sales')
  })
})

describe('nextTenantPackStatus', () => {
  it('activates available packs', () => {
    expect(nextTenantPackStatus('available', 'activate')).toBe('active')
  })

  it('retires active packs', () => {
    expect(nextTenantPackStatus('active', 'retire')).toBe('retired')
  })

  it('blocks activate after retire', () => {
    expect(nextTenantPackStatus('retired', 'activate')).toBeNull()
  })
})
