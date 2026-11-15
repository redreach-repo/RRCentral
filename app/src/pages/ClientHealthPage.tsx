import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useI18n } from '../contexts/I18nContext'
import { useToast } from '../contexts/ToastContext'
import EmptyState from '../components/EmptyState'
import SavedViewsBar from '../components/SavedViewsBar'
import { HEALTH_BAND_COLORS, type HealthBand, type ClientHealth } from '../lib/clientHealth'
import { loadClientHealth, type HealthRow } from '../lib/clientHealthStore'
import { errorMessage } from '../lib/errors'
import { csvRowsToObjects, exportListCsv, parseCsv } from '../lib/listIo'
import type { Account, DeliveryPackage } from '../lib/types'
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
const EXPORT_COLUMNS = ['client', 'package', 'score', 'band', 'churn_warning', 'flags'] as const

function parseYesNo(raw: string): boolean {
  const v = raw.trim().toLowerCase()
  return v === 'yes' || v === 'true' || v === '1' || v === 'y'
}

function parseBand(raw: string): HealthBand {
  const v = raw.trim().toLowerCase().replace(/[-\s]+/g, '_')
  if (v === 'healthy' || v === 'watch' || v === 'at_risk') return v
  if (v.includes('risk')) return 'at_risk'
  if (v.includes('healthy')) return 'healthy'
  return 'watch'
}

function clientKey(name: string): string {
  return name.trim().toLowerCase()
}

function stubAccount(name: string, idx: number): Account {
  return {
    id: `import-${idx}`,
    type: 'ai_crm_client',
    name,
    reference: '',
    industry: '',
    country: '',
    city: '',
    website: '',
    status: '',
    owner_user_id: null,
    source: '',
    notes: '',
    created_by: '',
    created_at: '',
    updated_at: '',
  }
}

function stubHealth(score: number, band: HealthBand, churnWarning: boolean, flags: string[]): ClientHealth {
  return {
    score,
    band,
    parts: [],
    flags,
    churnWarning,
  }
}

