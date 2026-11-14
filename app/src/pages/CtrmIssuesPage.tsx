import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { useI18n } from '../contexts/I18nContext'
import { useToast } from '../contexts/ToastContext'
import { listAccounts, listTeam } from '../lib/accountsStore'
import { CLIENT_UPDATE_DAYS, groupIssuesByClient, isCtrmIssue, needsClientUpdate, vendorStatusLabel } from '../lib/ctrmIssues'
import { errorMessage } from '../lib/errors'
import { TICKET_STATUSES, isOpenTicket, optionLabel } from '../lib/support'
import { listTickets } from '../lib/supportStore'
import type { Account, AppUser, Ticket } from '../lib/types'
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
  const { showToast } = useToast()
  const [tickets, setTickets] = useState<Ticket[] | null>(null)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [team, setTeam] = useState<AppUser[]>([])
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    Promise.all([listTickets(), listAccounts(), listTeam()])
      .then(([list, a, u]) => {
        setTickets(list.filter(isCtrmIssue))
        setAccounts(a.rows)
        setTeam(u)
      })
      .catch((e) => showToast(errorMessage(e, 'Could not load the issues'), 'error'))
  }, [showToast])

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

  return (
    <div style={pageStyle}>
      <h1 style={pageTitleStyle}>{t('page.ctrmIssues.title')}</h1>
      <p style={pageSubtitleStyle}>
        {t('page.ctrmIssues.subtitle').replace('{days}', String(CLIENT_UPDATE_DAYS))}
      </p>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', margin: '12px 0 16px' }}>
        <button type="button" style={tab(!showAll)} onClick={() => setShowAll(false)}>
          {t('page.ctrmIssues.open').replace('{n}', String(openCount))}
        </button>
        <button type="button" style={tab(showAll)} onClick={() => setShowAll(true)}>
          {t('page.ctrmIssues.all')}
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
                return (
                  <li key={issue.id} style={{ border: `1px solid ${late ? colors.danger : colors.border}`, borderRadius: 8, padding: '8px 10px' }}>
                    <Link to={`/support/${issue.id}`} style={{ fontWeight: 600 }}>
                      {issue.subject || t('page.ctrmIssues.noSubject')}
                    </Link>
                    <div style={muted}>
                      {optionLabel(TICKET_STATUSES, issue.status)} · raised {format(new Date(issue.created_at), 'd MMM')} · vendor: {vendorStatusLabel(issue.vendor_status)}
                      {issue.vendor_ticket_ref ? ` (${issue.vendor_ticket_ref})` : ''} · owner: {owner(issue.assignee_user_id)}
                    </div>
                    <div style={{ ...muted, color: late ? colors.danger : colors.muted }}>
                      {issue.client_updated_at ? `Client last updated ${format(new Date(issue.client_updated_at), 'd MMM')}` : 'Client not updated yet'}
                      {late ? `, more than ${CLIENT_UPDATE_DAYS} working days ago` : ''}
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
