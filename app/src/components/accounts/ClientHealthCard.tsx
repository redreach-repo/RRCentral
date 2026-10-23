import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { AlertTriangle, HeartPulse } from 'lucide-react'
import { useToast } from '../../contexts/ToastContext'
import { HEALTH_BAND_COLORS, HEALTH_BAND_LABELS, REPORT_CALL_LABELS, reportCallMonths } from '../../lib/clientHealth'
import { listReportCalls, loadClientHealth, saveReportCall, type HealthRow } from '../../lib/clientHealthStore'
import { monthKey } from '../../lib/delivery'
import { errorMessage } from '../../lib/errors'
import type { Account, ReportCall } from '../../lib/types'
import { buttonSecondaryStyle, cardStyle, colors, sectionTitleStyle } from '../../lib/uiStyles'

const smallBtn: CSSProperties = { ...buttonSecondaryStyle, padding: '4px 9px', fontSize: 12 }

/** Health score for one client, with the monthly report call record that feeds it. */
export default function ClientHealthCard({ account, editable, author }: { account: Account; editable: boolean; author: string }) {
  const { showToast } = useToast()
  const [row, setRow] = useState<HealthRow | null>(null)
  const [calls, setCalls] = useState<ReportCall[]>([])
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const [h, c] = await Promise.all([loadClientHealth(account.id), listReportCalls(account.id)])
      setRow(h[0] ?? null)
      setCalls(c)
    } catch {
      setRow(null)
    }
  }, [account.id])

  useEffect(() => {
    void load()
  }, [load])

  async function mark(month: string, status: ReportCall['status']) {
    setBusy(true)
    try {
      await saveReportCall(account.id, month, status, author, calls)
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Could not save the report call'), 'error')
    } finally {
      setBusy(false)
    }
  }

  if (!row) return null
  const { health } = row
  const color = HEALTH_BAND_COLORS[health.band]

  return (
    <section style={cardStyle} aria-label="Client health">
      <h2 style={{ ...sectionTitleStyle, display: 'flex', alignItems: 'center', gap: 8 }}>
        <HeartPulse size={16} style={{ color }} /> Health
      </h2>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span style={{ fontSize: 30, fontWeight: 700, color }}>{health.score}</span>
        <span style={{ color: colors.muted, fontSize: 13 }}>out of 100, {HEALTH_BAND_LABELS[health.band].toLowerCase()}</span>
      </div>
      {health.churnWarning ? (
        <div style={{ border: `1px solid ${colors.danger}`, borderRadius: 8, padding: '8px 10px', margin: '10px 0', fontSize: 13 }}>
          <AlertTriangle size={14} style={{ color: colors.danger, verticalAlign: -2, marginRight: 6 }} />
          <strong>Churn warning.</strong>{' '}
          {health.flags.length ? health.flags.join('. ') + '.' : 'The score is below 50.'} Call them this week.
        </div>
      ) : null}
      <dl style={{ margin: '10px 0 0', fontSize: 13, display: 'grid', gridTemplateColumns: 'auto auto 1fr', gap: '6px 10px' }}>
        {health.parts.map((p) => (
          <div key={p.key} style={{ display: 'contents' }}>
            <dt style={{ color: colors.muted }}>{p.label}</dt>
            <dd style={{ margin: 0, fontWeight: 600 }}>{p.points}/25</dd>
            <dd style={{ margin: 0, color: colors.muted }}>{p.note}</dd>
          </div>
        ))}
      </dl>
      <div style={{ marginTop: 12, fontSize: 13 }}>
        <div style={{ color: colors.muted, marginBottom: 6 }}>Monthly report call</div>
        {reportCallMonths().map((m) => {
          const rec = calls.find((c) => monthKey(c.month) === m.key)
          return (
            <div key={m.key} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <span style={{ minWidth: 90 }}>{m.label}</span>
              {editable ? (
                (Object.keys(REPORT_CALL_LABELS) as ReportCall['status'][]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    style={{ ...smallBtn, borderColor: rec?.status === s ? colors.accent : undefined, fontWeight: rec?.status === s ? 700 : 400 }}
                    aria-pressed={rec?.status === s}
                    disabled={busy}
                    onClick={() => void mark(m.key, s)}
                  >
                    {REPORT_CALL_LABELS[s]}
                  </button>
                ))
              ) : (
                <span style={{ color: colors.muted }}>{rec ? REPORT_CALL_LABELS[rec.status] : 'Not recorded'}</span>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
