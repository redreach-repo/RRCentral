/**
 * In-app guide content packs (RRCRM M1+).
 * Each pack is a titled list of short paths with deep links into the app.
 */
import { GUIDE_ADMIN_SECTIONS } from './guideAdmin'
import { GUIDE_BILLING_SECTIONS } from './guideBilling'
import { GUIDE_CRM_SECTIONS, type GuideCrmSection } from './guideCrm'
import { GUIDE_DELIVERY_SECTIONS } from './guideDelivery'
import { GUIDE_OPS_SECTIONS } from './guideOps'

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
  {
    id: 'delivery',
    titleKey: 'guide.pack.delivery',
    sections: GUIDE_DELIVERY_SECTIONS,
  },
  {
    id: 'ops',
    titleKey: 'guide.pack.ops',
    sections: GUIDE_OPS_SECTIONS,
  },
  {
    id: 'admin',
    titleKey: 'guide.pack.admin',
    sections: GUIDE_ADMIN_SECTIONS,
  },
]
