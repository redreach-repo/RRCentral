import { useCallback, useEffect, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { Copy, ExternalLink, MessageCircle } from 'lucide-react'
import { useToast } from '../../contexts/ToastContext'
import { portalAccessState } from '../../lib/clientPortal'
import { createPortalLink, listPortalLinks, revokePortalLink } from '../../lib/clientPortalStore'
import { errorMessage } from '../../lib/errors'
import type { Account, AccountContact, PortalAccess } from '../../lib/types'
import { buildWhatsAppUrl } from '../../lib/whatsapp'
import { buttonPrimaryStyle, buttonSecondaryStyle, cardStyle, colors, inputStyle, labelStyle, sectionTitleStyle } from '../../lib/uiStyles'

const smallBtn = { ...buttonSecondaryStyle, padding: '6px 10px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }
const row = { display: 'flex', flexWrap: 'wrap' as const, gap: 8, alignItems: 'center' }
const STATE_LABEL = { active: 'Working', revoked: 'Turned off', expired: 'Expired' } as const
const day = (iso: string | null) => (iso ? format(parseISO(iso), 'd MMM yyyy') : '')

/**
 * Private links to the client portal. Each link is shown once, when it is
 * made: only its hash is kept, so a lost link is replaced, not looked up.
 */
export default function PortalLinksCard({
  account,
  contacts,
  editable,
  author,
}: {
  account: Account
  contacts: AccountContact[]
  editable: boolean
  author: { email: string }
}) {
  const { showToast } = useToast()
  const [links, setLinks] = useState<PortalAccess[]>([])
  const [missingTable, setMissingTable] = useState(false)
  const [contactId, setContactId] = useState('')
  const [fresh, setFresh] = useState<{ url: string; label: string; phone: string } | null>(null)
  const [busy, setBusy] = useState('')

  const load = useCallback(async () => {
    try {
      const r = await listPortalLinks(account.id)
      setLinks(r.rows)
      setMissingTable(r.missingTable)
    } catch {
      setLinks([])
    }
  }, [account.id])

  useEffect(() => {
    void load()
  }, [load])

  async function create() {
    const contact = contacts.find((c) => c.id === contactId) ?? null
    setBusy('create')
    try {
      const label = contact?.name || `${account.name} team`
      const url = await createPortalLink(account.id, { contactId: contact?.id ?? null, label }, author.email)
      setFresh({ url, label, phone: contact?.whatsapp || contact?.phone || '' })
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Could not make the link'), 'error')
    } finally {
      setBusy('')
    }
  }

  async function revoke(link: PortalAccess) {
    if (!window.confirm(`Turn off the portal link for ${link.label}? It stops working straight away.`)) return
    setBusy(link.id)
    try {
      await revokePortalLink(link.id)
      setFresh(null)
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Could not turn off the link'), 'error')
    } finally {
      setBusy('')
    }
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url)
      showToast('Link copied', 'success')
    } catch {
      showToast('Could not copy. Select the link and copy it by hand.', 'error')
    }
  }

  const message = (url: string, label: string) =>
    `Hi ${label.split(' ')[0]}, here is your private Red Reach portal. You can see your requests, build progress, usage, monthly report, quotes and invoices, and send us files: ${url}`

  return (
    <section style={{ ...cardStyle, marginTop: 16 }} aria-label="Client portal">
      <h2 style={sectionTitleStyle}>Client portal</h2>
      <p style={{ color: colors.muted, fontSize: 13, margin: '0 0 12px' }}>
        Send a private link so the client can see their requests, build progress, usage against plan and monthly report,
        accept quotes, pay invoices, reply on open requests and send files. No password needed. Links work for 12 months and you can turn one off at any time.
      </p>

      {missingTable ? (
        <p style={{ color: colors.warn, fontSize: 13 }}>The portal table is not set up yet. Run the client portal SQL first.</p>
      ) : null}

      {editable && !missingTable ? (
        <div style={{ ...row, marginBottom: 12 }}>
          <label style={{ ...labelStyle, margin: 0 }}>
            For
            <select style={{ ...inputStyle, marginLeft: 8, width: 'auto' }} value={contactId} onChange={(e) => setContactId(e.target.value)}>
              <option value="">The whole team</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <button type="button" style={buttonPrimaryStyle} disabled={busy === 'create'} onClick={() => void create()}>
            {busy === 'create' ? 'Making…' : 'Make a link'}
          </button>
        </div>
      ) : null}

      {fresh ? (
        <div style={{ border: `1px solid ${colors.accent}`, borderRadius: 10, padding: 12, marginBottom: 12 }}>
          <div style={{ fontSize: 13, marginBottom: 6 }}>
            New link for {fresh.label}. Send it now: it is only shown this once.
          </div>
          <input readOnly aria-label="Portal link" style={{ ...inputStyle, fontSize: 12 }} value={fresh.url} onFocus={(e) => e.target.select()} />
          <div style={{ ...row, marginTop: 8 }}>
            <button type="button" style={smallBtn} onClick={() => void copy(fresh.url)}>
              <Copy size={14} /> Copy
            </button>
            <a style={smallBtn} href={buildWhatsAppUrl(fresh.phone, message(fresh.url, fresh.label))} target="_blank" rel="noreferrer">
              <MessageCircle size={14} /> WhatsApp
            </a>
            <a style={smallBtn} href={fresh.url} target="_blank" rel="noreferrer">
              <ExternalLink size={14} /> Open
            </a>
            <button type="button" style={smallBtn} onClick={() => setFresh(null)}>
              Done
            </button>
          </div>
        </div>
      ) : null}

      {links.length === 0 ? (
        missingTable ? null : <p style={{ color: colors.muted, fontSize: 13, margin: 0 }}>No links yet.</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {links.map((l) => {
            const state = portalAccessState(l)
            return (
              <li key={l.id} style={{ ...row, justifyContent: 'space-between', padding: '8px 0', borderTop: `1px solid ${colors.border}`, fontSize: 13 }}>
                <span>
                  <strong style={{ fontWeight: 600 }}>{l.label || 'Client'}</strong>
                  <span style={{ display: 'block', color: colors.muted, fontSize: 12 }}>
                    Made {day(l.created_at)}
                    {l.last_used_at ? `, last opened ${day(l.last_used_at)}` : ', not opened yet'}
                    {state === 'active' && l.expires_at ? `, works until ${day(l.expires_at)}` : ''}
                  </span>
                </span>
                <span style={row}>
                  <span style={{ color: state === 'active' ? colors.success : colors.muted }}>{STATE_LABEL[state]}</span>
                  {editable && state === 'active' ? (
                    <button type="button" style={smallBtn} disabled={busy === l.id} onClick={() => void revoke(l)}>
                      Turn off
                    </button>
                  ) : null}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
