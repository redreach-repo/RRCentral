import { describe, expect, it } from 'vitest'
import { REDREACH_DEFAULT_BRAND } from './brandKit'
import { PRODUCT } from './product'
import {
  appNameProblem,
  buildTenantWebManifest,
  clampAppShortName,
  identityFromBrandKit,
  tenantManifestId,
} from './tenantAppIdentity'

describe('clampAppShortName', () => {
  it('caps at 12 characters', () => {
    expect(clampAppShortName('Al Noor Contracting LLC')).toHaveLength(12)
    expect(clampAppShortName('Short')).toBe('Short')
  })
})

describe('appNameProblem', () => {
  it('blocks empty and reserved names', () => {
    expect(appNameProblem('')).toBe('app_name_required')
    expect(appNameProblem('HighMast Support')).toBe('app_name_reserved')
    expect(appNameProblem('Al Noor Contracting')).toBeNull()
  })
})

describe('buildTenantWebManifest', () => {
  it('uses a unique id and company display name', () => {
    const m = buildTenantWebManifest({
      tenantId: 't1',
      companyId: 'c1',
      displayName: 'Al Noor Contracting',
      primaryColor: '#0F6B6B',
    })
    expect(m.name).toBe('Al Noor Contracting')
    expect(m.short_name.length).toBeLessThanOrEqual(12)
    expect(m.theme_color).toBe('#0F6B6B')
    expect(m.id).toContain('tenant=t1')
    expect(m.id).toContain('c-c1')
    expect(m.description).toContain(PRODUCT.name)
  })
})

describe('identityFromBrandKit', () => {
  it('prefers company name then legal footer', () => {
    const id = identityFromBrandKit({
      tenantId: REDREACH_DEFAULT_BRAND.tenant_id,
      companyId: REDREACH_DEFAULT_BRAND.company_id,
      companyName: 'Red Reach',
      kit: REDREACH_DEFAULT_BRAND,
    })
    expect(id.displayName).toBe('Red Reach')
    expect(id.primaryColor).toBe(REDREACH_DEFAULT_BRAND.primary_color)
    expect(id.markUrl).toContain('redreach-mark-square')
  })
})

describe('tenantManifestId', () => {
  it('differs by company so installs do not collide', () => {
    expect(tenantManifestId('t1', 'a')).not.toBe(tenantManifestId('t1', 'b'))
  })
})
