/** Third in-app guide content pack: delivery and client care paths (EN ids; copy via i18n). */

import type { GuideCrmSection } from './guideCrm'

export type GuideDeliverySection = GuideCrmSection

export const GUIDE_DELIVERY_SECTIONS: GuideDeliverySection[] = [
  {
    id: 'accounts',
    titleKey: 'guide.delivery.accounts.title',
    bodyKey: 'guide.delivery.accounts.body',
    to: '/accounts',
    linkKey: 'guide.delivery.accounts.link',
  },
  {
    id: 'health',
    titleKey: 'guide.delivery.health.title',
    bodyKey: 'guide.delivery.health.body',
    to: '/client-health',
    linkKey: 'guide.delivery.health.link',
  },
  {
    id: 'reports',
    titleKey: 'guide.delivery.reports.title',
    bodyKey: 'guide.delivery.reports.body',
    to: '/client-reports',
    linkKey: 'guide.delivery.reports.link',
  },
  {
    id: 'updates',
    titleKey: 'guide.delivery.updates.title',
    bodyKey: 'guide.delivery.updates.body',
    to: '/client-updates',
    linkKey: 'guide.delivery.updates.link',
  },
  {
    id: 'obligations',
    titleKey: 'guide.delivery.obligations.title',
    bodyKey: 'guide.delivery.obligations.body',
    to: '/obligations',
    linkKey: 'guide.delivery.obligations.link',
  },
]
