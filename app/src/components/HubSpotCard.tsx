import { useCallback, useEffect, useState } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useI18n } from '../contexts/I18nContext'
import { useToast } from '../contexts/ToastContext'
import { errorMessage } from '../lib/errors'
import { getHubSpotNudge, type HubSpotSyncRun, listHubSpotRuns, runHubSpotSync, runSummary } from '../lib/hubspotSync'
import { exportListCsv } from '../lib/listIo'
import { PRODUCT } from '../lib/product'
import { buttonPrimaryStyle, buttonSecondaryStyle, cardStyle, colors, sectionTitleStyle } from '../lib/uiStyles'

const when = (iso: string) => new Date(iso).toLocaleString()

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

  const last = runs[0]
  return (
    <div style={{ ...cardStyle, marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ ...sectionTitleStyle, margin: 0 }}>{t('page.settings.section.hubspot')}</h2>
        {runs.length ? (
          <button
            type="button"
            style={buttonSecondaryStyle}
            onClick={() => {
              exportListCsv(
                'hubspot-sync-runs.csv',
                [
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
                ],
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
