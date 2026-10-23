import { format, parseISO } from 'date-fns'
import { ExternalLink } from 'lucide-react'
import { billingLabel, hasBillingIssue, monthLabel, renewalSoon, type ChurchView } from '../../lib/worshiphub'
import { colors } from '../../lib/uiStyles'

/** Plan, modules, usage, billing and renewal for one church, live or entered by hand. */
export default function ChurchFacts({ view }: { view: ChurchView }) {
  const row = (label: string, value: React.ReactNode, tone?: string) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13, padding: '4px 0' }}>
      <span style={{ color: colors.muted }}>{label}</span>
      <span style={{ textAlign: 'right', color: tone ?? colors.text }}>{value}</span>
    </div>
  )
  const month = monthLabel(view.whatsappMonth)
  const soon = renewalSoon(view.renewalDate)
  return (
    <div>
      {row('Plan', view.plan || 'Not set')}
      {row('Modules', view.modules.length ? view.modules.join(', ') : 'Not set')}
      {row(
        month ? `WhatsApp, ${month}` : 'WhatsApp',
        view.whatsappTotal == null ? (
          'Not set'
        ) : (
          <>
            {view.whatsappTotal.toLocaleString('en-AE')} conversations
            {view.whatsappSplit ? (
              <span style={{ display: 'block', fontSize: 11, color: colors.muted2 }}>
                {view.whatsappSplit.marketing} marketing, {view.whatsappSplit.service} service, {view.whatsappSplit.utility}{' '}
                utility
              </span>
            ) : null}
          </>
        ),
      )}
      {row('Billing', billingLabel(view.billingStatus), hasBillingIssue(view.billingStatus) ? colors.danger : undefined)}
      {row(
        'Renewal',
        view.renewalDate ? `${format(parseISO(view.renewalDate), 'd MMM yyyy')}${soon ? ', coming up' : ''}` : 'Not set',
        soon ? colors.warn : undefined,
      )}
      {view.adminUrl ? (
        <a
          href={view.adminUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, marginTop: 6, color: colors.accent }}
        >
          Open in WorshipHub admin <ExternalLink size={13} />
        </a>
      ) : null}
    </div>
  )
}
