import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Mail, Paperclip } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { db } from '../../lib/db'
import { errorMessage } from '../../lib/errors'
import { MailLinksMissing, linksForTargets, type MailLink } from '../../lib/mailInbox/mailLinks'
import { mailWhen } from '../../lib/mailInbox/mailInbox'
import type { Account } from '../../lib/types'
import { cardStyle, colors, sectionTitleStyle } from '../../lib/uiStyles'

/** Name part of an address header: `"Sam Lee" <sam@x.com>` -> Sam Lee. */
function who(raw: string): string {
  const named = raw.match(/^"?([^"<]+?)"?\s*<[^>]+>/)
  return (named ? named[1] : raw.split(',')[0] || '').trim()
}

/**
 * Emails linked to this client from Mail, and to its CRM company or deal.
 * Everyone who can see the client sees the subject, sender and date; only the
 * person whose mailbox holds the email can open it.
 */
export default function EmailHistoryCard({ account }: { account: Pick<Account, 'id' | 'name'> }) {
  const { user, userRole } = useAuth()
  const me = (user?.email || '').toLowerCase()
  const [links, setLinks] = useState<MailLink[] | null>(null)
  const [error, setError] = useState('')
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    let gone = false
    ;(async () => {
      try {
        const crm = await db.from('crm').select('id').eq('account_id', account.id)
        const crmIds = ((crm.data as { id: string }[]) || []).map((r) => r.id)
        const found = await linksForTargets([
          { type: 'account', id: account.id },
          ...crmIds.map((id) => ({ type: 'crm' as const, id })),
        ])
        if (!gone) setLinks(found)
      } catch (e) {
        if (gone) return
        // Before the mail_links SQL runs, stay out of the way.
        if (e instanceof MailLinksMissing) setHidden(true)
        else setError(errorMessage(e, 'Could not load emails'))
        setLinks([])
      }
    })()
    return () => {
      gone = true
    }
  }, [account.id])

  if (hidden || !['admin', 'manager', 'sales'].includes(userRole)) return null

  return (
    <section style={{ ...cardStyle, marginTop: 16 }} aria-label="Emails">
      <h2 style={{ ...sectionTitleStyle, display: 'flex', alignItems: 'center', gap: 8 }}>
        <Mail size={16} /> Emails
      </h2>
      {error && <p style={{ color: colors.danger, fontSize: 13, margin: 0 }}>{error}</p>}
      {links === null && <p style={{ color: colors.muted, fontSize: 13, margin: 0 }}>Loading…</p>}
      {links && links.length === 0 && !error && (
        <p style={{ color: colors.muted, fontSize: 13, margin: 0 }}>
          No emails linked yet. Open an email in <Link to="/mail">Mail</Link> and press “Link to…”.
        </p>
      )}
      {links && links.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {links.map((l) => {
            const mine = l.mailbox_owner === me
            const when = l.sent_at ? mailWhen(new Date(l.sent_at).getTime()) : ''
            return (
              <li key={l.id} style={{ padding: '8px 0', borderTop: `1px solid ${colors.border}`, display: 'grid', gap: 2 }}>
                <span style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 14 }}>
                  {mine && l.folder_id ? (
                    <Link
                      to={`/mail?folder=${encodeURIComponent(l.folder_id)}&message=${encodeURIComponent(l.message_id)}`}
                      style={{ color: colors.text, fontWeight: 600, overflowWrap: 'anywhere' }}
                    >
                      {l.subject || '(no subject)'}
                    </Link>
                  ) : (
                    <span style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{l.subject || '(no subject)'}</span>
                  )}
                  <span style={{ color: colors.muted, fontSize: 12, flexShrink: 0, display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                    {l.has_attachment && <Paperclip size={12} aria-label="Has attachments" />}
                    {when}
                  </span>
                </span>
                <span style={{ color: colors.muted, fontSize: 12, overflowWrap: 'anywhere' }}>
                  From {who(l.from_address) || 'unknown'}
                  {l.to_address ? ` to ${who(l.to_address)}` : ''}
                  {mine ? ' · in your mailbox' : ` · in ${l.mailbox_owner}'s mailbox`}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
