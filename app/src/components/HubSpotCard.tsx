import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useI18n } from '../contexts/I18nContext'
import { useToast } from '../contexts/ToastContext'
import { errorMessage } from '../lib/errors'
import { getHubSpotNudge, type HubSpotSyncRun, listHubSpotRuns, runHubSpotSync, runSummary } from '../lib/hubspotSync'
import { csvRowsToObjects, exportListCsv, parseCsv } from '../lib/listIo'
import { PRODUCT } from '../lib/product'
import { buttonPrimaryStyle, buttonSecondaryStyle, cardStyle, colors, sectionTitleStyle } from '../lib/uiStyles'

const when = (iso: string) => new Date(iso).toLocaleString()

const EXPORT_COLUMNS = [
  'started_at',
  'finished_at',
  'trigger',
  'requested_by',
  'companies_created',
  'companies_updated',
  'contacts_created',
  'contacts_updated',
  'deals_created',
  'deals_updated',
  'failed',
  'summary',
  'message',
] as const

function runMatchKey(startedAt: string, trigger: string, requestedBy: string): string {
  return `${startedAt.trim()}|${trigger.trim().toLowerCase()}|${requestedBy.trim().toLowerCase()}`
}

function parseCount(raw: string): number {
  const n = Number(String(raw || '').trim())
  return Number.isFinite(n) ? n : 0
}

function parseTrigger(raw: string): HubSpotSyncRun['trigger'] {
  return String(raw || '').trim().toLowerCase() === 'schedule' ? 'schedule' : 'manual'
}

/**
 * Settings card: RR Central pushes accounts, contacts and AI CRM deals to
 * HubSpot (one way). Managers and admins see the last runs and can sync now.
 */
