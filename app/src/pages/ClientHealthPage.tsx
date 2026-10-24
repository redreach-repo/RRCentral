import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import { useToast } from '../contexts/ToastContext'
import { HEALTH_BAND_COLORS, HEALTH_BAND_LABELS, type HealthBand } from '../lib/clientHealth'
import { loadClientHealth, type HealthRow } from '../lib/clientHealthStore'
import { errorMessage } from '../lib/errors'
import {
  cardStyle,
  colors,
  kpiGridStyle,
  pageStyle,
  pageSubtitleStyle,
  pageTitleStyle,
  tableStyle,
  tableWrapStyle,
  tdStyle,
  thStyle,
} from '../lib/uiStyles'

const BANDS: HealthBand[] = ['at_risk', 'watch', 'healthy']

export default function ClientHealthPage() {
  const { showToast } = useToast()
  const [rows, setRows] = useState<HealthRow[] | null>(null)

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

  return (
    <div style={pageStyle}>
      <div>
        <h1 style={pageTitleStyle}>Client health</h1>
        <p style={pageSubtitleStyle}>
          A score out of 100 for each client with a running contract, from four parts worth 25 each: usage against their
          plan, support tickets, monthly report calls attended, and overdue invoices. Below 50, or any warning sign, shows a
          churn warning. Lowest scores first.
        </p>
      </div>

      <div style={kpiGridStyle}>
        {BANDS.map((b) => (
          <div key={b} style={cardStyle}>
            <div style={{ color: colors.muted, fontSize: 13 }}>{HEALTH_BAND_LABELS[b]}</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: HEALTH_BAND_COLORS[b] }}>{count(b)}</div>
          </div>
        ))}
        <div style={cardStyle}>
          <div style={{ color: colors.muted, fontSize: 13 }}>Churn warnings</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: warnings ? colors.danger : colors.text }}>{warnings}</div>
        </div>
      </div>

      {rows === null ? (
        <p style={{ color: colors.muted }}>Loading…</p>
      ) : rows.length === 0 ? (
        <p style={{ color: colors.muted }}>No AI CRM clients with an active contract yet.</p>
      ) : (
        <div style={tableWrapStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Client</th>
                <th style={thStyle}>Score</th>
                {rows[0].health.parts.map((p) => (
                  <th key={p.key} style={thStyle}>
                    {p.label}
                  </th>
                ))}
                <th style={thStyle}>Warning signs</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ account, pkg, health }) => (
                <tr key={account.id}>
                  <td style={tdStyle}>
                    <Link to={`/accounts/${account.id}`} style={{ color: colors.text, fontWeight: 600 }}>
                      {account.name}
                    </Link>
                    <div style={{ color: colors.muted, fontSize: 12 }}>{pkg?.name ?? 'No package'}</div>
                  </td>
                  <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                    <span style={{ fontWeight: 700, color: HEALTH_BAND_COLORS[health.band] }}>{health.score}</span>{' '}
                    <span style={{ color: colors.muted, fontSize: 12 }}>{HEALTH_BAND_LABELS[health.band]}</span>
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
                        {health.flags.length ? health.flags.join('. ') : 'Score below 50'}
                      </span>
                    ) : (
                      <span style={{ color: colors.muted }}>None</span>
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
