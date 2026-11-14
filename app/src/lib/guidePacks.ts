/**
 * In-app guide content packs (RRCRM M1+).
 * Each pack is a titled list of short paths with deep links into the app.
 */
import { GUIDE_BILLING_SECTIONS } from './guideBilling'
import { GUIDE_CRM_SECTIONS, type GuideCrmSection } from './guideCrm'

export type GuideSection = GuideCrmSection

export type GuidePack = {
  id: string
  titleKey: string
  sections: GuideSection[]
}

export const GUIDE_PACKS: GuidePack[] = [
  {
    id: 'crm',
    titleKey: 'guide.pack.crm',
    sections: GUIDE_CRM_SECTIONS,
  },
  {
    id: 'billing',
    titleKey: 'guide.pack.billing',
    sections: GUIDE_BILLING_SECTIONS,
  },
]
