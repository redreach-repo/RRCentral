import { addDays, differenceInCalendarDays, parseISO, startOfDay } from 'date-fns'
import type { CompanyDocument } from './types'
import { companyDocCategoryLabel } from './companyDocs'

export type CompanyDocAlert = {
  id: string
  title: string
  categoryLabel: string
  expiresOn: string
  daysLeft: number
  driveUrl: string
  severity: 'overdue' | 'soon' | 'upcoming'
}

/** Docs expired or expiring within `withinDays` (default 60). */
export function companyDocExpiryAlerts(
  docs: CompanyDocument[],
  withinDays = 60,
  today = startOfDay(new Date()),
): CompanyDocAlert[] {
  const out: CompanyDocAlert[] = []
  for (const doc of docs) {
    if (!doc.expires_on) continue
    let expires: Date
    try {
      expires = startOfDay(parseISO(String(doc.expires_on).slice(0, 10)))
    } catch {
      continue
    }
    const daysLeft = differenceInCalendarDays(expires, today)
    if (daysLeft > withinDays) continue
    out.push({
      id: doc.id,
      title: doc.title || companyDocCategoryLabel(doc.category),
      categoryLabel: companyDocCategoryLabel(doc.category),
      expiresOn: String(doc.expires_on).slice(0, 10),
      daysLeft,
      driveUrl: doc.drive_url || '',
      severity: daysLeft < 0 ? 'overdue' : daysLeft <= 30 ? 'soon' : 'upcoming',
    })
  }
  return out.sort((a, b) => a.daysLeft - b.daysLeft)
}

export function companyDocAlertLabel(alert: CompanyDocAlert): string {
  if (alert.daysLeft < 0) return `Expired ${Math.abs(alert.daysLeft)}d ago`
  if (alert.daysLeft === 0) return 'Expires today'
  return `Expires in ${alert.daysLeft}d`
}

export function addDaysIso(from: Date, days: number): string {
  return addDays(from, days).toISOString().slice(0, 10)
}
