import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useI18n } from '../contexts/I18nContext'
import { useToast } from '../contexts/ToastContext'
import EmptyState from '../components/EmptyState'
import SavedViewsBar from '../components/SavedViewsBar'
import { HEALTH_BAND_COLORS, type HealthBand } from '../lib/clientHealth'
import { loadClientHealth, type HealthRow } from '../lib/clientHealthStore'
import { errorMessage } from '../lib/errors'
import { exportListCsv } from '../lib/listIo'
import {
  buttonSecondaryStyle,
  cardStyle,
  colors,
  kpiGridStyle,
  selectStyle,
  tableStyle,
  tableWrapStyle,
  tdStyle,
  thStyle,
} from '../lib/uiStyles'
import docsStyles from '../styles/docsList.module.css'

const BANDS: HealthBand[] = ['at_risk', 'watch', 'healthy']

export default function ClientHealthPage() {
  const { t } = useI18n()
  const { appUserId } = useAuth()
  const { showToast } = useToast()
  const [rows, setRows] = useState<HealthRow[] | null>(null)
  const [bandFilter, setBandFilter] = useState('all')
  const healthViewFilters = useMemo(() => ({ band: bandFilter }), [bandFilter])

  useEffect(() => {
    loadClientHealth()
      .then(setRows)
      .catch((e) => {
        showToast(errorMessage(e, 'Could not load client health'), 'error')
        setRows([])
      })
  }, [showToast])

  const count = (b: HealthBand) => rows?.filter((r) => r.health.band === b).length ?? 0
  const warnings = rows?.filter((r) => r.health.churnWarning).length ?? 0
  const bandLabel = (b: HealthBand) =>
    b === 'healthy'
      ? t('page.clientHealth.bandHealthy')
      : b === 'watch'
        ? t('page.clientHealth.bandWatch')
        : t('page.clientHealth.bandAtRisk')

  const visible = useMemo(() => {
    if (!rows) return []
    if (bandFilter === 'churn') return rows.filter((r) => r.health.churnWarning)
    if (bandFilter === 'all') return rows
    return rows.filter((r) => r.health.band === bandFilter)
  }, [rows, bandFilter])

  return (
    <div className={docsStyles.page}>
      <header className={docsStyles.hero}>
        <div>
          <p className={docsStyles.kicker}>{t('page.clients.kicker')}</p>
          <h1 className={docsStyles.title}>{t('page.clientHealth.title')}</h1>
          <p className={docsStyles.subtitle}>{t('page.clientHealth.subtitle')}</p>
        </div>
        <button
          type="button"
          className={docsStyles.newBtn}
          style={{ background: 'transparent', color: 'inherit', border: '1px solid var(--border)' }}
          disabled={!rows?.length}
          onClick={() => {
            if (!rows?.length) return
            exportListCsv(
              'client-health.csv',
              ['client', 'package', 'score', 'band', 'churn_warning', 'flags'],
              rows.map(({ account, pkg, health }) => ({
                client: account.name,
                package: pkg?.name || '',
                score: health.score,
                band: health.band,
                churn_warning: health.churnWarning ? 'yes' : 'no',
                flags: health.flags.join('; '),
              })),
            )
            showToast('Client health CSV downloaded', 'success')
          }}
        >
          Export CSV
        </button>
      </header>

      <SavedViewsBar
        moduleId="client_health"
        filters={healthViewFilters}
        ownerUserId={appUserId}
        canWrite
        applyDefaultOnLoad={false}
        onApply={(f) => setBandFilter(String(f.band || 'all'))}
        onToast={showToast}
        filtersEqual={(a, b) => String(a.band || 'all') === String(b.band || 'all')}
      />

      <div style={kpiGridStyle}>
        {BANDS.map((b) => (
          <div key={b} style={cardStyle}>
            <div style={{ color: colors.muted, fontSize: 13 }}>{bandLabel(b)}</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: HEALTH_BAND_COLORS[b] }}>{count(b)}</div>
          </div>
        ))}
        <div style={cardStyle}>
          <div style={{ color: colors.muted, fontSize: 13 }}>{t('page.clientHealth.churnWarnings')}</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: warnings ? colors.danger : colors.text }}>{warnings}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '12px 0', flexWrap: 'wrap' }}>
        <label style={{ fontSize: 13, color: colors.muted }}>
          Filter{' '}
          <select
            style={selectStyle}
            value={bandFilter}
            onChange={(e) => setBandFilter(e.target.value)}
            aria-label="Health band filter"
          >
            <option value="all">All</option>
            <option value="at_risk">At risk</option>
            <option value="watch">Watch</option>
            <option value="healthy">Healthy</option>
            <option value="churn">Churn warnings</option>
          </select>
        </label>
        {bandFilter !== 'all' ? (
          <button type="button" style={{ ...buttonSecondaryStyle, padding: '6px 10px', fontSize: 12 }} onClick={() => setBandFilter('all')}>
            Clear
          </button>
        ) : null}
      </div>

      {rows === null ? (
        <p style={{ color: colors.muted }}>{t('page.clientHealth.loading')}</p>
      ) : rows.length === 0 ? (
        <p style={{ color: colors.muted }}>{t('page.clientHealth.empty')}</p>
      ) : visible.length === 0 ? (
        <EmptyState title="No clients in this filter" subtitle="Try another band or clear the filter." />
      ) : (
        <div style={tableWrapStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>{t('page.clientHealth.client')}</th>
                <th style={thStyle}>{t('page.clientHealth.score')}</th>
                {visible[0].health.parts.map((p) => (
                  <th key={p.key} style={thStyle}>
                    {p.label}
                  </th>
                ))}
                <th style={thStyle}>{t('page.clientHealth.warningSigns')}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(({ account, pkg, health }) => (
                <tr key={account.id}>
                  <td style={tdStyle}>
                    <Link to={`/accounts/${account.id}`} style={{ color: colors.text, fontWeight: 600 }}>
                      {account.name}
                    </Link>
                    <div style={{ color: colors.muted, fontSize: 12 }}>
                      {pkg?.name ?? t('page.clientHealth.noPackage')}
                    </div>
                  </td>
                  <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                    <span style={{ fontWeight: 700, color: HEALTH_BAND_COLORS[health.band] }}>{health.score}</span>{' '}
                    <span style={{ color: colors.muted, fontSize: 12 }}>{bandLabel(health.band)}</span>
                  </td>
                  {health.parts.map((p) => (
                    <td key={p.key} style={tdStyle} title={p.note}>
                      {p.points}
                      <div style={{ color: colors.muted, fontSize: 11, maxWidth: 180 }}>{p.note}</div>
                    </td>
                  ))}
                  <td style={tdStyle}>
                    {health.churnWarning ? (
                      <span style={{ color: colors.danger, fontSize: 13 }}>
                        <AlertTriangle size={13} style={{ verticalAlign: -2, marginRight: 4 }} />
                        {health.flags.length ? health.flags.join('. ') : t('page.clientHealth.scoreBelow50')}
                      </span>
                    ) : (
                      <span style={{ color: colors.muted }}>{t('page.clientHealth.none')}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
