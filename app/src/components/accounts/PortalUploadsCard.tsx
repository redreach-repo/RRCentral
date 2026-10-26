import { useCallback, useEffect, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { Download, ExternalLink } from 'lucide-react'
import { useToast } from '../../contexts/ToastContext'
import { sizeLabel } from '../../lib/clientPortal'
import { downloadPortalUpload, listPortalUploads, markPortalUploadFiled } from '../../lib/clientPortalStore'
import { errorMessage } from '../../lib/errors'
import type { Account, PortalUpload } from '../../lib/types'
import { buttonSecondaryStyle, cardStyle, colors, sectionTitleStyle } from '../../lib/uiStyles'

const smallBtn = { ...buttonSecondaryStyle, padding: '6px 10px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }
const row = { display: 'flex', flexWrap: 'wrap' as const, gap: 8, alignItems: 'center' }

/**
 * Files the client sent from the portal. Most go straight to their Google
 * Drive folder; one that could not (not in the CRM, Drive not connected) waits here until
 * someone downloads it and files it.
 */
export default function PortalUploadsCard({ account, editable }: { account: Account; editable: boolean }) {
  const { showToast } = useToast()
  const [rows, setRows] = useState<PortalUpload[]>([])
  const [missingTable, setMissingTable] = useState(false)
  const [busy, setBusy] = useState('')

  const load = useCallback(async () => {
    try {
      const r = await listPortalUploads(account.id)
      setRows(r.rows)
      setMissingTable(r.missingTable)
    } catch {
      setRows([])
    }
  }, [account.id])

  useEffect(() => {
    void load()
  }, [load])

  async function download(u: PortalUpload) {
    setBusy(u.id)
    try {
      await downloadPortalUpload(u)
    } catch (e) {
      showToast(errorMessage(e, 'Could not download the file'), 'error')
    } finally {
      setBusy('')
    }
  }

  async function filed(u: PortalUpload) {
    const url = window.prompt(`Where did you file ${u.filename}? Paste the Google Drive link (optional).`, '')
    if (url === null) return
    setBusy(u.id)
    try {
      await markPortalUploadFiled(u.id, url)
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Could not mark it filed'), 'error')
    } finally {
      setBusy('')
    }
  }

  if (missingTable || rows.length === 0) return null
  const waiting = rows.filter((r) => r.status === 'received').length

  return (
    <section style={{ ...cardStyle, marginTop: 16 }} aria-label="Files from the client">
      <h2 style={sectionTitleStyle}>Files from the client</h2>
      <p style={{ color: colors.muted, fontSize: 13, margin: '0 0 12px' }}>
        {waiting
          ? `${waiting} ${waiting === 1 ? 'file is' : 'files are'} waiting here. Download, put it in the client's Google Drive folder, then mark it filed.`
          : 'Everything the client sent is in their Google Drive folder.'}
      </p>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {rows.map((u) => (
          <li key={u.id} style={{ ...row, justifyContent: 'space-between', padding: '8px 0', borderTop: `1px solid ${colors.border}`, fontSize: 13 }}>
            <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
              <strong style={{ fontWeight: 600 }}>{u.filename}</strong>
              <span style={{ display: 'block', color: colors.muted, fontSize: 12 }}>
                {sizeLabel(u.size_bytes)}, {format(parseISO(u.created_at), 'd MMM yyyy HH:mm')}
                {u.note ? `. ${u.note}` : ''}
              </span>
              {u.status === 'received' && u.error ? <span style={{ display: 'block', color: colors.warn, fontSize: 12 }}>{u.error}</span> : null}
            </span>
            <span style={row}>
              {u.status === 'filed' ? (
                u.drive_url ? (
                  <a style={smallBtn} href={u.drive_url} target="_blank" rel="noreferrer">
                    <ExternalLink size={14} /> Open file
                  </a>
                ) : (
                  <span style={{ color: colors.success }}>Filed</span>
                )
              ) : (
                <>
                  <button type="button" style={smallBtn} disabled={busy === u.id} onClick={() => void download(u)}>
                    <Download size={14} /> Download
                  </button>
                  {editable ? (
                    <button type="button" style={smallBtn} disabled={busy === u.id} onClick={() => void filed(u)}>
                      Mark filed
                    </button>
                  ) : null}
                </>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
