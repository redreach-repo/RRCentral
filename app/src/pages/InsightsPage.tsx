import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { subMonths } from 'date-fns'
import { TrendingDown, TrendingUp, Minus, Gauge } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useSettings } from '../contexts/SettingsContext'
import { useToast } from '../contexts/ToastContext'
import EmptyState from '../components/EmptyState'
import { listAccounts } from '../lib/accountsStore'
import { listAiUsage } from '../lib/aiAssistStore'
import { ratesFromSettings, TIME_CATEGORIES } from '../lib/delivery'
import { listContracts, listPackages, listTimeEntries, listUsage } from '../lib/deliveryStore'
import {
  CAPACITY_SETTING_KEY,
  capacityFromSettings,
  profitTrends,
  shortMonth,
  signalMessage,
  utilisation,
  type ClientTrend,
} from '../lib/insights'
import { can } from '../lib/permissions'
import { errorMessage } from '../lib/errors'
import { formatAED } from '../lib/money'
import type { Account, Contract, DeliveryPackage, TimeEntry, UsageRecord } from '../lib/types'
import type { AiUsageRow } from '../lib/aiAssist'
import {
  buttonSecondaryStyle,
  cardStyle,
  colors,
  inputStyle,
  pageStyle,
  pageSubtitleStyle,
  pageTitleStyle,
  sectionTitleStyle,
  tableStyle,
  tableWrapStyle,
  tdStyle,
  thStyle,
} from '../lib/uiStyles'

const MONTHS = 6

const SIGNAL_COLOR = { hire: colors.danger, watch: colors.warn, ok: colors.success }

type Data = {
  accounts: Account[]
  contracts: Contract[]
  packages: DeliveryPackage[]
  usage: UsageRecord[]
  entries: TimeEntry[]
  assist: AiUsageRow[]
}

const barTrack: CSSProperties = { height: 8, borderRadius: 999, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }

function TrendIcon({ t }: { t: ClientTrend }) {
  if (t.direction === 'up') return <TrendingUp size={16} color={colors.success} aria-label="Margin rising" />
  if (t.direction === 'down') return <TrendingDown size={16} color={colors.danger} aria-label="Margin falling" />
  if (t.direction === 'flat') return <Minus size={16} color={colors.muted} aria-label="Margin steady" />
  return <span style={{ fontSize: 11, color: colors.muted2 }}>new</span>
}

