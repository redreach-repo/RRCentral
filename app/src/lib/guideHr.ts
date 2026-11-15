/** Guide pack: HR people / leave / attendance / payroll paths. */

import type { GuideCrmSection } from './guideCrm'

export type GuideHrSection = GuideCrmSection

export const GUIDE_HR_SECTIONS: GuideHrSection[] = [
  {
    id: 'people',
    titleKey: 'guide.hr.people.title',
    bodyKey: 'guide.hr.people.body',
    to: '/hr/people',
    linkKey: 'guide.hr.people.link',
  },
  {
    id: 'leave',
    titleKey: 'guide.hr.leave.title',
    bodyKey: 'guide.hr.leave.body',
    to: '/hr/leave',
    linkKey: 'guide.hr.leave.link',
  },
  {
    id: 'attendance',
    titleKey: 'guide.hr.attendance.title',
    bodyKey: 'guide.hr.attendance.body',
    to: '/hr/attendance',
    linkKey: 'guide.hr.attendance.link',
  },
  {
    id: 'payroll',
    titleKey: 'guide.hr.payroll.title',
    bodyKey: 'guide.hr.payroll.body',
    to: '/payroll',
    linkKey: 'guide.hr.payroll.link',
  },
]
