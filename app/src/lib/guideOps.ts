/** Fifth in-app guide content pack: operations paths (EN ids; copy via i18n). */

import type { GuideCrmSection } from './guideCrm'

export type GuideOpsSection = GuideCrmSection

export const GUIDE_OPS_SECTIONS: GuideOpsSection[] = [
  {
    id: 'wanders',
    titleKey: 'guide.ops.wanders.title',
    bodyKey: 'guide.ops.wanders.body',
    to: '/app/wanders',
    linkKey: 'guide.ops.wanders.link',
  },
  {
    id: 'catalog',
    titleKey: 'guide.ops.catalog.title',
    bodyKey: 'guide.ops.catalog.body',
    to: '/catalog',
    linkKey: 'guide.ops.catalog.link',
  },
  {
    id: 'inventory',
    titleKey: 'guide.ops.inventory.title',
    bodyKey: 'guide.ops.inventory.body',
    to: '/inventory',
    linkKey: 'guide.ops.inventory.link',
  },
  {
    id: 'templates',
    titleKey: 'guide.ops.templates.title',
    bodyKey: 'guide.ops.templates.body',
    to: '/templates',
    linkKey: 'guide.ops.templates.link',
  },
  {
    id: 'domains',
    titleKey: 'guide.ops.domains.title',
    bodyKey: 'guide.ops.domains.body',
    to: '/domains',
    linkKey: 'guide.ops.domains.link',
  },
]
