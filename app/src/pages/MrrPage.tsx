import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useI18n } from '../contexts/I18nContext'
import { useToast } from '../contexts/ToastContext'
import { listAccounts } from '../lib/accountsStore'
import { loadClientHealth } from '../lib/clientHealthStore'
import { listContracts } from '../lib/deliveryStore'
import { errorMessage } from '../lib/errors'
import { formatAED } from '../lib/money'
import { PIPELINE_WEIGHTS, mrrByAccount, mrrForecast, mrrHistory } from '../lib/mrr'
import { canViewField } from '../lib/fieldPermissions'
import { salesStageLabel } from '../lib/salesPipeline'
import { listSalesDeals } from '../lib/salesPipelineStore'
import { monthKey } from '../lib/delivery'
import type { Account, Contract, SalesDeal, SalesStage } from '../lib/types'
import {
  cardStyle,
  colors,
  kpiGridStyle,
  sectionTitleStyle,
  tableStyle,
  tableWrapStyle,
  tdStyle,
  thStyle,
} from '../lib/uiStyles'
import docsStyles from '../styles/docsList.module.css'

const num: CSSProperties = { ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }
const numTh: CSSProperties = { ...thStyle, textAlign: 'right' }
const aed = (n: number) => (n ? formatAED(n) : '-')

type Data = { accounts: Account[]; contracts: Contract[]; deals: SalesDeal[]; atRisk: Set<string> }

