import { db } from './db'
import {
  BRAND_KIT_COLUMNS,
  coerceBrandKit,
  draftToBrandKitPatch,
  brandKitDraftProblem,
  type BrandKit,
  type BrandKitDraft,
} from './brandKit'

export type BusinessUnitRow = {
  id: string
  company_id: string
  code: string
  name: string
  active: boolean
}

export async function listCompanyBusinessUnits(companyId: string): Promise<BusinessUnitRow[]> {
  const { data, error } = await db
    .from('business_units')
    .select('id, company_id, code, name, active')
    .eq('company_id', companyId)
    .eq('active', true)
    .order('code')
  if (error) throw error
  return (data || []) as BusinessUnitRow[]
}

/** Company kit (BU null) plus any BU kits under that company. */
export async function listBrandKitsForCompany(companyId: string): Promise<BrandKit[]> {
  const { data, error } = await db
    .from('brand_kits')
    .select(BRAND_KIT_COLUMNS)
    .eq('company_id', companyId)
  if (error) throw error
  return ((data || []) as BrandKit[]).map((row) => coerceBrandKit(row))
}

export async function saveBrandKit(input: {
  tenantId: string
  companyId: string
  businessUnitId?: string | null
  draft: BrandKitDraft
  existingId?: string | null
}): Promise<BrandKit> {
  const problem = brandKitDraftProblem(input.draft)
  if (problem) throw new Error(problem)
  const patch = draftToBrandKitPatch(input.draft)
  const now = new Date().toISOString()
  const buId = input.businessUnitId || null

  if (input.existingId) {
    const { data, error } = await db
      .from('brand_kits')
      .update({ ...patch, updated_at: now })
      .eq('id', input.existingId)
      .select(BRAND_KIT_COLUMNS)
      .single()
    if (error) throw error
    return coerceBrandKit(data as BrandKit)
  }

  const { data, error } = await db
    .from('brand_kits')
    .insert({
      tenant_id: input.tenantId,
      company_id: input.companyId,
      business_unit_id: buId,
      ...patch,
      updated_at: now,
    })
    .select(BRAND_KIT_COLUMNS)
    .single()
  if (error) throw error
  return coerceBrandKit(data as BrandKit)
}

/** @deprecated Prefer saveBrandKit — kept for callers that only edit company kits. */
export async function saveCompanyBrandKit(input: {
  tenantId: string
  companyId: string
  draft: BrandKitDraft
  existingId?: string | null
}): Promise<BrandKit> {
  return saveBrandKit({ ...input, businessUnitId: null })
}