export default function HubSpotCard() {
  const { userRole, isLocalMode } = useAuth()
  const { t } = useI18n()
  const { showToast } = useToast()
  const [runs, setRuns] = useState<HubSpotSyncRun[]>([])
  const [nudgeAt, setNudgeAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [importing, setImporting] = useState(false)
  const [csvFiltered, setCsvFiltered] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)
  const canSync = userRole === 'admin' || userRole === 'manager'

  const reload = useCallback(async () => {
    if (isLocalMode || !canSync) {
      setLoading(false)
      return
    }
    try {
      const [nextRuns, nextNudge] = await Promise.all([listHubSpotRuns(3), getHubSpotNudge()])
      setRuns(nextRuns)
      setNudgeAt(nextNudge)
      setCsvFiltered(false)
    } catch (e) {
      showToast(errorMessage(e, 'Could not load the HubSpot runs'), 'error')
    } finally {
      setLoading(false)
    }
  }, [canSync, isLocalMode, showToast])

  useEffect(() => {
    void reload()
  }, [reload])

  async function syncNow() {
    setBusy(true)
    try {
      const result = await runHubSpotSync()
      if (result.ok) showToast(`HubSpot: ${result.summary}`, result.message ? 'error' : 'success')
      else showToast(result.message, 'error')
      await reload()
    } finally {
      setBusy(false)
    }
  }

  async function importRunsCsv(file: File) {
    setImporting(true)
    try {
      const text = await file.text()
      const { headers, rows: csvRows } = parseCsv(text)
      if (!headers.length) {
        showToast('CSV has no header row', 'error')
        return
      }
      const objects = csvRowsToObjects(headers, csvRows)
      const byKey = new Map(
        runs.map((r) => [runMatchKey(r.started_at || '', r.trigger, r.requested_by || ''), r] as const),
      )
      const next: HubSpotSyncRun[] = []
      const seen = new Set<string>()
      let matched = 0
      let softLoaded = 0
      let skipped = 0

      objects.forEach((row, idx) => {
        const startedAt = String(row.started_at || '').trim()
        if (!startedAt) {
          skipped += 1
          return
        }
        const trigger = parseTrigger(String(row.trigger || ''))
        const requestedBy = String(row.requested_by || '').trim()
        const key = runMatchKey(startedAt, trigger, requestedBy)
        if (seen.has(key)) {
          skipped += 1
          return
        }
        seen.add(key)
        const existing = byKey.get(key)
        if (existing) {
          next.push(existing)
          matched += 1
          return
        }
        const companiesCreated = parseCount(String(row.companies_created || ''))
        const companiesUpdated = parseCount(String(row.companies_updated || ''))
        const contactsCreated = parseCount(String(row.contacts_created || ''))
        const contactsUpdated = parseCount(String(row.contacts_updated || ''))
        const dealsCreated = parseCount(String(row.deals_created || ''))
        const dealsUpdated = parseCount(String(row.deals_updated || ''))
        const failed = parseCount(String(row.failed || ''))
        const finishedAt = String(row.finished_at || '').trim() || null
        const message = String(row.message || '').trim()
        next.push({
          id: `import-${idx}`,
          started_at: startedAt,
          finished_at: finishedAt,
          trigger,
          requested_by: requestedBy,
          companies_created: companiesCreated,
          companies_updated: companiesUpdated,
          contacts_created: contactsCreated,
          contacts_updated: contactsUpdated,
          deals_created: dealsCreated,
          deals_updated: dealsUpdated,
          failed,
          more_to_do: false,
          message,
        })
        softLoaded += 1
      })

      if (!next.length) {
        showToast('No matching HubSpot sync runs in CSV', 'error')
        return
      }
      setRuns(next)
      setCsvFiltered(true)
      const parts = [matched ? `${matched} matched` : '', softLoaded ? `${softLoaded} soft-loaded` : ''].filter(Boolean)
      const skipNote = skipped ? ` · ${skipped} row(s) skipped` : ''
      showToast(`Imported ${next.length} HubSpot sync run(s) (${parts.join(', ')})${skipNote}`, 'success')
    } catch (e) {
      showToast(errorMessage(e, 'HubSpot sync runs CSV import failed'), 'error')
    } finally {
      setImporting(false)
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

  const last = runs[0]
  return (
    <div style={{ ...cardStyle, marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ ...sectionTitleStyle, margin: 0 }}>{t('page.settings.section.hubspot')}</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            ref={importInputRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void importRunsCsv(file)
            }}
          />
          {canSync ? (
            <button
              type="button"
              style={buttonSecondaryStyle}
              disabled={importing}
              onClick={() => importInputRef.current?.click()}
            >
              {importing ? 'Importing…' : 'Import CSV'}
            </button>
          ) : null}
          {runs.length ? (
            <button
              type="button"
              style={buttonSecondaryStyle}
              onClick={() => {
                exportListCsv(
                  'hubspot-sync-runs.csv',
                  [...EXPORT_COLUMNS],
                  runs.map((r) => ({
                    started_at: r.started_at || '',
                    finished_at: r.finished_at || '',
                    trigger: r.trigger,
                    requested_by: r.requested_by || '',
                    companies_created: r.companies_created,
                    companies_updated: r.companies_updated,
                    contacts_created: r.contacts_created,
                    contacts_updated: r.contacts_updated,
                    deals_created: r.deals_created,
                    deals_updated: r.deals_updated,
                    failed: r.failed,
                    summary: runSummary(r),
                    message: r.message || '',
                  })),
                )
                showToast('HubSpot sync runs CSV downloaded', 'success')
              }}
            >
              Export CSV
            </button>
          ) : null}
        </div>
      </div>
      <p style={{ color: colors.muted, fontSize: 13, marginTop: 8, lineHeight: 1.5 }}>
        {PRODUCT.name} sends its accounts to HubSpot as companies, account contacts as contacts (matched by email) and AI
        CRM deals as deals in the Sales Pipeline, nightly and when you press Sync now. It is one way: changes made in
        HubSpot do not come back, and deleting something here leaves it in HubSpot. Deal amounts are the first year
        value, converted from AED to US dollars at 3.6725.
      </p>
      {isLocalMode ? (
        <p style={{ fontSize: 13, color: colors.muted }}>
          HubSpot needs {PRODUCT.name} connected to Supabase.
        </p>
      ) : !canSync ? (
        <p style={{ fontSize: 13, color: colors.muted }}>Managers and admins run the HubSpot sync.</p>
      ) : loading ? (
        <p style={{ fontSize: 13, color: colors.muted }}>
          <Loader2 size={14} className="spin" style={{ verticalAlign: -2 }} /> Checking HubSpot…
        </p>
      ) : (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
            <button
              type="button"
              style={{ ...buttonPrimaryStyle, display: 'inline-flex', alignItems: 'center', gap: 6 }}
              disabled={busy}
              onClick={() => void syncNow()}
            >
              {busy ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />} Sync now
            </button>
            <span style={{ fontSize: 13, color: colors.muted }}>
              {last
                ? `Last sync ${when(last.started_at)} (${last.trigger === 'schedule' ? 'nightly' : last.requested_by || 'by hand'}): ${runSummary(last)}`
                : 'Not synced yet.'}
            </span>
          </div>
          {csvFiltered ? (
            <p style={{ fontSize: 13, color: colors.muted, margin: '10px 0 0' }}>
              Showing {runs.length} sync run{runs.length === 1 ? '' : 's'} from CSV (session only — Sync now or refresh
              clears).
            </p>
          ) : null}
          {runs.length > 1 ? (
            <ul style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: 13, lineHeight: 1.6, color: colors.muted }}>
              {runs.map((r) => (
                <li key={r.id}>
                  {when(r.started_at)} · {r.trigger === 'schedule' ? 'nightly' : r.requested_by || 'by hand'} ·{' '}
                  {runSummary(r)}
                </li>
              ))}
            </ul>
          ) : null}
          {nudgeAt ? (
            <p style={{ fontSize: 13, color: colors.warn, margin: '10px 0 0' }}>
              Outbox asked for a sync at {when(nudgeAt)}. Sync now (or the next schedule) will clear it.
            </p>
          ) : null}
          {last?.message ? (
            <pre style={{ fontSize: 12, color: colors.warn, whiteSpace: 'pre-wrap', margin: '10px 0 0' }}>{last.message}</pre>
          ) : null}
        </>
      )}
    </div>
  )
}
