import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { differenceInCalendarDays, parseISO } from 'date-fns'
import { CalendarClock } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { listAccounts } from '../../lib/accountsStore'
import { isUrgentRenewal, renewalText, upcomingRenewals, type RenewalInfo } from '../../lib/ctrmRenewals'
import { listTerms, saveTerms } from '../../lib/ctrmTermsStore'
import { errorMessage } from '../../lib/errors'
import { csvRowsToObjects, exportListCsv, parseCsv } from '../../lib/listIo'
import { roleAtLeast } from '../../lib/permissions'
import { parseCtrmTermsForm } from '../../lib/schemas/ctrmTerms'
import type { Account, CtrmClientTerms } from '../../lib/types'
import { buttonSecondaryStyle, cardStyle, colors, sectionTitleStyle } from '../../lib/uiStyles'

type RenewalRow = RenewalInfo & { name: string }

const EXPORT_COLUMNS = ['account', 'renewal_date', 'days', 'stage', 'notice_by', 'notice_days_left', 'summary'] as const

const DATE = /^\d{4}-\d{2}-\d{2}$/

function matchAccount(accounts: Account[], name: string): Account | undefined {
  const key = name.trim().toLowerCase()
  if (!key) return undefined
  return accounts.find((a) => a.name.trim().toLowerCase() === key)
}

function noticeDaysFromCsv(row: Record<string, string>, renewal: string, existing: CtrmClientTerms | null): string {
  const explicit = String(row.notice_days ?? '').trim()
  if (explicit !== '') return explicit
  const noticeBy = String(row.notice_by || '').trim()
  if (DATE.test(renewal) && DATE.test(noticeBy)) {
    return String(Math.max(0, differenceInCalendarDays(parseISO(renewal), parseISO(noticeBy))))
  }
  return String(existing?.notice_days ?? 0)
}

/** Dashboard: CTRM Next clients renewing in the next 90 days (or just passed). Hidden when there are none. */
export default function CtrmRenewalsCard() {
  const { user, appUserId, userRole } = useAuth()
  const { showToast } = useToast()
  const canImport = roleAtLeast(userRole, 'sales')
  const [rows, setRows] = useState<RenewalRow[]>([])
  const [importing, setImporting] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async (): Promise<RenewalRow[]> => {
    const [terms, accounts] = await Promise.all([listTerms(), listAccounts()])
    const names = new Map(accounts.rows.map((a) => [a.id, a.name]))
    return upcomingRenewals(terms).map((r) => ({ ...r, name: names.get(r.accountId) ?? 'CTRM Next client' }))
  }, [])

  useEffect(() => {
    let alive = true
    load()
      .then((next) => {
        if (alive) setRows(next)
      })
      .catch(() => {
        if (alive) setRows([])
      })
    return () => {
      alive = false
    }
  }, [load])

  async function importRenewalsCsv(file: File) {
    if (!canImport) return
    setImporting(true)
    try {
      const text = await file.text()
      const { headers, rows: csvRows } = parseCsv(text)
      if (!headers.length) {
        showToast('CSV has no header row', 'error')
        return
      }
      const objects = csvRowsToObjects(headers, csvRows)
      if (!objects.length) {
        showToast('No renewals rows in CSV', 'error')
        return
      }

      const [accounts, terms] = await Promise.all([listAccounts(), listTerms()])
      const termsByAccount = new Map(terms.map((t) => [t.account_id, t]))
      const author = { appUserId, email: user?.email || '' }
      let upserted = 0
      let skipped = 0

      for (const row of objects) {
        const accountName = String(row.account || '').trim()
        const renewalDate = String(row.renewal_date || '').trim()
        if (!accountName || !DATE.test(renewalDate)) {
          skipped += 1
          continue
        }
        const account = matchAccount(accounts.rows, accountName)
        if (!account) {
          skipped += 1
          continue
        }
        const existing = termsByAccount.get(account.id) ?? null
        const parsed = parseCtrmTermsForm({
          contract_start: existing?.contract_start ?? null,
          renewal_date: renewalDate,
          notice: noticeDaysFromCsv(row, renewalDate, existing),
        })
        if (!parsed.ok) {
          skipped += 1
          continue
        }
        const same =
          existing &&
          (existing.renewal_date || null) === parsed.data.renewal_date &&
          existing.notice_days === parsed.data.notice_days
        if (same) {
          skipped += 1
          continue
        }
        await saveTerms(account.id, existing, parsed.data, author)
        termsByAccount.set(account.id, {
          ...(existing || {
            id: '',
            account_id: account.id,
            contract_start: parsed.data.contract_start,
            updated_by: author.email,
            created_at: '',
            updated_at: '',
          }),
          renewal_date: parsed.data.renewal_date,
          notice_days: parsed.data.notice_days,
        })
        upserted += 1
      }

      if (!upserted) {
        showToast(skipped ? `No renewals updated · ${skipped} row(s) skipped` : 'No renewals updated', 'error')
        return
      }
      setRows(await load())
      const skipNote = skipped ? ` · ${skipped} row(s) skipped` : ''
      showToast(`Upserted ${upserted} CTRM renewal(s)${skipNote}`, 'success')
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
          {canImport ? (
            <>
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
            </>
          ) : null}
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
            <Link to={`/accounts/${r.accountId}`} style={{ color: isUrgentRenewal(r) ? colors.danger : colors.text, fontWeight: 600 }}>
              {r.name}
            </Link>{' '}
            · {r.stage === 'passed' ? 'renewal passed' : `${r.stage} day reminder`} · {renewalText(r)}
          </li>
        ))}
      </ul>
    </div>
  )
}
