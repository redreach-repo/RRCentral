import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarClock } from 'lucide-react'
import { useToast } from '../../contexts/ToastContext'
import { listAccounts } from '../../lib/accountsStore'
import { isUrgentRenewal, renewalText, upcomingRenewals, type RenewalInfo, type RenewalStage } from '../../lib/ctrmRenewals'
import { listTerms } from '../../lib/ctrmTermsStore'
import { errorMessage } from '../../lib/errors'
import { csvRowsToObjects, exportListCsv, parseCsv } from '../../lib/listIo'
import { buttonSecondaryStyle, cardStyle, colors, sectionTitleStyle } from '../../lib/uiStyles'

type RenewalRow = RenewalInfo & { name: string }

const EXPORT_COLUMNS = ['account', 'renewal_date', 'days', 'stage', 'notice_by', 'notice_days_left', 'summary'] as const

const DATE = /^\d{4}-\d{2}-\d{2}$/

function accountKey(name: string): string {
  return name.trim().toLowerCase()
}

function parseStage(raw: string): RenewalStage | null {
  const v = raw.trim().toLowerCase()
  if (v === 'passed') return 'passed'
  if (v === '90' || v === '60' || v === '30') return Number(v) as RenewalStage
  return null
}

function parseOptionalInt(raw: string): number | null {
  const v = String(raw || '').trim()
  if (v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? Math.trunc(n) : null
}

function softRowFromCsv(row: Record<string, string>, idx: number): RenewalRow | null {
  const name = String(row.account || '').trim()
  const renewal = String(row.renewal_date || '').trim()
  if (!name || !DATE.test(renewal)) return null
  const days = parseOptionalInt(String(row.days || ''))
  if (days === null) return null
  const noticeByRaw = String(row.notice_by || '').trim()
  const noticeBy = DATE.test(noticeByRaw) ? noticeByRaw : null
  return {
    accountId: `import-${idx}`,
    name,
    renewal,
    days,
    stage: parseStage(String(row.stage || '')),
    noticeBy,
    noticeDaysLeft: parseOptionalInt(String(row.notice_days_left || '')),
  }
}

/** Dashboard: CTRM Next clients renewing in the next 90 days (or just passed). Hidden when there are none. */
export default function CtrmRenewalsCard() {
  const { showToast } = useToast()
  const [rows, setRows] = useState<RenewalRow[]>([])
  const [importing, setImporting] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let alive = true
    Promise.all([listTerms(), listAccounts()])
      .then(([terms, accounts]) => {
        const names = new Map(accounts.rows.map((a) => [a.id, a.name]))
        if (alive) {
          setRows(upcomingRenewals(terms).map((r) => ({ ...r, name: names.get(r.accountId) ?? 'CTRM Next client' })))
        }
      })
      .catch(() => {
        if (alive) setRows([])
      })
    return () => {
      alive = false
    }
  }, [])

  async function importRenewalsCsv(file: File) {
    setImporting(true)
    try {
      const text = await file.text()
      const { headers, rows: csvRows } = parseCsv(text)
      if (!headers.length) {
        showToast('CSV has no header row', 'error')
        return
      }
      const objects = csvRowsToObjects(headers, csvRows)
      const byAccount = new Map(rows.map((r) => [accountKey(r.name), r] as const))
      const next: RenewalRow[] = []
      const seen = new Set<string>()
      let matched = 0
      let softLoaded = 0
      let skipped = 0

      objects.forEach((row, idx) => {
        const name = String(row.account || '').trim()
        if (!name) {
          skipped += 1
          return
        }
        const key = accountKey(name)
        if (seen.has(key)) {
          skipped += 1
          return
        }
        seen.add(key)
        const existing = byAccount.get(key)
        if (existing) {
          next.push(existing)
          matched += 1
          return
        }
        const soft = softRowFromCsv(row, idx)
        if (!soft) {
          skipped += 1
          return
        }
        next.push(soft)
        softLoaded += 1
      })

      if (!next.length) {
        showToast('No matching CTRM renewals in CSV', 'error')
        return
      }
      setRows(next)
      const parts = [matched ? `${matched} matched` : '', softLoaded ? `${softLoaded} soft-loaded` : ''].filter(Boolean)
      const skipNote = skipped ? ` · ${skipped} row(s) skipped` : ''
      showToast(`Imported ${next.length} CTRM renewal(s) (${parts.join(', ')})${skipNote}`, 'success')
    } catch (e) {
      showToast(errorMessage(e, 'CTRM renewals CSV import failed'), 'error')
    } finally {
      setImporting(false)
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

  if (!rows.length) return null
  return (
    <div style={{ ...cardStyle, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ ...sectionTitleStyle, display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
          <CalendarClock size={18} /> CTRM Next renewals
        </h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            ref={importInputRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void importRenewalsCsv(file)
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
                'ctrm-renewals.csv',
                [...EXPORT_COLUMNS],
                rows.map((r) => ({
                  account: r.name,
                  renewal_date: r.renewal,
                  days: r.days,
                  stage: r.stage || '',
                  notice_by: r.noticeBy || '',
                  notice_days_left: r.noticeDaysLeft ?? '',
                  summary: renewalText(r),
                })),
              )
              showToast('CTRM renewals CSV downloaded', 'success')
            }}
          >
            Export CSV
          </button>
        </div>
      </div>
      <ul style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: 13, lineHeight: 1.55 }}>
        {rows.map((r) => (
          <li key={r.accountId} style={{ marginBottom: 6, color: colors.muted }}>
            {r.accountId.startsWith('import-') ? (
              <span style={{ color: isUrgentRenewal(r) ? colors.danger : colors.text, fontWeight: 600 }}>{r.name}</span>
            ) : (
              <Link to={`/accounts/${r.accountId}`} style={{ color: isUrgentRenewal(r) ? colors.danger : colors.text, fontWeight: 600 }}>
                {r.name}
              </Link>
            )}{' '}
            · {r.stage === 'passed' ? 'renewal passed' : r.stage ? `${r.stage} day reminder` : 'renewal'} · {renewalText(r)}
          </li>
        ))}
      </ul>
    </div>
  )
}
