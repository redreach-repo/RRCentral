/** First in-app guide content pack: day-to-day CRM paths (EN ids; copy via i18n). */

export type GuideCrmSection = {
  id: string
  titleKey: string
  bodyKey: string
  to: string
  linkKey: string
}

export const GUIDE_CRM_SECTIONS: GuideCrmSection[] = [
  {
    id: 'myday',
    titleKey: 'guide.crm.myday.title',
    bodyKey: 'guide.crm.myday.body',
    to: '/crm',
    linkKey: 'guide.crm.myday.link',
  },
  {
    id: 'pipeline',
    titleKey: 'guide.crm.pipeline.title',
    bodyKey: 'guide.crm.pipeline.body',
    to: '/deals',
    linkKey: 'guide.crm.pipeline.link',
  },
  {
    id: 'quotes',
    titleKey: 'guide.crm.quotes.title',
    bodyKey: 'guide.crm.quotes.body',
    to: '/quotations',
    linkKey: 'guide.crm.quotes.link',
  },
  {
    id: 'support',
    titleKey: 'guide.crm.support.title',
    bodyKey: 'guide.crm.support.body',
    to: '/support',
    linkKey: 'guide.crm.support.link',
  },
  {
    id: 'contracts',
    titleKey: 'guide.crm.contracts.title',
    bodyKey: 'guide.crm.contracts.body',
    to: '/crm',
    linkKey: 'guide.crm.contracts.link',
  },
]
