import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { AlertTriangle, HeartPulse } from 'lucide-react'
import { useToast } from '../../contexts/ToastContext'
import { HEALTH_BAND_COLORS, HEALTH_BAND_LABELS, REPORT_CALL_LABELS, reportCallMonths } from '../../lib/clientHealth'
import { listReportCalls, loadClientHealth, saveReportCall, type HealthRow } from '../../lib/clientHealthStore'
import { monthKey } from '../../lib/delivery'
import { errorMessage } from '../../lib/errors'
import { csvRowsToObjects, exportListCsv, parseCsv } from '../../lib/listIo'
import type { Account, ReportCall } from '../../lib/types'
import { buttonSecondaryStyle, cardStyle, colors, sectionTitleStyle } from '../../lib/uiStyles'

const smallBtn: CSSProperties = { ...buttonSecondaryStyle, padding: '4px 9px', fontSize: 12 }

const REPORT_CALL_STATUSES = Object.keys(REPORT_CALL_LABELS) as ReportCall['status'][]

function parseReportCallStatus(raw: string): ReportCall['status'] | null {
  const token = raw.trim().toLowerCase()
  if (!token || token === 'not_recorded' || token === 'not recorded') return null
  const byKey = REPORT_CALL_STATUSES.find((s) => s === token)
  if (byKey) return byKey
  const byLabel = REPORT_CALL_STATUSES.find((s) => REPORT_CALL_LABELS[s].toLowerCase() === token)
  return byLabel ?? null
}

/** Health score for one client, with the monthly report call record that feeds it. */
export default function ClientHealthCard({ account, editable, author }: { account: Account; editable: boolean; author: string }) {
  const { showToast } = useToast()
  const [row, setRow] = useState<HealthRow | null>(null)
  const [calls, setCalls] = useState<ReportCall[]>([])
  const [busy, setBusy] = useState(false)
  const [importing, setImporting] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)

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

  async function importHealthCsv(file: File) {
    if (!editable) return
    setImporting(true)
    try {
      const text = await file.text()
      const { headers, rows } = parseCsv(text)
      if (!headers.length) {
        showToast('CSV has no header row', 'error')
        return
      }
      const objects = csvRowsToObjects(headers, rows)
      let existing = await listReportCalls(account.id)
      let applied = 0
      let skipped = 0
      for (const obj of objects) {
        const metric = String(obj.metric || obj.key || '').trim()
        if (!metric.startsWith('report_call_')) {
          skipped += 1
          continue
        }
        const month = metric.slice('report_call_'.length).trim()
        if (!month) {
          skipped += 1
          continue
        }
        const status = parseReportCallStatus(String(obj.value ?? ''))
        if (!status) {
          skipped += 1
          continue
        }
        await saveReportCall(account.id, month, status, author, existing)
        existing = await listReportCalls(account.id)
        applied += 1
      }
      if (!applied) {
        showToast('No report call rows to import in CSV', 'error')
        return
      }
      const skipNote = skipped ? ` · ${skipped} row(s) skipped` : ''
      showToast(`Imported ${applied} report call(s)${skipNote}`, 'success')
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Client health CSV import failed'), 'error')
    } finally {
      setImporting(false)
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

  if (!row) return null
  const { health } = row
  const color = HEALTH_BAND_COLORS[health.band]

  return (
    <section style={cardStyle} aria-label="Client health">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ ...sectionTitleStyle, display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
          <HeartPulse size={16} style={{ color }} /> Health
        </h2>
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
          {editable ? (
            <button
              type="button"
              style={smallBtn}
              disabled={importing || busy}
              onClick={() => importInputRef.current?.click()}
            >
              {importing ? 'Importing…' : 'Import CSV'}
            </button>
          ) : null}
          <button
            type="button"
            style={smallBtn}
            onClick={() => {
              exportListCsv(
                `client-health-${account.id.slice(0, 8)}.csv`,
                ['metric', 'value', 'note'],
                [
                  { metric: 'score', value: health.score, note: HEALTH_BAND_LABELS[health.band] },
                  { metric: 'churn_warning', value: health.churnWarning ? 'yes' : 'no', note: health.flags.join('; ') },
                  ...health.parts.map((p) => ({ metric: p.label, value: `${p.points}/25`, note: p.note })),
                  ...reportCallMonths().map((m) => {
                    const rec = calls.find((c) => monthKey(c.month) === m.key)
                    return {
                      metric: `report_call_${m.key}`,
                      value: rec ? REPORT_CALL_LABELS[rec.status] : 'not_recorded',
                      note: m.label,
                    }
                  }),
                ],
              )
              showToast('Client health CSV downloaded', 'success')
            }}
          >
            Export CSV
          </button>
        </div>
      </div>
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