export default function ClientHealthPage() {
  const { t } = useI18n()
  const { appUserId } = useAuth()
  const { showToast } = useToast()
  const [rows, setRows] = useState<HealthRow[] | null>(null)
  const [bandFilter, setBandFilter] = useState('all')
  const [importing, setImporting] = useState(false)
  const [csvFiltered, setCsvFiltered] = useState(false)
  const [importedRows, setImportedRows] = useState<HealthRow[] | null>(null)
  const importInputRef = useRef<HTMLInputElement>(null)
  const healthViewFilters = useMemo(() => ({ band: bandFilter }), [bandFilter])

  useEffect(() => {
    loadClientHealth()
      .then((data) => {
        setRows(data)
        setCsvFiltered(false)
        setImportedRows(null)
      })
      .catch((e) => {
        showToast(errorMessage(e, 'Could not load client health'), 'error')
        setRows([])
      })
  }, [showToast])

  const boardRows = csvFiltered && importedRows ? importedRows : rows

  const count = (b: HealthBand) => boardRows?.filter((r) => r.health.band === b).length ?? 0
  const warnings = boardRows?.filter((r) => r.health.churnWarning).length ?? 0
  const bandLabel = (b: HealthBand) =>
    b === 'healthy'
      ? t('page.clientHealth.bandHealthy')
      : b === 'watch'
        ? t('page.clientHealth.bandWatch')
        : t('page.clientHealth.bandAtRisk')

  const visible = useMemo(() => {
    if (!boardRows) return []
    if (bandFilter === 'churn') return boardRows.filter((r) => r.health.churnWarning)
    if (bandFilter === 'all') return boardRows
    return boardRows.filter((r) => r.health.band === bandFilter)
  }, [boardRows, bandFilter])

  const partHeaders = useMemo(() => {
    const fromLive = rows?.find((r) => r.health.parts.length)?.health.parts
    const fromVisible = visible.find((r) => r.health.parts.length)?.health.parts
    return fromLive || fromVisible || []
  }, [rows, visible])

  async function importHealthCsv(file: File) {
    if (!rows) return
    setImporting(true)
    try {
      const text = await file.text()
      const { headers, rows: csvRows } = parseCsv(text)
      if (!headers.length) {
        showToast('CSV has no header row', 'error')
        return
      }
      const objects = csvRowsToObjects(headers, csvRows)
      const byClient = new Map(rows.map((r) => [clientKey(r.account.name), r] as const))
      const next: HealthRow[] = []
      const seen = new Set<string>()
      let matched = 0
      let softLoaded = 0
      let skipped = 0

      objects.forEach((row, idx) => {
        const client = String(row.client || '').trim()
        if (!client) {
          skipped += 1
          return
        }
        const key = clientKey(client)
        if (seen.has(key)) {
          skipped += 1
          return
        }
        seen.add(key)
        const existing = byClient.get(key)
        if (existing) {
          next.push(existing)
          matched += 1
          return
        }
        const packageName = String(row.package || '').trim()
        const score = Number(row.score)
        const band = parseBand(String(row.band || ''))
        const churnWarning = parseYesNo(String(row.churn_warning ?? ''))
        const flags = String(row.flags || '')
          .split(';')
          .map((f) => f.trim())
          .filter(Boolean)
        const pkg = packageName
          ? ({ id: `import-pkg-${idx}`, name: packageName, code: '' } as DeliveryPackage)
          : null
        next.push({
          account: stubAccount(client, idx),
          contract: null,
          pkg,
          health: stubHealth(Number.isFinite(score) ? score : 0, band, churnWarning, flags),
        })
        softLoaded += 1
      })

      if (!next.length) {
        showToast('No matching client health rows in CSV', 'error')
        return
      }
      setImportedRows(next)
      setCsvFiltered(true)
      const parts = [matched ? `${matched} matched` : '', softLoaded ? `${softLoaded} soft-loaded` : '']
        .filter(Boolean)
        .join(', ')
      const skipNote = skipped ? ` · ${skipped} row(s) skipped` : ''
      showToast(`Imported ${next.length} client health row(s) (${parts})${skipNote}`, 'success')
    } catch (e) {
      showToast(errorMessage(e, 'Client health CSV import failed'), 'error')
    } finally {
      setImporting(false)
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

  return (
    <div className={docsStyles.page}>
      <header className={docsStyles.hero}>
        <div>
          <p className={docsStyles.kicker}>{t('page.clients.kicker')}</p>
          <h1 className={docsStyles.title}>{t('page.clientHealth.title')}</h1>
          <p className={docsStyles.subtitle}>{t('page.clientHealth.subtitle')}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            ref={importInputRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void importHealthCsv(file)
            }}
          />
          <button
            type="button"
            className={docsStyles.newBtn}
            style={{ background: 'transparent', color: 'inherit', border: '1px solid var(--border)' }}
            disabled={importing || !rows}
            onClick={() => importInputRef.current?.click()}
          >
            {importing ? 'Importing…' : 'Import CSV'}
          </button>
          <button
            type="button"
            className={docsStyles.newBtn}
            style={{ background: 'transparent', color: 'inherit', border: '1px solid var(--border)' }}
            disabled={!boardRows?.length}
            onClick={() => {
              if (!boardRows?.length) return
              exportListCsv(
                'client-health.csv',
                [...EXPORT_COLUMNS],
                boardRows.map(({ account, pkg, health }) => ({
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
          {csvFiltered ? (
            <button
              type="button"
              className={docsStyles.newBtn}
              style={{ background: 'transparent', color: 'inherit', border: '1px solid var(--border)' }}
              onClick={() => {
                setCsvFiltered(false)
                setImportedRows(null)
              }}
            >
              Clear CSV filter
            </button>
          ) : null}
        </div>
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

      {csvFiltered ? (
        <p style={{ color: colors.muted, fontSize: 13, margin: '0 0 12px', lineHeight: 1.45 }}>
          Showing {boardRows?.length ?? 0} client{boardRows?.length === 1 ? '' : 's'} from CSV (session only — Clear CSV
          filter resets).
        </p>
      ) : null}

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

      {boardRows === null ? (
        <p style={{ color: colors.muted }}>{t('page.clientHealth.loading')}</p>
      ) : boardRows.length === 0 ? (
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
                {partHeaders.map((p) => (
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
                    {account.id.startsWith('import-') ? (
                      <span style={{ fontWeight: 600 }}>{account.name}</span>
                    ) : (
                      <Link to={`/accounts/${account.id}`} style={{ color: colors.text, fontWeight: 600 }}>
                        {account.name}
                      </Link>
                    )}
                    <div style={{ color: colors.muted, fontSize: 12 }}>
                      {pkg?.name ?? t('page.clientHealth.noPackage')}
                    </div>
                  </td>
                  <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                    <span style={{ fontWeight: 700, color: HEALTH_BAND_COLORS[health.band] }}>{health.score}</span>{' '}
                    <span style={{ color: colors.muted, fontSize: 12 }}>{bandLabel(health.band)}</span>
                  </td>
                  {partHeaders.map((p) => {
                    const part = health.parts.find((x) => x.key === p.key)
                    return (
                      <td key={p.key} style={tdStyle} title={part?.note}>
                        {part ? part.points : '—'}
                        {part ? (
                          <div style={{ color: colors.muted, fontSize: 11, maxWidth: 180 }}>{part.note}</div>
                        ) : null}
                      </td>
                    )
                  })}
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
