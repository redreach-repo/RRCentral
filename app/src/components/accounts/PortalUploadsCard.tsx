import { useCallback, useEffect, useRef, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { Download, ExternalLink } from 'lucide-react'
import { useToast } from '../../contexts/ToastContext'
import { sizeLabel } from '../../lib/clientPortal'
import { downloadPortalUpload, listPortalUploads, markPortalUploadFiled } from '../../lib/clientPortalStore'
import { errorMessage } from '../../lib/errors'
import { csvRowsToObjects, exportListCsv, parseCsv } from '../../lib/listIo'
import type { Account, PortalUpload } from '../../lib/types'
import { buttonSecondaryStyle, cardStyle, colors, sectionTitleStyle } from '../../lib/uiStyles'

const smallBtn = { ...buttonSecondaryStyle, padding: '6px 10px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }
const row = { display: 'flex', flexWrap: 'wrap' as const, gap: 8, alignItems: 'center' }

const UPLOAD_CSV_HEADERS = [
  'filename',
  'status',
  'size_bytes',
  'content_type',
  'note',
  'drive_url',
  'error',
  'created_at',
] as const

function parseUploadStatus(raw: string): 'received' | 'filed' | null {
  const v = raw.trim().toLowerCase()
  if (!v) return null
  if (v === 'filed' || v === 'file') return 'filed'
  if (v === 'received' || v === 'waiting') return 'received'
  return null
}

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
  const [importing, setImporting] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)

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

  async function importUploadsCsv(file: File) {
    if (!editable || missingTable) return
    setImporting(true)
    try {
      const text = await file.text()
      const { headers, rows: csvRows } = parseCsv(text)
      if (!headers.length) {
        showToast('CSV has no header row', 'error')
        return
      }
      const objects = csvRowsToObjects(headers, csvRows)
      const waitingByName = new Map<string, PortalUpload[]>()
      for (const u of rows) {
        if (u.status !== 'received') continue
        const key = (u.filename || '').trim().toLowerCase()
        if (!key) continue
        const list = waitingByName.get(key) || []
        list.push(u)
        waitingByName.set(key, list)
      }
      let saved = 0
      let skipped = 0
      for (const csvRow of objects) {
        const filename = String(csvRow.filename || '').trim()
        if (!filename) {
          skipped += 1
          continue
        }
        const desired = parseUploadStatus(String(csvRow.status || ''))
        if (desired !== 'filed') {
          skipped += 1
          continue
        }
        const key = filename.toLowerCase()
        const candidates = waitingByName.get(key) || []
        if (!candidates.length) {
          skipped += 1
          continue
        }
        const createdAt = String(csvRow.created_at || '').trim()
        let matchIdx = 0
        if (createdAt) {
          const byCreated = candidates.findIndex((u) => (u.created_at || '') === createdAt)
          if (byCreated >= 0) matchIdx = byCreated
        }
        const [match] = candidates.splice(matchIdx, 1)
        if (!match) {
          skipped += 1
          continue
        }
        if (!candidates.length) waitingByName.delete(key)
        else waitingByName.set(key, candidates)
        await markPortalUploadFiled(match.id, String(csvRow.drive_url || '').trim())
        saved += 1
      }
      if (!saved && skipped) {
        showToast('No matching portal upload rows in CSV', 'error')
        return
      }
      const skipNote = skipped ? ` · ${skipped} row(s) skipped` : ''
      showToast(`Imported ${saved} portal upload row(s)${skipNote}`, 'success')
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Portal uploads CSV import failed'), 'error')
    } finally {
      setImporting(false)
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

  if (missingTable || rows.length === 0) return null
  const waiting = rows.filter((r) => r.status === 'received').length

  return (
    <section style={{ ...cardStyle, marginTop: 16 }} aria-label="Files from the client">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ ...sectionTitleStyle, margin: 0 }}>Files from the client</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            ref={importInputRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void importUploadsCsv(file)
            }}
          />
          {editable ? (
            <button
              type="button"
              style={smallBtn}
              disabled={importing}
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
                `portal-uploads-${account.id.slice(0, 8)}.csv`,
                [...UPLOAD_CSV_HEADERS],
                rows.map((u) => ({
                  filename: u.filename,
                  status: u.status,
                  size_bytes: u.size_bytes,
                  content_type: u.content_type || '',
                  note: u.note || '',
                  drive_url: u.drive_url || '',
                  error: u.error || '',
                  created_at: u.created_at || '',
                })),
              )
              showToast('Portal uploads CSV downloaded', 'success')
            }}
          >
            Export CSV
          </button>
        </div>
      </div>
      <p style={{ color: colors.muted, fontSize: 13, margin: '8px 0 12px' }}>
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
