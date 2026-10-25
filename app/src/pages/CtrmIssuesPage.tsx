import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
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
  const { showToast } = useToast()
  const [tickets, setTickets] = useState<Ticket[] | null>(null)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [team, setTeam] = useState<AppUser[]>([])
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    Promise.all([listTickets(), listAccounts(), listTeam()])
      .then(([t, a, u]) => {
        setTickets(t.filter(isCtrmIssue))
        setAccounts(a.rows)
        setTeam(u)
      })
      .catch((e) => showToast(errorMessage(e, 'Could not load the issues'), 'error'))
  }, [showToast])

  const now = useMemo(() => new Date(), [])
  const groups = useMemo(() => {
    const names = new Map(accounts.map((a) => [a.id, a.name]))
    const list = (tickets || []).filter((t) => showAll || isOpenTicket(t))
    return groupIssuesByClient(list, (id) => (id ? names.get(id) ?? 'Account' : 'No client yet'), now)
  }, [tickets, accounts, showAll, now])
  const openCount = (tickets || []).filter(isOpenTicket).length
  const flagged = (tickets || []).filter((t) => needsClientUpdate(t, now)).length
  const owner = (id: string | null) => team.find((u) => u.id === id)?.name || team.find((u) => u.id === id)?.email || 'Nobody'

  return (
    <div style={pageStyle}>
      <h1 style={pageTitleStyle}>CTRM issues</h1>
      <p style={pageSubtitleStyle}>
        Problems CTRM Next clients have raised, grouped by client. The vendor ticket number and status are typed in by hand. An
        issue turns red when the client has had no update for {CLIENT_UPDATE_DAYS} working days. Log a new one from the
        client's account (Client issues → Log an issue).
      </p>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', margin: '12px 0 16px' }}>
        <button type="button" style={tab(!showAll)} onClick={() => setShowAll(false)}>
          Open ({openCount})
        </button>
        <button type="button" style={tab(showAll)} onClick={() => setShowAll(true)}>
          All
        </button>
        {flagged ? <span style={{ color: colors.danger, fontSize: 13 }}>{flagged} waiting for an update to the client</span> : null}
      </div>
      {!tickets ? <p style={muted}>Loading…</p> : null}
      {tickets && !groups.length ? <p style={muted}>{showAll ? 'No CTRM Next issues logged yet.' : 'No open CTRM Next issues.'}</p> : null}
      <div style={{ display: 'grid', gap: 12 }}>
        {groups.map((g) => (
          <section key={g.accountId ?? 'none'} style={{ ...cardStyle, borderColor: g.flagged ? colors.danger : colors.border }}>
            <h2 style={{ ...sectionTitleStyle, marginTop: 0 }}>
              {g.accountId ? <Link to={`/accounts/${g.accountId}`}>{g.name}</Link> : g.name}{' '}
              <span style={{ ...muted, fontWeight: 400 }}>
                ({g.issues.length}
                {g.flagged ? `, ${g.flagged} need an update` : ''})
              </span>
            </h2>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
              {g.issues.map((t) => {
                const late = needsClientUpdate(t, now)
                return (
                  <li key={t.id} style={{ border: `1px solid ${late ? colors.danger : colors.border}`, borderRadius: 8, padding: '8px 10px' }}>
                    <Link to={`/support/${t.id}`} style={{ fontWeight: 600 }}>
                      {t.subject || '(no subject)'}
                    </Link>
                    <div style={muted}>
                      {optionLabel(TICKET_STATUSES, t.status)} · raised {format(new Date(t.created_at), 'd MMM')} · vendor: {vendorStatusLabel(t.vendor_status)}
                      {t.vendor_ticket_ref ? ` (${t.vendor_ticket_ref})` : ''} · owner: {owner(t.assignee_user_id)}
                    </div>
                    <div style={{ ...muted, color: late ? colors.danger : colors.muted }}>
                      {t.client_updated_at ? `Client last updated ${format(new Date(t.client_updated_at), 'd MMM')}` : 'Client not updated yet'}
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
