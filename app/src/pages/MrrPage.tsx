import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useI18n } from '../contexts/I18nContext'
import { useToast } from '../contexts/ToastContext'
import { listAccounts } from '../lib/accountsStore'
import { loadClientHealth } from '../lib/clientHealthStore'
import { listContracts } from '../lib/deliveryStore'
import { errorMessage } from '../lib/errors'
import { csvRowsToObjects, exportListCsv, parseCsv } from '../lib/listIo'
import { formatAED } from '../lib/money'
import {
  PIPELINE_WEIGHTS,
  mrrByAccount,
  mrrForecast,
  mrrHistory,
  type ForecastMonth,
  type MrrMonth,
} from '../lib/mrr'
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

const MRR_CSV_HEADERS = [
  'section',
  'month',
  'label',
  'mrr',
  'clients',
  'added',
  'expansion',
  'contraction',
  'lost',
  'pipeline',
  'contracted',
  'forecast',
  'renewals_due',
] as const

type Data = { accounts: Account[]; contracts: Contract[]; deals: SalesDeal[]; atRisk: Set<string> }
type MrrView = {
  history: MrrMonth[]
  forecast: ForecastMonth[]
  now: MrrMonth
  atRiskMrr: number
  name: (id: string) => string
}

function numOr(raw: string, fallback = 0): number {
  const n = Number(String(raw || '').trim())
  return Number.isFinite(n) ? n : fallback
}

function normalizeMonth(raw: string): string {
  const value = raw.trim()
  if (/^\d{4}-\d{2}$/.test(value)) return `${value}-01`
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10)
  return value
}

