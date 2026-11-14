/** Sixth in-app guide content pack: finance paths beyond billing (EN ids; copy via i18n). */

import type { GuideCrmSection } from './guideCrm'

export type GuideFinanceSection = GuideCrmSection

export const GUIDE_FINANCE_SECTIONS: GuideFinanceSection[] = [
  {
    id: 'vendors',
    titleKey: 'guide.finance.vendors.title',
    bodyKey: 'guide.finance.vendors.body',
    to: '/vendors',
    linkKey: 'guide.finance.vendors.link',
  },
  {
    id: 'reports',
    titleKey: 'guide.finance.reports.title',
    bodyKey: 'guide.finance.reports.body',
    to: '/reports',
    linkKey: 'guide.finance.reports.link',
  },
  {
    id: 'mrr',
    titleKey: 'guide.finance.mrr.title',
    bodyKey: 'guide.finance.mrr.body',
    to: '/mrr',
    linkKey: 'guide.finance.mrr.link',
  },
  {
    id: 'insights',
    titleKey: 'guide.finance.insights.title',
    bodyKey: 'guide.finance.insights.body',
    to: '/insights',
    linkKey: 'guide.finance.insights.link',
  },
  {
    id: 'duplicates',
    titleKey: 'guide.finance.duplicates.title',
    bodyKey: 'guide.finance.duplicates.body',
    to: '/duplicates',
    linkKey: 'guide.finance.duplicates.link',
  },
]
