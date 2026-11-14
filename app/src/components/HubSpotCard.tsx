import { useCallback, useEffect, useState } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useI18n } from '../contexts/I18nContext'
import { useToast } from '../contexts/ToastContext'
import { errorMessage } from '../lib/errors'
import { getHubSpotNudge, type HubSpotSyncRun, listHubSpotRuns, runHubSpotSync, runSummary } from '../lib/hubspotSync'
import { buttonPrimaryStyle, cardStyle, colors, sectionTitleStyle } from '../lib/uiStyles'

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
      <h2 style={sectionTitleStyle}>{t('page.settings.section.hubspot')}</h2>
      <p style={{ color: colors.muted, fontSize: 13, marginTop: 0, lineHeight: 1.5 }}>
        RR Central sends its accounts to HubSpot as companies, account contacts as contacts (matched by email) and AI CRM
        deals as deals in the Sales Pipeline, nightly and when you press Sync now. It is one way: changes made in HubSpot
        do not come back, and deleting something here leaves it in HubSpot. Deal amounts are the first year value,
        converted from AED to US dollars at 3.6725.
      </p>
      {isLocalMode ? (
        <p style={{ fontSize: 13, color: colors.muted }}>HubSpot needs RR Central connected to Supabase.</p>
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