export default function MrrPage() {
  const { t } = useI18n()
  const { userRole } = useAuth()
  const { showToast } = useToast()
  const allowed = canViewField(userRole, 'delivery.profitability')
  const [data, setData] = useState<Data | null>(null)
  const [importing, setImporting] = useState(false)
  const [csvFiltered, setCsvFiltered] = useState(false)
  const [importedView, setImportedView] = useState<MrrView | null>(null)
  const importInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!allowed) return
    Promise.all([listAccounts(), listContracts(), listSalesDeals(), loadClientHealth().catch(() => [])])
      .then(([a, c, d, h]) => {
        setData({
          accounts: a.rows,
          contracts: c,
          deals: d.rows,
          atRisk: new Set(h.filter((r) => r.health.churnWarning).map((r) => r.account.id)),
        })
        setCsvFiltered(false)
        setImportedView(null)
      })
      .catch((e) => showToast(errorMessage(e, 'Could not load MRR'), 'error'))
  }, [allowed, showToast])

  const liveView = useMemo(() => {
    if (!data) return null
    const history = mrrHistory(data.contracts, 12)
    const forecast = mrrForecast(data.contracts, data.deals, 3)
    const now = history[history.length - 1]
    const byAccount = mrrByAccount(data.contracts, monthKey(new Date()))
    const atRiskMrr = [...byAccount].filter(([id]) => data.atRisk.has(id)).reduce((s, [, v]) => s + v, 0)
    const name = (id: string) => data.accounts.find((a) => a.id === id)?.name ?? 'Unknown client'
    return { history, forecast, now, atRiskMrr, name } satisfies MrrView
  }, [data])

  const view = csvFiltered && importedView ? importedView : liveView

  async function importMrrCsv(file: File) {
    if (!liveView) return
    setImporting(true)
    try {
      const text = await file.text()
      const { headers, rows: csvRows } = parseCsv(text)
      if (!headers.length) {
        showToast('CSV has no header row', 'error')
        return
      }
      const objects = csvRowsToObjects(headers, csvRows)
      const historyByMonth = new Map(liveView.history.map((m) => [m.month.slice(0, 7), m] as const))
      const forecastByMonth = new Map(liveView.forecast.map((f) => [f.month.slice(0, 7), f] as const))
      const nextHistory: MrrMonth[] = []
      const nextForecast: ForecastMonth[] = []
      const seenH = new Set<string>()
      const seenF = new Set<string>()
      let matched = 0
      let softLoaded = 0
      let skipped = 0

      for (const row of objects) {
        const section = String(row.section || '').trim().toLowerCase()
        const month = normalizeMonth(String(row.month || ''))
        const monthKey7 = month.slice(0, 7)
        if (!monthKey7 || !/^\d{4}-\d{2}$/.test(monthKey7)) {
          skipped += 1
          continue
        }
        const label = String(row.label || '').trim() || monthKey7
        if (section === 'forecast' || (!section && String(row.forecast || row.pipeline || row.contracted || '').trim())) {
          if (seenF.has(monthKey7)) {
            skipped += 1
            continue
          }
          seenF.add(monthKey7)
          const existing = forecastByMonth.get(monthKey7)
          if (existing) {
            nextForecast.push(existing)
            matched += 1
            continue
          }
          const contracted = numOr(row.contracted)
          const pipeline = numOr(row.pipeline)
          const total = numOr(row.forecast, contracted + pipeline)
          nextForecast.push({
            month: `${monthKey7}-01`,
            label,
            contracted,
            pipeline,
            total,
            renewalsDue: numOr(row.renewals_due),
          })
          softLoaded += 1
          continue
        }

        if (seenH.has(monthKey7)) {
          skipped += 1
          continue
        }
        seenH.add(monthKey7)
        const existing = historyByMonth.get(monthKey7)
        if (existing) {
          nextHistory.push(existing)
          matched += 1
          continue
        }
        nextHistory.push({
          month: `${monthKey7}-01`,
          label,
          mrr: numOr(row.mrr),
          clients: numOr(row.clients),
          added: numOr(row.added),
          expansion: numOr(row.expansion),
          contraction: numOr(row.contraction),
          lost: numOr(row.lost),
          newClients: [],
          lostClients: [],
        })
        softLoaded += 1
      }

      if (!nextHistory.length && !nextForecast.length) {
        showToast('No matching MRR rows in CSV', 'error')
        return
      }

      const history = nextHistory.length
        ? [...nextHistory].sort((a, b) => a.month.localeCompare(b.month))
        : liveView.history
      const forecast = nextForecast.length
        ? [...nextForecast].sort((a, b) => a.month.localeCompare(b.month))
        : liveView.forecast
      const now = history[history.length - 1] || liveView.now
      setImportedView({
        history,
        forecast,
        now,
        atRiskMrr: liveView.atRiskMrr,
        name: liveView.name,
      })
      setCsvFiltered(true)
      const parts = [matched ? `${matched} matched` : '', softLoaded ? `${softLoaded} soft-loaded` : '']
        .filter(Boolean)
        .join(', ')
      const skipNote = skipped ? ` · ${skipped} row(s) skipped` : ''
      showToast(`Imported ${history.length + forecast.length} MRR row(s) (${parts})${skipNote}`, 'success')
    } catch (e) {
      showToast(errorMessage(e, 'MRR CSV import failed'), 'error')
    } finally {
      setImporting(false)
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

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
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            ref={importInputRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void importMrrCsv(file)
            }}
          />
          <button
            type="button"
            className={docsStyles.newBtn}
            style={{ background: 'transparent', color: 'inherit', border: '1px solid var(--border)' }}
            disabled={importing || !liveView}
            onClick={() => importInputRef.current?.click()}
          >
            {importing ? 'Importing…' : 'Import CSV'}
          </button>
          <button
            type="button"
            className={docsStyles.newBtn}
            style={{ background: 'transparent', color: 'inherit', border: '1px solid var(--border)' }}
            disabled={!view}
            onClick={() => {
              if (!view) return
              exportListCsv(
                'mrr-history.csv',
                [...MRR_CSV_HEADERS],
                [
                  ...view.history.map((m) => ({
                    section: 'history',
                    month: m.month,
                    label: m.label,
                    mrr: m.mrr,
                    clients: m.clients,
                    added: m.added,
                    expansion: m.expansion,
                    contraction: m.contraction,
                    lost: m.lost,
                    pipeline: '',
                    contracted: '',
                    forecast: '',
                    renewals_due: '',
                  })),
                  ...view.forecast.map((f) => ({
                    section: 'forecast',
                    month: f.month,
                    label: f.label,
                    mrr: '',
                    clients: '',
                    added: '',
                    expansion: '',
                    contraction: '',
                    lost: '',
                    pipeline: f.pipeline,
                    contracted: f.contracted,
                    forecast: f.total,
                    renewals_due: f.renewalsDue,
                  })),
                ],
              )
              showToast('MRR CSV downloaded', 'success')
            }}
          >
            Export CSV
          </button>
          {csvFiltered ? (
            <button
              type="button"
              className={docsStyles.newBtn}
              style={{ background: 'transparent', color: 'inherit', border: '1px solid var(--border)' }}
              onClick={() => {
                setCsvFiltered(false)
                setImportedView(null)
              }}
            >
              Clear CSV filter
            </button>
          ) : null}
        </div>
      </header>

      {csvFiltered ? (
        <p style={{ color: colors.muted, fontSize: 13, margin: '0 0 12px', lineHeight: 1.45 }}>
          Showing MRR from CSV (session only — Clear CSV filter resets).
        </p>
      ) : null}

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
