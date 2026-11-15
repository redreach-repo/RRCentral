import { db } from './db'
import {
  draftToBrandKitPatch,
  brandKitDraftProblem,
  type BrandKit,
  type BrandKitDraft,
} from './brandKit'

export async function saveCompanyBrandKit(input: {
  tenantId: string
  companyId: string
  draft: BrandKitDraft
  existingId?: string | null
}): Promise<BrandKit> {
  const problem = brandKitDraftProblem(input.draft)
  if (problem) throw new Error(problem)
  const patch = draftToBrandKitPatch(input.draft)
  const now = new Date().toISOString()

  if (input.existingId) {
    const { data, error } = await db
      .from('brand_kits')
      .update({ ...patch, updated_at: now })
      .eq('id', input.existingId)
      .select(
        'id, tenant_id, company_id, business_unit_id, primary_color, accent_color, neutral_dark, neutral_light, logo_horizontal_path, logo_light_path, mark_square_path, legal_footer',
      )
      .single()
    if (error) throw error
    return data as BrandKit
  }

  const { data, error } = await db
    .from('brand_kits')
    .insert({
      tenant_id: input.tenantId,
      company_id: input.companyId,
      business_unit_id: null,
      ...patch,
      updated_at: now,
    })
    .select(
      'id, tenant_id, company_id, business_unit_id, primary_color, accent_color, neutral_dark, neutral_light, logo_horizontal_path, logo_light_path, mark_square_path, legal_footer',
    )
    .single()
  if (error) throw error
  return data as BrandKit
}
