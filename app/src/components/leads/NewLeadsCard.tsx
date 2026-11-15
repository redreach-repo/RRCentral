import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatDistanceToNowStrict, parseISO, subDays } from 'date-fns'
import { Inbox } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { errorMessage } from '../../lib/errors'
import { canSeeLeads, newLeads, type NewLead } from '../../lib/leadIntake'
import { listRecentLeads } from '../../lib/leadIntakeStore'
import { csvRowsToObjects, exportListCsv, parseCsv } from '../../lib/listIo'
import { buttonSecondaryStyle, cardStyle, colors, sectionTitleStyle } from '../../lib/uiStyles'

const EXPORT_COLUMNS = ['name', 'detail', 'created_at', 'link'] as const

function leadMatchKey(name: string, link: string, createdAt: string): string {
  return `${name.trim().toLowerCase()}|${link.trim().toLowerCase()}|${createdAt.trim()}`
}

/** Leads from the website, WhatsApp and the landing page in the last 7 days. */
export default function NewLeadsCard() {
  const { userRole } = useAuth()
  const { showToast } = useToast()
  const show = canSeeLeads(userRole)
  const [rows, setRows] = useState<NewLead[] | null>(null)
  const [importing, setImporting] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!show) return
    let alive = true
    const since = subDays(new Date(), 7)
    listRecentLeads(since)
      .then((r) => alive && setRows(newLeads(r, since)))
      .catch(() => alive && setRows([]))
    return () => {
      alive = false
    }
  }, [show])

  if (!show || !rows || rows.length === 0) return null

  async function importLeadsCsv(file: File) {
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
      const byKey = new Map(existing.map((r) => [leadMatchKey(r.name, r.link, r.created_at), r] as const))
      const next: NewLead[] = []
      const seen = new Set<string>()
      let matched = 0
      let softLoaded = 0
      let skipped = 0

      objects.forEach((row, idx) => {
        const name = String(row.name || '').trim()
        const detail = String(row.detail || '').trim()
        const createdAt = String(row.created_at || '').trim()
        const link = String(row.link || '').trim()
        if (!name) {
          skipped += 1
          return
        }
        const key = leadMatchKey(name, link, createdAt)
        if (seen.has(key)) {
          skipped += 1
          return
        }
        seen.add(key)
        const existingRow = byKey.get(key)
        if (existingRow) {
          next.push(existingRow)
          matched += 1
          return
        }
        next.push({
          id: `import-${idx}`,
          name,
          detail,
          link: link || '/crm',
          created_at: createdAt || new Date().toISOString(),
        })
        softLoaded += 1
      })

      if (!next.length) {
        showToast('No matching new lead rows in CSV', 'error')
        return
      }
      setRows(next)
      const parts = [matched ? `${matched} matched` : '', softLoaded ? `${softLoaded} soft-loaded` : ''].filter(Boolean)
      const skipNote = skipped ? ` · ${skipped} row(s) skipped` : ''
      showToast(`Imported ${next.length} new lead(s) (${parts.join(', ')})${skipNote}`, 'success')
    } catch (e) {
      showToast(errorMessage(e, 'New leads CSV import failed'), 'error')
    } finally {
      setImporting(false)
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

  return (
    <section style={{ ...cardStyle, marginBottom: 16 }} aria-label="New leads">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ ...sectionTitleStyle, display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
          <Inbox size={18} /> New leads ({rows.length})
        </h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            ref={importInputRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void importLeadsCsv(file)
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
            onClick={() => {
              exportListCsv(
                'new-leads.csv',
                [...EXPORT_COLUMNS],
                rows.map((r) => ({
                  name: r.name,
                  detail: r.detail,
                  created_at: r.created_at,
                  link: r.link,
                })),
              )
              showToast('New leads CSV downloaded', 'success')
            }}
          >
            Export CSV
          </button>
        </div>
      </div>
      <p style={{ color: colors.muted, fontSize: 12, margin: '6px 0 10px' }}>
        From the website, WhatsApp and the AI CRM landing page in the last 7 days.
      </p>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
        {rows.slice(0, 10).map((r) => (
          <li key={r.id} style={{ borderLeft: `3px solid ${colors.accent}`, paddingLeft: 10 }}>
            <Link to={r.link} style={{ color: colors.text, fontWeight: 600, fontSize: 14 }}>
              {r.name}
            </Link>
            <div style={{ color: colors.muted, fontSize: 13 }}>
              {r.detail} · {formatDistanceToNowStrict(parseISO(r.created_at))} ago
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
