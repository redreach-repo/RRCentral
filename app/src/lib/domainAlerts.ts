import { differenceInCalendarDays, parseISO, startOfDay } from 'date-fns'
import type { OwnedDomain } from './types'

export type DomainRenewalAlert = {
  id: string
  domainName: string
  expiresOn: string
  daysLeft: number
  registrar: string
  autoRenew: boolean
  severity: 'overdue' | 'soon' | 'upcoming'
}

/** Domains expired or expiring within `withinDays` (default 90). */
export function domainRenewalAlerts(
  domains: OwnedDomain[],
  withinDays = 90,
  today = startOfDay(new Date()),
): DomainRenewalAlert[] {
  const out: DomainRenewalAlert[] = []
  for (const d of domains) {
    if (!d.expires_on || d.active === false) continue
    let expires: Date
    try {
      expires = startOfDay(parseISO(String(d.expires_on).slice(0, 10)))
    } catch {
      continue
    }
    const daysLeft = differenceInCalendarDays(expires, today)
    if (daysLeft > withinDays) continue
    out.push({
      id: d.id,
      domainName: d.domain_name,
      expiresOn: String(d.expires_on).slice(0, 10),
      daysLeft,
      registrar: d.registrar || '',
      autoRenew: Boolean(d.auto_renew),
      severity: daysLeft < 0 ? 'overdue' : daysLeft <= 30 ? 'soon' : 'upcoming',
    })
  }
  return out.sort((a, b) => a.daysLeft - b.daysLeft)
}

export function domainAlertLabel(alert: DomainRenewalAlert): string {
  if (alert.daysLeft < 0) return `Expired ${Math.abs(alert.daysLeft)}d ago`
  if (alert.daysLeft === 0) return 'Expires today'
  return `Expires in ${alert.daysLeft}d`
}
