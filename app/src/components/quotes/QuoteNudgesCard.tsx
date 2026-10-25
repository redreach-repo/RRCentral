import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Mail, MessageCircle, Timer } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useSettings } from '../../contexts/SettingsContext'
import { useToast } from '../../contexts/ToastContext'
import { errorMessage } from '../../lib/errors'
import {
  canSendNudges,
  NUDGE_DAYS,
  pickTemplate,
  renderTemplate,
  type MessageTemplate,
  type QuoteNudge,
  type TemplateChannel,
} from '../../lib/quoteNudges'
import { contactForNudge, listTemplates, loadQuoteNudges, markFollowedUp } from '../../lib/quoteNudgesStore'
import { buttonSecondaryStyle, cardStyle, colors, sectionTitleStyle } from '../../lib/uiStyles'
import { buildWhatsAppUrl } from '../../lib/whatsapp'

/**
 * "Quote sent, no reply in 3 days": each quote with its follow up ready to
 * send in one tap (the template for its division, merge fields filled).
 * Sending counts as the follow up, so it comes back 3 days later if still quiet.
 */
export default function QuoteNudgesCard() {
  const { userRole } = useAuth()
  const { settings } = useSettings()
  const { showToast } = useToast()
  const show = canSendNudges(userRole)
  const [rows, setRows] = useState<QuoteNudge[] | null>(null)
  const [templates, setTemplates] = useState<MessageTemplate[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!show) return
    let alive = true
    Promise.all([loadQuoteNudges(), listTemplates().catch(() => ({ rows: [] as MessageTemplate[] }))])
      .then(([n, t]) => {
        if (!alive) return
        setRows(n)
        setTemplates(t.rows)
      })
      .catch(() => alive && setRows([]))
    return () => {
      alive = false
    }
  }, [show])

  if (!show || !rows || rows.length === 0) return null

  async function send(n: QuoteNudge, channel: TemplateChannel) {
    setBusy(true)
    try {
      const contact = await contactForNudge(n)
      const t = pickTemplate(templates, { division: n.division, channel, purpose: 'quote_followup' })
      const msg = renderTemplate(t, {
        name: contact.name,
        account: n.account,
        quote_number: n.quote_number,
        amount: n.amount,
        link: '',
        company: settings.companyName || 'Red Reach',
      })
      if (channel === 'whatsapp') {
        if (!contact.phone) throw new Error('No WhatsApp or phone number for this client')
        window.open(buildWhatsAppUrl(contact.phone, msg.body, settings.whatsappCountryCode || '971'), '_blank', 'noopener')
      } else {
        if (!contact.email) throw new Error('No email address for this client')
        window.location.href = `mailto:${contact.email}?subject=${encodeURIComponent(msg.subject)}&body=${encodeURIComponent(msg.body)}`
      }
      await markFollowedUp(n)
      setRows((r) => (r || []).filter((x) => x.key !== n.key))
      showToast(`Follow up for ${n.quote_number} opened. It comes back in ${NUDGE_DAYS} days if there is still no reply.`, 'success')
    } catch (e) {
      showToast(errorMessage(e, 'Could not open the follow up'), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section style={{ ...cardStyle, marginBottom: 16 }} aria-label="Quotes waiting for a reply">
      <h2 style={{ ...sectionTitleStyle, display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
        <Timer size={18} /> Quotes waiting for a reply ({rows.length})
      </h2>
      <p style={{ color: colors.muted, fontSize: 12, margin: '6px 0 10px' }}>
        Sent {NUDGE_DAYS} or more days ago with no follow up since. One tap opens the follow up, ready to send.
      </p>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
        {rows.slice(0, 15).map((n) => (
          <li key={n.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <div>
              <Link to={n.path} style={{ color: colors.text, fontWeight: 600, fontSize: 14 }}>
                {n.account || n.quote_number}
              </Link>
              <div style={{ color: colors.muted, fontSize: 13 }}>
                {n.quote_number}, {n.amount}, {n.days} days without a reply
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button type="button" style={buttonSecondaryStyle} disabled={busy} onClick={() => void send(n, 'whatsapp')}>
                <MessageCircle size={14} /> WhatsApp
              </button>
              <button type="button" style={buttonSecondaryStyle} disabled={busy} onClick={() => void send(n, 'email')}>
                <Mail size={14} /> Email
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
