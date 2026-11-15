import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatDistanceToNowStrict, parseISO } from 'date-fns'
import { ShieldAlert } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { errorMessage } from '../../lib/errors'
import { itemsFor, WATCH_KIND_LABELS, type WatchKind, type WatchRow, type WatchSeverity } from '../../lib/watchdog'
import { listOpenWatchItems } from '../../lib/watchdogStore'
import { csvRowsToObjects, exportListCsv, parseCsv } from '../../lib/listIo'
import { buttonSecondaryStyle, cardStyle, colors, sectionTitleStyle } from '../../lib/uiStyles'

const EXPORT_COLUMNS = ['title', 'kind', 'severity', 'reason', 'owner', 'first_seen_at', 'link'] as const

const KIND_BY_LABEL = new Map(
  (Object.entries(WATCH_KIND_LABELS) as [WatchKind, string][]).map(([k, label]) => [label.toLowerCase(), k]),
)

function matchKind(raw: string): WatchKind | null {
  const v = raw.trim().toLowerCase()
  if (!v) return null
  if (v in WATCH_KIND_LABELS) return v as WatchKind
  return KIND_BY_LABEL.get(v) ?? null
}

function matchSeverity(raw: string): WatchSeverity {
  const v = raw.trim().toLowerCase()
  return v === 'urgent' ? 'urgent' : 'warning'
}

function rowMatchKey(title: string, kind: string, link: string): string {
  return `${title.trim().toLowerCase()}|${kind.trim().toLowerCase()}|${link.trim().toLowerCase()}`
}

/**
 * What the 07:30 watchdog found, each with its owner, reason and link.
 * Defaults to the signed in person's items plus the ones nobody owns.
 * Items clear themselves the morning after the cause is fixed.
 */
export default function WatchdogCard() {
  const { appUserId } = useAuth()
  const { showToast } = useToast()
  const [rows, setRows] = useState<WatchRow[] | null>(null)
  const [mineOnly, setMineOnly] = useState(true)
  const [importing, setImporting] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let alive = true
    listOpenWatchItems()
      .then((r) => alive && setRows(r))
      .catch(() => alive && setRows([]))
    return () => {
      alive = false
    }
  }, [])

  const shown = useMemo(() => itemsFor(rows || [], appUserId, mineOnly), [rows, appUserId, mineOnly])
  if (!rows || rows.length === 0) return null

  async function importWatchCsv(file: File) {
    setImporting(true)
    try {
      const text = await file.text()
      const { headers, rows: csvRows } = parseCsv(text)
      if (!headers.length) {
        showToast('CSV has no header row', 'error')
        return
      }
      const objects = csvRowsToObjects(headers, csvRows)
      const existing = rows ?? []
      const byKey = new Map(
        existing.map((r) => [rowMatchKey(r.title, WATCH_KIND_LABELS[r.kind] ?? r.kind, r.link || ''), r] as const),
      )
      const next: WatchRow[] = []
      const seen = new Set<string>()
      let matched = 0
      let softLoaded = 0
      let skipped = 0

      objects.forEach((row, idx) => {
        const title = String(row.title || '').trim()
        const kindRaw = String(row.kind || '').trim()
        const link = String(row.link || '').trim()
        const kind = matchKind(kindRaw)
        if (!title || !kind) {
          skipped += 1
          return
        }
        const key = rowMatchKey(title, WATCH_KIND_LABELS[kind], link)
        if (seen.has(key)) {
          skipped += 1
          return
        }
        seen.add(key)
        const existingRow = byKey.get(key) || byKey.get(rowMatchKey(title, kind, link))
        if (existingRow) {
          next.push(existingRow)
          matched += 1
          return
        }
        const firstSeen = String(row.first_seen_at || '').trim() || new Date().toISOString()
        next.push({
          id: `import-${idx}`,
          key: `import:${kind}:${idx}`,
          kind,
          severity: matchSeverity(String(row.severity || '')),
          title,
          reason: String(row.reason || '').trim(),
          link: link || '/app',
          owner_user_id: null,
          owner_label: String(row.owner || '').trim(),
          account_id: null,
          first_seen_at: firstSeen,
          last_seen_at: firstSeen,
          cleared_at: null,
        })
        softLoaded += 1
      })

      if (!next.length) {
        showToast('No matching watchdog rows in CSV', 'error')
        return
      }
      setRows(next)
      const parts = [
        matched ? `${matched} matched` : '',
        softLoaded ? `${softLoaded} soft-loaded` : '',
      ].filter(Boolean)
      const skipNote = skipped ? ` · ${skipped} row(s) skipped` : ''
      showToast(`Imported ${next.length} watchdog item(s) (${parts.join(', ')})${skipNote}`, 'success')
    } catch (e) {
      showToast(errorMessage(e, 'Watchdog CSV import failed'), 'error')
    } finally {
      setImporting(false)
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

  return (
    <section style={{ ...cardStyle, marginBottom: 16 }} aria-label="Watchdog">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ ...sectionTitleStyle, display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
          <ShieldAlert size={18} /> Watchdog ({shown.length})
        </h2>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <input
            ref={importInputRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void importWatchCsv(file)
            }}
          />
          <button
            type="button"
            style={buttonSecondaryStyle}
            disabled={importing}
            onClick={() => importInputRef.current?.click()}
          >
            {importing ? 'Importing…' : 'Import CSV'}
          </button>
          <button
            type="button"
            style={buttonSecondaryStyle}
            disabled={!shown.length}
            onClick={() => {
              exportListCsv(
                'watchdog-items.csv',
                [...EXPORT_COLUMNS],
                shown.map((r) => ({
                  title: r.title,
                  kind: WATCH_KIND_LABELS[r.kind] ?? r.kind,
                  severity: r.severity,
                  reason: r.reason,
                  owner: r.owner_label || '',
                  first_seen_at: r.first_seen_at || '',
                  link: r.link || '',
                })),
              )
              showToast('Watchdog CSV downloaded', 'success')
            }}
          >
            Export CSV
          </button>
          <button type="button" style={buttonSecondaryStyle} onClick={() => setMineOnly((m) => !m)}>
            {mineOnly ? 'Show everyone’s' : 'Show mine only'}
          </button>
        </div>
      </div>
      <p style={{ color: colors.muted, fontSize: 12, margin: '6px 0 10px' }}>
        Checked every morning at 07:30. An item clears itself the morning after its cause is fixed.
      </p>
      {shown.length === 0 ? (
        <p style={{ color: colors.muted, fontSize: 13, margin: 0 }}>Nothing on your list.</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
          {shown.map((r) => (
            <li key={r.id} style={{ borderLeft: `3px solid ${r.severity === 'urgent' ? colors.danger : colors.warn}`, paddingLeft: 10 }}>
              <div style={{ fontSize: 14 }}>
                <Link to={r.link || '/app'} style={{ color: colors.text, fontWeight: 600 }}>
                  {r.title}
                </Link>{' '}
                <span style={{ color: colors.muted2, fontSize: 12 }}>{WATCH_KIND_LABELS[r.kind] ?? r.kind}</span>
              </div>
              <div style={{ color: colors.muted, fontSize: 13 }}>{r.reason}</div>
              <div style={{ color: colors.muted2, fontSize: 12 }}>
                {r.owner_label ? `Owner: ${r.owner_label}` : 'No owner'} · on the list for{' '}
                {formatDistanceToNowStrict(parseISO(r.first_seen_at))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
