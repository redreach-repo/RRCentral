import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { format, parseISO, startOfMonth, subMonths } from 'date-fns'
import { Briefcase, Church, Handshake, LifeBuoy, Scale } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useSettings } from '../../contexts/SettingsContext'
import { listAccounts } from '../../lib/accountsStore'
import { monthCosts, type MonthCosts } from '../../lib/attention'
import { isOverdue, isStale } from '../../lib/ctrm'
import { listDeals } from '../../lib/ctrmStore'
import { db } from '../../lib/db'
import { HOURS_ALERT_MESSAGE, hoursAlert, monthLabel, ratesFromSettings, renewalFlag, renewalLabel } from '../../lib/delivery'
import { currentContract, listContracts, listPackages, listTimeEntries, listUsage } from '../../lib/deliveryStore'
import { formatAED } from '../../lib/money'
import { can } from '../../lib/permissions'
import { slaState } from '../../lib/sla'
import { isOpenTicket } from '../../lib/support'
import { listTickets } from '../../lib/supportStore'
import { billingLabel, churchView, hasBillingIssue, renewalSoon } from '../../lib/worshiphub'
import { fetchLiveTenants, listChurchProfiles } from '../../lib/worshiphubStore'
import type { Invoice } from '../../lib/types'
import { cardStyle, colors, sectionTitleStyle } from '../../lib/uiStyles'

type Line = { key: string; to: string; name: string; detail: string; tone: string }

type Data = {
  clients: Line[]
  tickets: Line[]
  overdueDeals: Line[]
  staleDeals: Line[]
  churches: Line[]
  costs: MonthCosts | null
}

const EMPTY: Data = { clients: [], tickets: [], overdueDeals: [], staleDeals: [], churches: [], costs: null }

/**
 * Dashboard view across the RR Central modules: AI CRM clients, support SLA,
 * the CTRM Next pipeline, WorshipHub churches and this month's money.
 */
export default function ModuleAlertsCard() {
  const { userRole } = useAuth()
  const { settings } = useSettings()
  const rates = useMemo(() => ratesFromSettings(settings), [settings])
  const seesMoney = can(userRole, 'delivery.profitability')
  const [data, setData] = useState<Data | null>(null)

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const now = new Date()
        const since = format(startOfMonth(subMonths(now, 2)), 'yyyy-MM-dd')
        const [{ rows: accounts }, contracts, packages, entries, usage, tickets, deals, profiles, live, inv] =
          await Promise.all([
            listAccounts(),
            listContracts(),
            listPackages(),
            listTimeEntries(undefined, since),
            listUsage(),
            listTickets(),
            listDeals(),
            listChurchProfiles(),
            fetchLiveTenants(),
            seesMoney ? db.from('invoices').select('*') : Promise.resolve({ data: [] }),
          ])
        const nameOf = new Map(accounts.map((a) => [a.id, a.name]))

        const clients: Line[] = []
        for (const a of accounts.filter((r) => r.type === 'ai_crm_client')) {
          const contract = currentContract(contracts.filter((c) => c.account_id === a.id))
          const pkg = packages.find((p) => p.id === contract?.package_id)
          const renewal = renewalFlag(contract)
          const overHours = pkg ? hoursAlert(entries.filter((e) => e.account_id === a.id), pkg.target_hours).flagged : false
          if (!renewal && !overHours) continue
          const bits = [
            renewal ? renewalLabel(renewal).toLowerCase() : '',
            overHours ? `over hours two months running. ${HOURS_ALERT_MESSAGE}` : '',
          ].filter(Boolean)
          clients.push({
            key: a.id,
            to: `/accounts/${a.id}`,
            name: a.name,
            detail: bits.join(', '),
            tone: overHours || renewal?.kind === 'ended' ? colors.danger : colors.warn,
          })
        }

        const ticketLines: Line[] = tickets
          .filter(isOpenTicket)
          .map((t) => ({ t, state: slaState(t, now) }))
          .filter(({ state }) => state === 'breached' || state === 'warning')
          .sort((x, y) => String(x.t.sla_due_at).localeCompare(String(y.t.sla_due_at)))
          .map(({ t, state }) => ({
            key: t.id,
            to: `/support/${t.id}`,
            name: t.subject,
            detail: `${t.account_id ? nameOf.get(t.account_id) ?? 'Account' : 'Unknown sender'}, ${
              state === 'breached' ? 'past its reply time' : 'reply due soon'
            }`,
            tone: state === 'breached' ? colors.danger : colors.warn,
          }))

        const dealName = (accountId: string) => nameOf.get(accountId) ?? 'Prospect'
        const overdueDeals: Line[] = deals
          .filter((d) => isOverdue(d, now))
          .map((d) => ({
            key: d.id,
            to: `/accounts/${d.account_id}`,
            name: dealName(d.account_id),
            detail: `${d.next_action}, due ${d.next_action_date ? format(parseISO(d.next_action_date), 'd MMM') : ''}`,
            tone: colors.danger,
          }))
        const staleDeals: Line[] = deals
          .filter((d) => isStale(d, now))
          .map((d) => ({
            key: d.id,
            to: `/accounts/${d.account_id}`,
            name: dealName(d.account_id),
            detail: `last touch ${format(parseISO(d.last_touch_at), 'd MMM')}`,
            tone: colors.warn,
          }))

        const churches: Line[] = []
        for (const a of accounts.filter((r) => r.type === 'worship_church')) {
          const profile = profiles.find((p) => p.account_id === a.id) ?? null
          const tenant =
            live.connected && profile?.tenant_slug ? (live.tenants.find((t) => t.slug === profile.tenant_slug) ?? null) : null
          const v = churchView(profile, tenant)
          const billing = hasBillingIssue(v.billingStatus)
          const renewal = renewalSoon(v.renewalDate, now)
          if (!billing && !renewal) continue
          const bits = [
            billing ? billingLabel(v.billingStatus).toLowerCase() : '',
            renewal && v.renewalDate ? `renews ${format(parseISO(v.renewalDate), 'd MMM yyyy')}` : '',
          ].filter(Boolean)
          churches.push({
            key: a.id,
            to: `/accounts/${a.id}`,
            name: a.name,
            detail: bits.join(', '),
            tone: billing ? colors.danger : colors.warn,
          })
        }

        const costs = seesMoney
          ? monthCosts({
              now,
              contracts,
              packages,
              usage,
              entries,
              invoices: ((inv as { data: unknown }).data || []) as Invoice[],
              churchAccountIds: new Set(accounts.filter((a) => a.type === 'worship_church').map((a) => a.id)),
              rates,
            })
          : null

        if (alive) setData({ clients, tickets: ticketLines, overdueDeals, staleDeals, churches, costs })
      } catch {
        if (alive) setData(EMPTY)
      }
    })()
    return () => {
      alive = false
    }
  }, [rates, seesMoney])

  if (!data) return null

  return (
    <div
      style={{
        display: 'grid',
        gap: 16,
        gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))',
        marginBottom: 16,
      }}
    >
      <Panel icon={<Briefcase size={18} />} title="AI CRM clients" link="/accounts?type=ai_crm_client" lines={data.clients}
        empty="No client is over hours or due for renewal in the next 60 days." />
      <Panel icon={<LifeBuoy size={18} />} title="Tickets near or past their reply time" link="/support" lines={data.tickets}
        empty="Every open ticket is on time." />
      <Panel icon={<Handshake size={18} />} title="CTRM Next" link="/ctrm" lines={[]} empty="">
        <SubList label="Next action overdue" lines={data.overdueDeals} empty="No overdue next actions." />
        <SubList label="No touch in 14 days" lines={data.staleDeals} empty="No stale deals." />
      </Panel>
      <Panel icon={<Church size={18} />} title="WorshipHub churches" link="/products" lines={data.churches}
        empty="No church has a billing problem or a renewal in the next 60 days." />
      {data.costs ? <CostsPanel costs={data.costs} /> : null}
    </div>
  )
}

