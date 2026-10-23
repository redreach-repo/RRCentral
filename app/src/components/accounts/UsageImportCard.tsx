import { useCallback, useEffect, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { RefreshCw } from 'lucide-react'
import { useToast } from '../../contexts/ToastContext'
import { SOURCE_STATUS_LABEL, listImportRuns, runUsageImport } from '../../lib/usageImportStore'
import type { UsageImportRun } from '../../lib/types'
import { buttonPrimaryStyle, cardStyle, colors, sectionTitleStyle } from '../../lib/uiStyles'

/** Status of the daily WhatsApp and AI usage import, with an Import now button. */
export default function UsageImportCard() {
  const { showToast } = useToast()
  const [runs, setRuns] = useState<UsageImportRun[]>([])
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      setRuns(await listImportRuns())
    } catch {
      setRuns([])
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function importNow() {
    setBusy(true)
    try {
      const r = await runUsageImport()
      if (!r.ok) {
        showToast(r.message, 'error')
      } else if (r.whatsapp === 'not_configured' && r.ai === 'not_configured') {
        showToast('Nothing to import yet: add the Meta and Anthropic secrets first. See docs/usage-import.md.', 'error')
      } else if (r.whatsapp === 'error' || r.ai === 'error') {
        showToast(`Import finished with a problem. ${r.message}`, 'error')
      } else {
        showToast(`Usage imported for ${r.written} client month${r.written === 1 ? '' : 's'}.`, 'success')
      }
      await load()
    } finally {
      setBusy(false)
    }
  }

  const last = runs[0]

  return (
    <section style={{ ...cardStyle, marginBottom: 16 }}>
      <h2 style={sectionTitleStyle}>Usage import</h2>
      <p style={{ color: colors.muted, fontSize: 13, margin: '0 0 12px', lineHeight: 1.5 }}>
        Pulls each client&apos;s WhatsApp message counts from Meta and AI spend from Anthropic, for this month (and last
        month during the first 3 days). Link each client to its WhatsApp number and AI workspace on the client page,
        under Usage. Months typed in by hand are left alone. Lead credits stay manual.
      </p>
      {last ? (
        <p style={{ fontSize: 13, margin: '0 0 12px' }}>
          Last run {format(parseISO(last.started_at), 'd MMM yyyy, HH:mm')} ({last.trigger === 'schedule' ? 'daily' : last.requested_by || 'by hand'}):
          WhatsApp {SOURCE_STATUS_LABEL[last.whatsapp_status] ?? last.whatsapp_status}, AI{' '}
          {SOURCE_STATUS_LABEL[last.ai_status] ?? last.ai_status}, {last.rows_written} updated.
          {last.message ? <span style={{ display: 'block', color: colors.muted2, marginTop: 4 }}>{last.message}</span> : null}
        </p>
      ) : (
        <p style={{ fontSize: 13, color: colors.muted, margin: '0 0 12px' }}>No import has run yet.</p>
      )}
      <button type="button" style={buttonPrimaryStyle} disabled={busy} onClick={() => void importNow()}>
        <RefreshCw size={14} /> {busy ? 'Importing…' : 'Import now'}
      </button>
    </section>
  )
}
