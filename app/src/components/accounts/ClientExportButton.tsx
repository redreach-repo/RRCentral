import { useState } from 'react'
import { Download } from 'lucide-react'
import Modal from '../Modal'
import { useSettings } from '../../contexts/SettingsContext'
import { useToast } from '../../contexts/ToastContext'
import { logAccountEvent } from '../../lib/accountsStore'
import { buildExportZip, exportFileName, tablesFor, type ExportMode } from '../../lib/clientExport'
import { collectClientData } from '../../lib/clientExportStore'
import { downloadBlob } from '../../lib/documents'
import { errorMessage } from '../../lib/errors'
import type { Account } from '../../lib/types'
import { buttonPrimaryStyle, buttonSecondaryStyle, colors } from '../../lib/uiStyles'

/** One click export of everything RR Central holds for a client. */
export default function ClientExportButton({
  account,
  canFull,
  author,
}: {
  account: Account
  /** Managers and admins can also make the full internal copy. */
  canFull: boolean
  author: { appUserId: string | null; email: string }
}) {
  const { settings } = useSettings()
  const { showToast } = useToast()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<ExportMode>('client')
  const [busy, setBusy] = useState(false)

  async function run() {
    setBusy(true)
    try {
      const when = new Date()
      const data = await collectClientData(account.id, mode)
      const { zip, counts } = buildExportZip(account, mode, data, {
        companyName: settings.companyName || 'Red Reach',
        madeBy: author.email,
        when,
      })
      downloadBlob(new Blob([zip as BlobPart], { type: 'application/zip' }), exportFileName(account, mode, when))
      const total = counts.reduce((n, c) => n + c.count, 0)
      void logAccountEvent(
        account.id,
        `Data export made (${mode === 'client' ? 'copy for the client' : 'full internal copy'}, ${total} records)`,
        author,
      )
      showToast('Export downloaded', 'success')
      setOpen(false)
    } catch (e) {
      showToast(errorMessage(e, 'Could not make the export'), 'error')
    } finally {
      setBusy(false)
    }
  }

  const option = (value: ExportMode, title: string, text: string) => (
    <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer', marginBottom: 12 }}>
      <input type="radio" name="export-mode" checked={mode === value} onChange={() => setMode(value)} style={{ marginTop: 4 }} />
      <span>
        <span style={{ fontWeight: 600 }}>{title}</span>
        <span style={{ display: 'block', color: colors.muted, fontSize: 13 }}>{text}</span>
      </span>
    </label>
  )

  return (
    <>
      <button type="button" style={buttonSecondaryStyle} onClick={() => setOpen(true)}>
        <Download size={14} /> Export data
      </button>
      <Modal open={open} title={`Export data for ${account.name}`} onClose={() => setOpen(false)} width={520}>
        <p style={{ margin: '0 0 14px', fontSize: 13, color: colors.muted }}>
          Downloads one ZIP file with a spreadsheet for each kind of record, a JSON file with everything, and a README.
        </p>
        {option(
          'client',
          'Copy for the client',
          `What to send when a client asks for their data or leaves: ${tablesFor('client')
            .map((t) => t.label.toLowerCase())
            .join(', ')}. Internal notes and costs are left out.`,
        )}
        {canFull
          ? option(
              'full',
              'Full copy for our records',
              'Everything, including internal notes, hours, AI costs and sales history. Do not send this one to the client.',
            )
          : null}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
          <button type="button" style={buttonSecondaryStyle} onClick={() => setOpen(false)}>
            Cancel
          </button>
          <button type="button" style={buttonPrimaryStyle} disabled={busy} onClick={() => void run()}>
            <Download size={14} /> {busy ? 'Collecting…' : 'Download'}
          </button>
        </div>
      </Modal>
    </>
  )
}
