import { useEffect, useRef, useState } from 'react'
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
import { csvRowsToObjects, exportListCsv, parseCsv } from '../../lib/listIo'
import { buttonSecondaryStyle, cardStyle, colors, sectionTitleStyle } from '../../lib/uiStyles'
import { buildWhatsAppUrl } from '../../lib/whatsapp'

const EXPORT_COLUMNS = [
  'account',
  'quote_number',
  'amount',
  'division',
  'days_waiting',
  'kind',
  'path',
  'followed_up',
] as const

function isFollowedUpFlag(raw: string): boolean {
  const v = raw.trim().toLowerCase()
  return v === 'yes' || v === 'true' || v === '1' || v === 'done' || v === 'y' || v === 'mark' || v === 'followed_up'
}

function matchNudge(rows: QuoteNudge[], row: Record<string, string>): QuoteNudge | undefined {
  const path = String(row.path || '').trim()
  if (path) {
    const byPath = rows.find((n) => n.path === path)
    if (byPath) return byPath
  }
  const kind = String(row.kind || '').trim()
  const quoteNumber = String(row.quote_number || '').trim()
  if (!quoteNumber) return undefined
  return rows.find((n) => n.quote_number === quoteNumber && (!kind || n.kind === kind))
}

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
  const [importing, setImporting] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)

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
  const currentRows = rows

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

  async function importNudgesCsv(file: File) {
    setImporting(true)
    try {
      const text = await file.text()
      const { headers, rows: csvRows } = parseCsv(text)
      if (!headers.length) {
        showToast('CSV has no header row', 'error')
        return
      }
      const objects = csvRowsToObjects(headers, csvRows)
      const remaining = [...currentRows]
      let done = 0
      let skipped = 0
      for (const row of objects) {
        if (!isFollowedUpFlag(String(row.followed_up || row.action || row.status || ''))) {
          skipped += 1
          continue
        }
        const nudge = matchNudge(remaining, row)
        if (!nudge) {
          skipped += 1
          continue
        }
        await markFollowedUp(nudge)
        const idx = remaining.findIndex((n) => n.key === nudge.key)
        if (idx >= 0) remaining.splice(idx, 1)
        done += 1
      }
      setRows(remaining)
      const skipNote = skipped ? ` · ${skipped} row(s) skipped` : ''
      showToast(`Marked ${done} quote nudge(s) followed up${skipNote}`, 'success')
    } catch (e) {
      showToast(errorMessage(e, 'Quote nudges CSV import failed'), 'error')
    } finally {
      setImporting(false)
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

  return (
    <section style={{ ...cardStyle, marginBottom: 16 }} aria-label="Quotes waiting for a reply">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ ...sectionTitleStyle, display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
          <Timer size={18} /> Quotes waiting for a reply ({currentRows.length})
        </h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            ref={importInputRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void importNudgesCsv(file)
            }}
          />
          <button
            type="button"
            style={buttonSecondaryStyle}
            disabled={importing || busy}
            onClick={() => importInputRef.current?.click()}
          >
            {importing ? 'Importing…' : 'Import CSV'}
          </button>
          <button
            type="button"
            style={buttonSecondaryStyle}
            onClick={() => {
              exportListCsv(
                'quote-nudges.csv',
                [...EXPORT_COLUMNS],
                currentRows.map((n) => ({
                  account: n.account || '',
                  quote_number: n.quote_number,
                  amount: n.amount,
                  division: n.division || '',
                  days_waiting: n.days,
                  kind: n.kind,
                  path: n.path,
                  followed_up: '',
                })),
              )
              showToast('Quote nudges CSV downloaded', 'success')
            }}
          >
            Export CSV
          </button>
        </div>
      </div>
      <p style={{ color: colors.muted, fontSize: 12, margin: '6px 0 10px' }}>
        Sent {NUDGE_DAYS} or more days ago with no follow up since. One tap opens the follow up, ready to send.
      </p>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
        {currentRows.slice(0, 15).map((n) => (
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
