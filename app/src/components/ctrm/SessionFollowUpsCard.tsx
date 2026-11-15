import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { SESSION_KINDS, sessionKindLabel } from '../../lib/ctrmSessions'
import { loadFollowUpsDue, markFollowUpDone } from '../../lib/ctrmSessionsStore'
import { errorMessage } from '../../lib/errors'
import { csvRowsToObjects, exportListCsv, parseCsv } from '../../lib/listIo'
import { roleAtLeast } from '../../lib/permissions'
import type { CtrmSession } from '../../lib/types'
import { buttonSecondaryStyle, cardStyle, colors, sectionTitleStyle } from '../../lib/uiStyles'

type FollowUpRow = CtrmSession & { accountName: string }

const EXPORT_COLUMNS = ['account', 'kind', 'session_date', 'follow_up_due', 'attendees', 'notes', 'done'] as const

function isDoneFlag(raw: string): boolean {
  const v = raw.trim().toLowerCase()
  return v === 'yes' || v === 'true' || v === '1' || v === 'done' || v === 'y' || v === 'mark'
}

function resolveKind(raw: string): string | null {
  const kindRaw = raw.trim()
  if (!kindRaw) return null
  const match = SESSION_KINDS.find((k) => k.value === kindRaw || k.label.toLowerCase() === kindRaw.toLowerCase())
  return match?.value ?? null
}

function matchFollowUp(rows: FollowUpRow[], row: Record<string, string>): FollowUpRow | undefined {
  const account = String(row.account || '').trim().toLowerCase()
  const kind = resolveKind(String(row.kind || ''))
  const sessionDate = String(row.session_date || '').trim()
  if (!account || !kind || !sessionDate) return undefined
  const due = String(row.follow_up_due || '').trim()
  return rows.find(
    (s) =>
      s.accountName.trim().toLowerCase() === account &&
      s.kind === kind &&
      s.session_date === sessionDate &&
      (!due || String(s.follow_up_due || '') === due),
  )
}

/** My Day: CTRM Next demo and training follow ups due today or earlier. */
export default function SessionFollowUpsCard() {
  const { user, appUserId, userRole } = useAuth()
  const { showToast } = useToast()
  const show = roleAtLeast(userRole, 'sales') || userRole === 'staff'
  const [rows, setRows] = useState<FollowUpRow[] | null>(null)
  const [importing, setImporting] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!show) return
    let alive = true
    loadFollowUpsDue()
      .then((r) => alive && setRows(r))
      .catch(() => alive && setRows([]))
    return () => {
      alive = false
    }
  }, [show])

  if (!show || !rows || rows.length === 0) return null
  const currentRows = rows
  const author = { appUserId, email: user?.email || '' }

  async function done(s: CtrmSession) {
    try {
      await markFollowUpDone(s, author)
      setRows((r) => (r || []).filter((x) => x.id !== s.id))
    } catch (e) {
      showToast(errorMessage(e, 'Could not save that'), 'error')
    }
  }

  async function importFollowUpsCsv(file: File) {
    setImporting(true)
    try {
      const text = await file.text()
      const { headers, rows: csvRows } = parseCsv(text)
      if (!headers.length) {
        showToast('CSV has no header row', 'error')
        return
      }
      const objects = csvRowsToObjects(headers, csvRows)
      const remaining = [...(rows ?? [])]
      let marked = 0
      let skipped = 0
      for (const row of objects) {
        if (!isDoneFlag(String(row.done || row.action || row.status || ''))) {
          skipped += 1
          continue
        }
        const session = matchFollowUp(remaining, row)
        if (!session) {
          skipped += 1
          continue
        }
        await markFollowUpDone(session, author)
        const idx = remaining.findIndex((s) => s.id === session.id)
        if (idx >= 0) remaining.splice(idx, 1)
        marked += 1
      }
      setRows(remaining)
      const skipNote = skipped ? ` · ${skipped} row(s) skipped` : ''
      showToast(`Marked ${marked} session follow-up(s) done${skipNote}`, 'success')
    } catch (e) {
      showToast(errorMessage(e, 'Session follow-ups CSV import failed'), 'error')
    } finally {
      setImporting(false)
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

  return (
    <section style={{ ...cardStyle, margin: '12px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ ...sectionTitleStyle, margin: 0 }}>CTRM Next follow ups due ({currentRows.length})</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            ref={importInputRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void importFollowUpsCsv(file)
            }}
          />
          <button
            type="button"
            style={{ ...buttonSecondaryStyle, padding: '4px 10px', fontSize: 12 }}
            disabled={importing}
            onClick={() => importInputRef.current?.click()}
          >
            {importing ? 'Importing…' : 'Import CSV'}
          </button>
          <button
            type="button"
            style={{ ...buttonSecondaryStyle, padding: '4px 10px', fontSize: 12 }}
            onClick={() => {
              exportListCsv(
                'ctrm-session-followups-due.csv',
                [...EXPORT_COLUMNS],
                currentRows.map((s) => ({
                  account: s.accountName,
                  kind: sessionKindLabel(s.kind),
                  session_date: s.session_date || '',
                  follow_up_due: s.follow_up_due || '',
                  attendees: s.attendees || '',
                  notes: s.notes || '',
                  done: '',
                })),
              )
              showToast('Session follow-ups CSV downloaded', 'success')
            }}
          >
            Export CSV
          </button>
        </div>
      </div>
      <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0, display: 'grid', gap: 6 }}>
        {currentRows.map((s) => (
          <li key={s.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center', fontSize: 14 }}>
            <span>
              <Link to={`/accounts/${s.account_id}`}>{s.accountName}</Link>: after the {sessionKindLabel(s.kind).toLowerCase()} on{' '}
              {format(parseISO(s.session_date), 'd MMM')}
              <span style={{ color: colors.muted }}> (due {format(parseISO(String(s.follow_up_due)), 'd MMM')})</span>
            </span>
            <button type="button" style={{ ...buttonSecondaryStyle, padding: '4px 10px', fontSize: 12 }} onClick={() => void done(s)}>
              Done
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
