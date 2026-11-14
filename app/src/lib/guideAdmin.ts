/** Fourth in-app guide content pack: admin and platform paths (EN ids; copy via i18n). */

import type { GuideCrmSection } from './guideCrm'

export type GuideAdminSection = GuideCrmSection

export const GUIDE_ADMIN_SECTIONS: GuideAdminSection[] = [
  {
    id: 'settings',
    titleKey: 'guide.admin.settings.title',
    bodyKey: 'guide.admin.settings.body',
    to: '/settings',
    linkKey: 'guide.admin.settings.link',
  },
  {
    id: 'moduleFlags',
    titleKey: 'guide.admin.moduleFlags.title',
    bodyKey: 'guide.admin.moduleFlags.body',
    to: '/settings#module-flags',
    linkKey: 'guide.admin.moduleFlags.link',
  },
  {
    id: 'systemCheck',
    titleKey: 'guide.admin.systemCheck.title',
    bodyKey: 'guide.admin.systemCheck.body',
    to: '/system-check',
    linkKey: 'guide.admin.systemCheck.link',
  },
  {
    id: 'audit',
    titleKey: 'guide.admin.audit.title',
    bodyKey: 'guide.admin.audit.body',
    to: '/audit-log',
    linkKey: 'guide.admin.audit.link',
  },
  {
    id: 'appErrors',
    titleKey: 'guide.admin.appErrors.title',
    bodyKey: 'guide.admin.appErrors.body',
    to: '/app-errors',
    linkKey: 'guide.admin.appErrors.link',
  },
]
