import { describe, expect, it } from 'vitest'
import {
  applyPackFlagsToMap,
  BUILTIN_INDUSTRY_PACKS,
  moduleFlagsForPack,
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

describe('moduleFlagsForPack / applyPackFlagsToMap', () => {
  it('maps manifest modules to shell flags and clears hides', () => {
    const trading = BUILTIN_INDUSTRY_PACKS.find((p) => p.pack_key === 'trading_import')!
    expect(moduleFlagsForPack(trading)).toEqual(['sales', 'ops', 'finance'])
    const { flags, enabled } = applyPackFlagsToMap(
      { sales: false, ops: false, hr: false },
      trading,
    )
    expect(enabled).toEqual(['sales', 'ops', 'finance'])
    expect(flags.sales).toBeUndefined()
    expect(flags.ops).toBeUndefined()
    expect(flags.hr).toBe(false)
  })
})