export default function InsightsPage() {
  const { userRole } = useAuth()
  const { settings, updateSetting } = useSettings()
  const { showToast } = useToast()
  const [data, setData] = useState<Data | null>(null)
  const [capacityDraft, setCapacityDraft] = useState('')
  const allowed = can(userRole, 'delivery.profitability')
  const canChange = can(userRole, 'delivery.packages')
  const rates = useMemo(() => ratesFromSettings(settings), [settings])
  const capacity = capacityFromSettings(settings)

  useEffect(() => setCapacityDraft(String(capacity)), [capacity])

  const load = useCallback(async () => {
    try {
      const since = subMonths(new Date(), MONTHS)
      const sinceIso = new Date(since.getFullYear(), since.getMonth(), 1).toISOString()
      const [a, c, p, u, e, ai] = await Promise.all([
        listAccounts(),
        listContracts(),
        listPackages(),
        listUsage(),
        listTimeEntries(undefined, sinceIso.slice(0, 10)),
        listAiUsage(null, sinceIso).catch(() => []),
      ])
      setData({ accounts: a.rows, contracts: c, packages: p, usage: u, entries: e, assist: ai })
    } catch (err) {
      showToast(errorMessage(err, 'Could not load the numbers'), 'error')
    }
  }, [showToast])

  useEffect(() => {
    if (allowed) void load()
  }, [allowed, load])

  const today = useMemo(() => new Date(), [])
  const use = useMemo(
    () => (data ? utilisation({ entries: data.entries, capacity, today, months: MONTHS }) : null),
    [data, capacity, today],
  )
  const trends = useMemo(
    () =>
      data
        ? profitTrends({ ...data, rates, today, months: MONTHS })
        : [],
    [data, rates, today],
  )
  const nameOf = useMemo(() => new Map((data?.accounts ?? []).map((a) => [a.id, a.name])), [data])

  async function saveCapacity() {
    const n = Number(capacityDraft)
    if (!Number.isFinite(n) || n <= 0 || n > 2000) {
      showToast('Enter the hours a month you can deliver, for example 100', 'error')
      return
    }
    try {
      await updateSetting(CAPACITY_SETTING_KEY, String(n))
      showToast('Capacity saved', 'success')
    } catch (e) {
      showToast(errorMessage(e, 'Could not save'), 'error')
    }
  }

  if (!allowed) {
    return (
      <div style={pageStyle}>
        <EmptyState icon={<Gauge size={22} />} title="Managers and admins only" />
      </div>
    )
  }

  const maxHours = use ? Math.max(capacity, ...use.months.map((m) => m.hours)) : capacity

  return (
    <div style={pageStyle}>
      <h1 style={pageTitleStyle}>Utilisation and profit</h1>
      <p style={pageSubtitleStyle}>
        How much of your delivery time is used, so you know when to hire, and how each client's profit moves month to
        month. Amounts exclude VAT.
      </p>

      {!use ? (
        <p style={{ color: colors.muted }}>Loading</p>
      ) : (
        <>
          <section style={{ ...cardStyle, marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <div style={{ minWidth: 0 }}>
                <h2 style={{ ...sectionTitleStyle, margin: 0 }}>Utilisation</h2>
                <p style={{ margin: '6px 0 0', color: SIGNAL_COLOR[use.signal], fontSize: 14 }}>{signalMessage(use)}</p>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
                <label htmlFor="capacity" style={{ color: colors.muted }}>
                  Hours you can deliver a month
                </label>
                <input
                  id="capacity"
                  style={{ ...inputStyle, width: 80 }}
                  inputMode="decimal"
                  value={capacityDraft}
                  disabled={!canChange}
                  onChange={(e) => setCapacityDraft(e.target.value)}
                />
                {canChange ? (
                  <button type="button" style={{ ...buttonSecondaryStyle, padding: '6px 10px', fontSize: 12 }} onClick={() => void saveCapacity()}>
                    Save
                  </button>
                ) : null}
              </div>
            </div>

            <div style={{ display: 'grid', gap: 8, marginTop: 16 }}>
              {use.months.map((m, i) => (
                <div key={m.month} style={{ display: 'grid', gridTemplateColumns: '64px 1fr 120px', gap: 10, alignItems: 'center', fontSize: 13 }}>
                  <span style={{ color: colors.muted }}>
                    {shortMonth(m.month)}
                    {i === use.months.length - 1 ? '*' : ''}
                  </span>
                  <div style={{ ...barTrack, position: 'relative' }}>
                    <div
                      style={{
                        width: `${Math.min(100, (m.hours / maxHours) * 100)}%`,
                        height: '100%',
                        background: m.percent >= 85 ? colors.danger : m.percent >= 70 ? colors.warn : colors.accent,
                      }}
                    />
                    <div
                      title="Capacity"
                      style={{ position: 'absolute', top: 0, bottom: 0, left: `${(capacity / maxHours) * 100}%`, width: 2, background: colors.text }}
                    />
                  </div>
                  <span style={{ textAlign: 'right' }}>
                    {m.hours}h, {m.percent}%
                  </span>
                </div>
              ))}
            </div>
            <p style={{ color: colors.muted2, fontSize: 12, margin: '8px 0 0' }}>
              The white line is your capacity of {capacity} hours. * This month so far. The signal uses the last three full
              months.
            </p>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, marginTop: 16, fontSize: 13 }}>
              <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                <div style={{ color: colors.muted, marginBottom: 6 }}>This month by kind of work</div>
                {TIME_CATEGORIES.filter((c) => use.months[use.months.length - 1].byCategory[c.value] > 0).map((c) => (
                  <div key={c.value} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>{c.label}</span>
                    <span>{use.months[use.months.length - 1].byCategory[c.value]}h</span>
                  </div>
                ))}
              </div>
              <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                <div style={{ color: colors.muted, marginBottom: 6 }}>This month by person</div>
                {use.people.length === 0 ? <span style={{ color: colors.muted2 }}>No hours yet</span> : null}
                {use.people.map((p) => (
                  <div key={p.email} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.email}</span>
                    <span>{p.hours}h</span>
                  </div>
                ))}
              </div>
              <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                <div style={{ color: colors.muted, marginBottom: 6 }}>This month by client</div>
                {use.clients.slice(0, 8).map((c) => (
                  <div key={c.accountId} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <Link to={`/accounts/${c.accountId}`} style={{ color: colors.text, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {nameOf.get(c.accountId) ?? 'Account'}
                    </Link>
                    <span>{c.hours}h</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section style={cardStyle}>
            <h2 style={sectionTitleStyle}>Profit by client, month by month</h2>
            <p style={{ color: colors.muted, fontSize: 13, margin: '0 0 12px', lineHeight: 1.5 }}>
              Margin after tools, AI and hours at {formatAED(rates.internalHourlyRateAed)} an hour. Fees are as on the
              contract today. Falling margins are listed first. The arrow compares last month with the two before it.
            </p>
            {trends.length === 0 ? (
              <p style={{ color: colors.muted2, fontSize: 13 }}>No AI CRM client has a contract yet.</p>
            ) : (
              <div style={tableWrapStyle}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Client</th>
                      <th style={thStyle} aria-label="Trend" />
                      {trends[0].months.map((m, i) => (
                        <th key={m.month} style={{ ...thStyle, textAlign: 'right' }}>
                          {shortMonth(m.month)}
                          {i === trends[0].months.length - 1 ? '*' : ''}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {trends.map((t) => (
                      <tr key={t.accountId}>
                        <td style={tdStyle}>
                          <Link to={`/accounts/${t.accountId}`} style={{ color: colors.text }}>
                            {t.name}
                          </Link>
                        </td>
                        <td style={tdStyle} title={t.changePoints == null ? '' : `${t.changePoints > 0 ? '+' : ''}${t.changePoints} points`}>
                          <TrendIcon t={t} />
                        </td>
                        {t.months.map((m) => (
                          <td
                            key={m.month}
                            style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }}
                            title={`Revenue ${formatAED(m.revenueAed)}, cost ${formatAED(m.costAed)}, ${m.hours}h`}
                          >
                            {m.running || m.hours > 0 ? (
                              <>
                                <div style={{ color: m.marginAed < 0 ? colors.danger : colors.text }}>{formatAED(m.marginAed)}</div>
                                {m.running ? <div style={{ fontSize: 11, color: colors.muted2 }}>{m.marginPercent}%</div> : null}
                              </>
                            ) : (
                              <span style={{ color: colors.muted2 }}>-</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
