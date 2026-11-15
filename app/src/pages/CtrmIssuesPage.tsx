import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { useAuth } from '../contexts/AuthContext'
import { useI18n } from '../contexts/I18nContext'
import { useToast } from '../contexts/ToastContext'
import SavedViewsBar from '../components/SavedViewsBar'
import { useSupportConfig } from '../components/support/useSupportConfig'
import { listAccounts, listTeam } from '../lib/accountsStore'
import { CLIENT_UPDATE_DAYS, groupIssuesByClient, isCtrmIssue, needsClientUpdate, vendorStatusLabel } from '../lib/ctrmIssues'
import { CTRM_ISSUES_CSV_COLUMNS } from '../lib/ctrmIssuesCsv'
import { errorMessage } from '../lib/errors'
import { csvRowsToObjects, exportListCsv, parseCsv, parseListIoRows } from '../lib/listIo'
import { TICKET_STATUSES, isOpenTicket, optionLabel } from '../lib/support'
import {
  createTicket,
  listTickets,
  restoreTicket,
  slaPackageFor,
  softDeleteTicket,
  type TicketRow,
} from '../lib/supportStore'
import type { Account, AppUser } from '../lib/types'
import { buttonSecondaryStyle, cardStyle, colors, pageStyle, pageSubtitleStyle, pageTitleStyle, sectionTitleStyle } from '../lib/uiStyles'

const tab = (on: boolean) => ({ ...buttonSecondaryStyle, padding: '6px 10px', fontSize: 13, borderColor: on ? colors.accent : colors.border, color: on ? colors.text : colors.muted })
const muted = { color: colors.muted, fontSize: 13 }

/**
 * CTRM issues: every CTRM Next client issue from the support desk, grouped
 * by client, oldest first. An open issue whose client has had no update for
 * 2 working days is flagged in red.
 */