export default function MrrPage() {
  const { t } = useI18n()
  const { userRole } = useAuth()
  const { showToast } = useToast()
  const allowed = canViewField(userRole, 'delivery.profitability')
  const [data, setData] = useState<Data | null>(null)

  useEffect(() => {
    if (!allowed) return
    Promise.all([listAccounts(), listContracts(), listSalesDeals(), loadClientHealth().catch(() => [])])
      .then(([a, c, d, h]) =>
        setData({
          accounts: a.rows,
          contracts: c,
          deals: d.rows,
          atRisk: new Set(h.filter((r) => r.health.churnWarning).map((r) => r.account.id)),
        }),
      )
      .catch((e) => showToast(errorMessage(e, 'Could not load MRR'), 'error'))
  }, [allowed, showToast])

  const view = useMemo(() => {
    if (!data) return null
    const history = mrrHistory(data.contracts, 12)
    const forecast = mrrForecast(data.contracts, data.deals, 3)
    const now = history[history.length - 1]
    const byAccount = mrrByAccount(data.contracts, monthKey(new Date()))
    const atRiskMrr = [...byAccount].filter(([id]) => data.atRisk.has(id)).reduce((s, [, v]) => s + v, 0)
    const name = (id: string) => data.accounts.find((a) => a.id === id)?.name ?? 'Unknown client'
    return { history, forecast, now, atRiskMrr, name }
  }, [data])

  if (!allowed) {
    return (
      <div className={docsStyles.page}>
        <header className={docsStyles.hero}>
          <div>
            <p className={docsStyles.kicker}>{t('page.finance.kicker')}</p>
            <h1 className={docsStyles.title}>{t('page.mrr.titleShort')}</h1>
            <p className={docsStyles.subtitle}>{t('page.mrr.restricted')}</p>
          </div>
        </header>
      </div>
    )
  }

  const kpi = (label: string, value: string, sub?: string, color?: string) => (
    <div style={cardStyle}>
      <div style={{ color: colors.muted, fontSize: 13 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: color ?? colors.text }}>{value}</div>
      {sub ? <div style={{ color: colors.muted, fontSize: 12 }}>{sub}</div> : null}
    </div>
  )

  return (
    <div className={docsStyles.page}>
      <header className={docsStyles.hero}>
        <div>
          <p className={docsStyles.kicker}>{t('page.finance.kicker')}</p>
          <h1 className={docsStyles.title}>{t('page.mrr.title')}</h1>
          <p className={docsStyles.subtitle}>{t('page.mrr.subtitle')}</p>
        </div>
      </header>

      {!view ? (
        <p style={{ color: colors.muted }}>Loading…</p>
      ) : (
        <>
          <div style={kpiGridStyle}>
            {kpi('MRR this month', formatAED(view.now.mrr), `${view.now.clients} paying ${view.now.clients === 1 ? 'client' : 'clients'}`)}
            {kpi('Average per client', view.now.clients ? formatAED(view.now.mrr / view.now.clients) : '-')}
            {kpi('New this month', aed(view.now.added + view.now.expansion), `${view.now.newClients.length} new ${view.now.newClients.length === 1 ? 'client' : 'clients'}`, colors.success)}
            {kpi('Lost this month', aed(view.now.lost + view.now.contraction), `${view.now.lostClients.length} ${view.now.lostClients.length === 1 ? 'client' : 'clients'} left`, view.now.lost ? colors.danger : undefined)}
            {kpi('MRR with a churn warning', aed(view.atRiskMrr), 'See Client health', view.atRiskMrr ? colors.warn : undefined)}
          </div>

          <section style={cardStyle} aria-label="Forecast">
            <h2 style={sectionTitleStyle}>Next 3 months</h2>
            <p style={{ color: colors.muted, fontSize: 13, margin: '0 0 10px' }}>
              Contracted is every running and signed contract, with discounts ending as planned. Clients whose term ends keep
              paying month to month unless they give notice. Pipeline counts open AI CRM sales deals from their start date:{' '}
              {(Object.entries(PIPELINE_WEIGHTS) as [SalesStage, number][])
                .map(([s, w]) => `${salesStageLabel(s).toLowerCase()} ${Math.round(w * 100)}%`)
                .join(', ')}{' '}
              of the quoted monthly fee.
            </p>
            <div style={tableWrapStyle}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Month</th>
                    <th style={numTh}>Contracted</th>
                    <th style={numTh}>Pipeline</th>
                    <th style={numTh}>Forecast</th>
                    <th style={thStyle}>Renewals due</th>
                  </tr>
                </thead>
                <tbody>
                  {view.forecast.map((f) => (
                    <tr key={f.month}>
                      <td style={tdStyle}>{f.label}</td>
                      <td style={num}>{formatAED(f.contracted)}</td>
                      <td style={num}>{aed(f.pipeline)}</td>
                      <td style={{ ...num, fontWeight: 700 }}>{formatAED(f.total)}</td>
                      <td style={tdStyle}>{f.renewalsDue ? `${f.renewalsDue} term${f.renewalsDue === 1 ? '' : 's'} ending` : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section style={cardStyle} aria-label="Last 12 months">
            <h2 style={sectionTitleStyle}>Last 12 months</h2>
            <div style={tableWrapStyle}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Month</th>
                    <th style={numTh}>MRR</th>
                    <th style={numTh}>Clients</th>
                    <th style={numTh}>New</th>
                    <th style={numTh}>Upgrades</th>
                    <th style={numTh}>Downgrades</th>
                    <th style={numTh}>Lost</th>
                    <th style={thStyle}>Who joined or left</th>
                  </tr>
                </thead>
                <tbody>
                  {[...view.history].reverse().map((m) => (
                    <tr key={m.month}>
                      <td style={tdStyle}>{m.label}</td>
                      <td style={{ ...num, fontWeight: 700 }}>{formatAED(m.mrr)}</td>
                      <td style={num}>{m.clients}</td>
                      <td style={{ ...num, color: m.added ? colors.success : undefined }}>{aed(m.added)}</td>
                      <td style={num}>{aed(m.expansion)}</td>
                      <td style={num}>{aed(m.contraction)}</td>
                      <td style={{ ...num, color: m.lost ? colors.danger : undefined }}>{aed(m.lost)}</td>
                      <td style={{ ...tdStyle, fontSize: 12 }}>
                        {m.newClients.map((id) => (
                          <div key={`n${id}`}>
                            Joined:{' '}
                            <Link to={`/accounts/${id}`} style={{ color: colors.text }}>
                              {view.name(id)}
                            </Link>
                          </div>
                        ))}
                        {m.lostClients.map((id) => (
                          <div key={`l${id}`} style={{ color: colors.danger }}>
                            Left:{' '}
                            <Link to={`/accounts/${id}`} style={{ color: colors.danger }}>
                              {view.name(id)}
                            </Link>
                          </div>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
