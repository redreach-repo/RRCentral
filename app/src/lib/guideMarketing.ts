/** Guide pack: marketing campaigns and segments (EN ids; copy via i18n). */

import type { GuideCrmSection } from './guideCrm'

export type GuideMarketingSection = GuideCrmSection

export const GUIDE_MARKETING_SECTIONS: GuideMarketingSection[] = [
  {
    id: 'campaigns',
    titleKey: 'guide.marketing.campaigns.title',
    bodyKey: 'guide.marketing.campaigns.body',
    to: '/marketing',
    linkKey: 'guide.marketing.campaigns.link',
  },
  {
    id: 'segments',
    titleKey: 'guide.marketing.segments.title',
    bodyKey: 'guide.marketing.segments.body',
    to: '/marketing',
    linkKey: 'guide.marketing.segments.link',
  },
]