function Panel({
  icon,
  title,
  link,
  lines,
  empty,
  children,
}: {
  icon: ReactNode
  title: string
  link: string
  lines: Line[]
  empty: string
  children?: ReactNode
}) {
  return (
    <section style={{ ...cardStyle, margin: 0 }} aria-label={title}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
        <h2 style={{ ...sectionTitleStyle, display: 'flex', alignItems: 'center', gap: 8 }}>
          {icon} {title}
        </h2>
        <Link to={link} style={{ color: colors.muted, fontSize: 12, whiteSpace: 'nowrap' }}>
          Open
        </Link>
      </div>
      {children ?? <Lines lines={lines} empty={empty} />}
    </section>
  )
}

function SubList({ label, lines, empty }: { label: string; lines: Line[]; empty: string }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 12, color: colors.muted2, marginBottom: 4 }}>
        {label} ({lines.length})
      </div>
      <Lines lines={lines} empty={empty} />
    </div>
  )
}

function Lines({ lines, empty }: { lines: Line[]; empty: string }) {
  if (lines.length === 0) return <p style={{ color: colors.muted, fontSize: 13, margin: 0 }}>{empty}</p>
  return (
    <ul style={{ margin: 0, paddingLeft: 18, color: colors.muted, fontSize: 13, lineHeight: 1.55 }}>
      {lines.slice(0, 6).map((l) => (
        <li key={l.key} style={{ marginBottom: 4 }}>
          <Link to={l.to} style={{ color: colors.text, fontWeight: 600 }}>
            {l.name}
          </Link>
          <span style={{ color: l.tone }}>, {l.detail}</span>
        </li>
      ))}
      {lines.length > 6 ? <li style={{ listStyle: 'none' }}>and {lines.length - 6} more</li> : null}
    </ul>
  )
}

function CostsPanel({ costs }: { costs: MonthCosts }) {
  const row = (label: string, value: number, strong = false, tone?: string) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '3px 0', fontWeight: strong ? 650 : 400 }}>
      <span style={{ color: strong ? colors.text : colors.muted }}>{label}</span>
      <span style={{ color: tone ?? colors.text }}>{formatAED(value)}</span>
    </div>
  )
  return (
    <section style={{ ...cardStyle, margin: 0 }} aria-label="Revenue against costs">
      <h2 style={{ ...sectionTitleStyle, display: 'flex', alignItems: 'center', gap: 8 }}>
        <Scale size={18} /> {monthLabel(costs.month)}: revenue against costs
      </h2>
      {row('AI CRM fees and overage', costs.aiCrmRevenueAed)}
      {row('WorshipHub invoices', costs.churchRevenueAed)}
      {row('Revenue', costs.revenueAed, true)}
      <div style={{ fontSize: 12, color: colors.muted2, margin: '6px 0 2px' }}>Costs</div>
      {row('Tools (estimate)', costs.toolCostAed)}
      {row('Hours at the internal rate', costs.labourAed)}
      {row('Fixed costs (estimate)', costs.fixedCostAed)}
      {row('Left over', costs.leftAed, true, costs.leftAed < 0 ? colors.danger : colors.success)}
      <p style={{ color: colors.muted2, fontSize: 11, margin: '8px 0 0' }}>
        Excludes VAT. {costs.fixedCostAed === 0 ? 'Set the fixed cost estimate on Packages and rates. ' : ''}
        <Link to="/delivery-settings" style={{ color: colors.muted }}>
          Change the rates
        </Link>
      </p>
    </section>
  )
}