export default function CtrmIssuesPage() {
  const { t } = useI18n()
  const { appUserId, user } = useAuth()
  const { showToast } = useToast()
  const { calendar, policies } = useSupportConfig()
  const [tickets, setTickets] = useState<TicketRow[] | null>(null)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [team, setTeam] = useState<AppUser[]>([])
  const [showAll, setShowAll] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [importing, setImporting] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)
  const issuesViewFilters = useMemo(() => ({ show_all: showAll ? '1' : '0' }), [showAll])

  async function load() {
    const [list, a, u] = await Promise.all([
      listTickets(undefined, { includeDeleted: showArchived }),
      listAccounts(),
      listTeam(),
    ])
    setTickets(list.filter(isCtrmIssue))
    setAccounts(a.rows)
    setTeam(u)
  }

  useEffect(() => {
    load().catch((e) => showToast(errorMessage(e, 'Could not load the issues'), 'error'))
  }, [showToast, showArchived])

  const now = useMemo(() => new Date(), [])
  const groups = useMemo(() => {
    const names = new Map(accounts.map((a) => [a.id, a.name]))
    const list = (tickets || []).filter((issue) => showAll || isOpenTicket(issue))
    return groupIssuesByClient(
      list,
      (id) =>
        id
          ? names.get(id) ?? t('page.ctrmIssues.accountFallback')
          : t('page.ctrmIssues.noClient'),
      now,
    )
  }, [tickets, accounts, showAll, now, t])
  const openCount = (tickets || []).filter(isOpenTicket).length
  const flagged = (tickets || []).filter((issue) => needsClientUpdate(issue, now)).length
  const owner = (id: string | null) => team.find((u) => u.id === id)?.name || team.find((u) => u.id === id)?.email || 'Nobody'
  const exportRows = useMemo(
    () =>
      groups.flatMap((g) =>
        g.issues.map((issue) => {
          const assignee =
            team.find((u) => u.id === issue.assignee_user_id)?.name ||
            team.find((u) => u.id === issue.assignee_user_id)?.email ||
            'Nobody'
          return {
            subject: issue.subject || '',
            client: g.name,
            status: issue.status,
            vendor_status: issue.vendor_status || '',
            vendor_ticket_ref: issue.vendor_ticket_ref || '',
            owner: assignee,
            created_at: issue.created_at,
            client_updated_at: issue.client_updated_at || '',
          }
        }),
      ),
    [groups, team],
  )

  async function importIssuesCsv(file: File) {
    setImporting(true)
    try {
      const text = await file.text()
      const { headers, rows } = parseCsv(text)
      const objects = csvRowsToObjects(headers, rows).map((row) => {
        const normalized: Record<string, string> = {}
        for (const c of CTRM_ISSUES_CSV_COLUMNS) {
          normalized[c.key] = String(row[c.label] ?? row[c.key] ?? '').trim()
        }
        return normalized
      })
      const { ok, errors } = parseListIoRows(objects, CTRM_ISSUES_CSV_COLUMNS)
      if (!ok.length && errors.length) {
        showToast(errors[0] || 'No valid CTRM issue rows', 'error')
        return
      }
      const byName = new Map(accounts.map((a) => [a.name.trim().toLowerCase(), a] as const))
      let saved = 0
      let skipped = errors.length
      for (const row of ok) {
        const account = byName.get((row.client || '').toLowerCase())
        if (!account) {
          skipped += 1
          continue
        }
        const packageId = await slaPackageFor(account.id, account.type)
        await createTicket(
          {
            accountId: account.id,
            accountType: account.type,
            packageId,
            contactId: null,
            subject: row.subject,
            details: '',
            channel: 'ctrm_next',
            priority: 'normal',
            assigneeUserId: appUserId,
          },
          policies,
          calendar,
          { appUserId, email: user?.email || '' },
        )
        saved += 1
      }
      const skipNote = skipped ? ` · ${skipped} row(s) skipped` : ''
      showToast(`Imported ${saved} CTRM issue(s)${skipNote}`, 'success')
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'CTRM issues CSV import failed'), 'error')
    } finally {
      setImporting(false)
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

  return (
    <div style={pageStyle}>
      <h1 style={pageTitleStyle}>{t('page.ctrmIssues.title')}</h1>
      <p style={pageSubtitleStyle}>
        {t('page.ctrmIssues.subtitle').replace('{days}', String(CLIENT_UPDATE_DAYS))}
      </p>
      <SavedViewsBar
        moduleId="ctrm_issues"
        filters={issuesViewFilters}
        ownerUserId={appUserId}
        canWrite
        applyDefaultOnLoad={false}
        onApply={(f) => setShowAll(String(f.show_all || '0') === '1')}
        onToast={showToast}
        filtersEqual={(a, b) => String(a.show_all || '0') === String(b.show_all || '0')}
      />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', margin: '12px 0 16px' }}>
        <button type="button" style={tab(!showAll)} onClick={() => setShowAll(false)}>
          {t('page.ctrmIssues.open').replace('{n}', String(openCount))}
        </button>
        <button type="button" style={tab(showAll)} onClick={() => setShowAll(true)}>
          {t('page.ctrmIssues.all')}
        </button>
        <input
          ref={importInputRef}
          type="file"
          accept=".csv,text/csv"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void importIssuesCsv(file)
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
          disabled={!exportRows.length}
          onClick={() => {
            exportListCsv(
              'ctrm-issues.csv',
              CTRM_ISSUES_CSV_COLUMNS.map((c) => c.key),
              exportRows,
            )
            showToast('CTRM issues CSV downloaded', 'success')
          }}
        >
          Export CSV
        </button>
        <button type="button" style={buttonSecondaryStyle} onClick={() => setShowArchived((v) => !v)}>
          {showArchived ? 'Hide archived' : 'Show archived'}
        </button>
        {flagged ? (
          <span style={{ color: colors.danger, fontSize: 13 }}>
            {t('page.ctrmIssues.flagged').replace('{n}', String(flagged))}
          </span>
        ) : null}
      </div>
      {!tickets ? <p style={muted}>{t('page.ctrmIssues.loading')}</p> : null}
      {tickets && !groups.length ? (
        <p style={muted}>
          {showAll ? t('page.ctrmIssues.emptyAll') : t('page.ctrmIssues.emptyOpen')}
        </p>
      ) : null}
      <div style={{ display: 'grid', gap: 12 }}>
        {groups.map((g) => (
          <section key={g.accountId ?? 'none'} style={{ ...cardStyle, borderColor: g.flagged ? colors.danger : colors.border }}>
            <h2 style={{ ...sectionTitleStyle, marginTop: 0 }}>
              {g.accountId ? <Link to={`/accounts/${g.accountId}`}>{g.name}</Link> : g.name}{' '}
              <span style={{ ...muted, fontWeight: 400 }}>
                ({g.issues.length}
                {g.flagged
                  ? t('page.ctrmIssues.needUpdate').replace('{n}', String(g.flagged))
                  : ''}
                )
              </span>
            </h2>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
              {g.issues.map((issue) => {
                const late = needsClientUpdate(issue, now)
                const archived = Boolean(issue.deleted_at)
                return (
                  <li key={issue.id} style={{ border: `1px solid ${late ? colors.danger : colors.border}`, borderRadius: 8, padding: '8px 10px' }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Link to={`/support/${issue.id}`} style={{ fontWeight: 600 }}>
                          {issue.subject || t('page.ctrmIssues.noSubject')}
                          {archived ? (
                            <span style={{ marginLeft: 6, fontSize: 11, color: colors.muted, fontWeight: 400 }}>
                              (archived)
                            </span>
                          ) : null}
                        </Link>
                        <div style={muted}>
                          {optionLabel(TICKET_STATUSES, issue.status)} · raised {format(new Date(issue.created_at), 'd MMM')} · vendor: {vendorStatusLabel(issue.vendor_status)}
                          {issue.vendor_ticket_ref ? ` (${issue.vendor_ticket_ref})` : ''} · owner: {owner(issue.assignee_user_id)}
                        </div>
                        <div style={{ ...muted, color: late ? colors.danger : colors.muted }}>
                          {issue.client_updated_at ? `Client last updated ${format(new Date(issue.client_updated_at), 'd MMM')}` : 'Client not updated yet'}
                          {late ? `, more than ${CLIENT_UPDATE_DAYS} working days ago` : ''}
                        </div>
                      </div>
                      <button
                        type="button"
                        style={buttonSecondaryStyle}
                        onClick={() => {
                          void (async () => {
                            try {
                              if (archived) await restoreTicket(issue.id)
                              else await softDeleteTicket(issue.id)
                              showToast(archived ? 'Issue restored' : 'Issue archived', 'success')
                              await load()
                            } catch (err) {
                              showToast(errorMessage(err, 'Could not update issue'), 'error')
                            }
                          })()
                        }}
                      >
                        {archived ? 'Restore' : 'Archive'}
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}
