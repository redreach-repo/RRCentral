import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import BrandLogo from '../components/BrandLogo'
import {
  PORTAL_MESSAGE_MAX,
  PORTAL_UPLOAD_TYPES,
  acceptProblem,
  portalUploadProblem,
  safeUploadName,
  type PortalInvoice,
  type PortalQuote,
  type PortalTicket,
  type PortalUsage,
  type PortalView,
} from '../lib/clientPortal'
import { fileToBase64, loadPortal, portalAction } from '../lib/clientPortalStore'
import { formatAED } from '../lib/money'
import {
  buttonPrimaryStyle,
  buttonSecondaryStyle,
  cardStyle,
  colors,
  inputStyle,
  labelStyle,
  sectionTitleStyle,
  selectStyle,
} from '../lib/uiStyles'

const wrap: CSSProperties = {
  minHeight: '100vh',
  background: colors.bg,
  color: colors.text,
  padding: '24px 16px 48px',
  boxSizing: 'border-box',
}
const column: CSSProperties = { maxWidth: 880, margin: '0 auto', display: 'grid', gap: 16 }
const muted: CSSProperties = { color: colors.muted, fontSize: 13 }
const smallButton: CSSProperties = { ...buttonSecondaryStyle, padding: '6px 10px', fontSize: 13 }
const money = (n: number, currency: string) =>
  currency && currency !== 'AED' ? `${currency} ${n.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : formatAED(n)
const rowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 12,
  padding: '8px 0',
  borderTop: `1px solid ${colors.border}`,
  fontSize: 14,
}

/**
 * The client portal, opened from a private link (/portal#token). No sign in:
 * the token is checked by the client-portal function, which returns only
 * this client's view.
 */
export default function ClientPortalPage() {
  const { hash } = useLocation()
  const token = decodeURIComponent(hash.replace(/^#/, ''))
  const [view, setView] = useState<PortalView | null>(null)
  const [error, setError] = useState('')
  const [month, setMonth] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const r = await loadPortal(token, month).catch(() => ({ ok: false as const, message: 'The portal could not load. Please try again later.' }))
    if (r.ok) {
      setView(r.view)
      setError('')
    } else {
      setError(r.message)
    }
    setLoading(false)
  }, [token, month])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    document.title = view ? `${view.account.name}, client portal` : 'Client portal'
  }, [view])

  if (!view) {
    return (
      <div style={wrap}>
        <div style={column}>
          <BrandLogo height={32} />
          <section style={cardStyle}>
            <p style={{ margin: 0, color: error ? colors.text : colors.muted }}>{loading ? 'Loading your portal…' : error}</p>
          </section>
        </div>
      </div>
    )
  }

  const { build, report } = view
  return (
    <div style={wrap}>
      <div style={column}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <BrandLogo height={32} />
          <span style={muted}>{view.companyName}</span>
        </header>

        <div>
          <h1 style={{ fontSize: 26, margin: '8px 0 4px' }}>{view.account.name}</h1>
          <p style={{ ...muted, margin: 0 }}>
            {view.plan ? `${view.plan.packageName} package` : 'Your AI CRM'}
            {view.plan?.supportResponse ? `, replies within ${view.plan.supportResponse}` : ''}
            {view.account.reference ? `, ${view.account.reference}` : ''}
          </p>
        </div>

        <Section title="Build progress">
          <p style={{ margin: '0 0 10px', fontSize: 14 }}>
            {build.live ? 'Your system is live.' : `${build.done} of ${build.total} stages done. Now: ${build.current}.`}
          </p>
          <Bar percent={build.percent} />
          <ol style={{ margin: '12px 0 0', padding: 0, listStyle: 'none' }}>
            {build.stages.map((s) => (
              <li key={s.label} style={rowStyle}>
                <span>{s.label}</span>
                <span style={{ color: s.status === 'Done' ? colors.success : s.status === 'Blocked' ? colors.warn : colors.muted }}>
                  {s.status}
                  {s.due && s.status !== 'Done' ? `, due ${s.due}` : ''}
                </span>
              </li>
            ))}
          </ol>
        </Section>

        {view.goLive ? (
          <Section title="Go live checklist">
            <p style={{ margin: '0 0 10px', fontSize: 14 }}>
              {view.goLive.done === view.goLive.total
                ? 'Everything is done.'
                : `${view.goLive.done} of ${view.goLive.total} steps done${view.goLive.goLiveDate ? `. Go live planned for ${view.goLive.goLiveDate}` : ''}.`}
            </p>
            <Bar percent={view.goLive.percent} />
            <ol style={{ margin: '12px 0 0', padding: 0, listStyle: 'none' }}>
              {view.goLive.steps.map((s, i) => (
                <li key={`${s.title}-${i}`} style={rowStyle}>
                  <span style={{ minWidth: 0, textDecoration: s.done ? 'line-through' : 'none', color: s.done ? colors.muted : colors.text }}>
                    {s.title}
                    <span style={{ display: 'block', ...muted, textDecoration: 'none' }}>{s.who === 'You' ? 'For you' : 'Red Reach'}</span>
                  </span>
                  <span style={{ textAlign: 'right', fontSize: 13, color: s.done ? colors.success : s.late ? colors.warn : colors.muted }}>
                    {s.done ? 'Done' : s.due ? `${s.late ? 'Was due' : 'Due'} ${s.due}` : 'To do'}
                  </span>
                </li>
              ))}
            </ol>
          </Section>
        ) : null}

        <Section title={`Your requests (${view.openTickets.length} open)`}>
          {view.openTickets.length === 0 ? (
            <p style={{ ...muted, margin: 0 }}>Nothing open right now.</p>
          ) : (
            <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
              {view.openTickets.map((t, i) => (
                <TicketRow key={t.id || `${t.subject}-${i}`} token={token} ticket={t} onDone={load} />
              ))}
            </ul>
          )}
          {view.recentlyResolved.length ? (
            <>
              <div style={{ ...muted, margin: '14px 0 4px' }}>Done recently</div>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                {view.recentlyResolved.map((t, i) => (
                  <li key={`${t.subject}-${i}`} style={rowStyle}>
                    <span>{t.subject}</span>
                    <span style={muted}>{t.resolved}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </Section>

        {view.quotes.length ? (
          <Section title="Quotes">
            <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
              {view.quotes.map((q) => (
                <QuoteRow key={q.id} token={token} quote={q} onDone={load} />
              ))}
            </ul>
          </Section>
        ) : null}

        {view.invoices.length ? (
          <Section title="Invoices">
            <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
              {view.invoices.map((inv) => (
                <InvoiceRow key={inv.id} invoice={inv} />
              ))}
            </ul>
          </Section>
        ) : null}

        <Section title="Send us a file">
          <UploadForm token={token} onDone={load} />
          {view.uploads.length ? (
            <>
              <div style={{ ...muted, margin: '14px 0 4px' }}>Files you sent</div>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                {view.uploads.map((u, i) => (
                  <li key={`${u.filename}-${i}`} style={rowStyle}>
                    <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{u.filename}</span>
                    <span style={{ ...muted, textAlign: 'right' }}>
                      {u.size}, {u.uploaded}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </Section>

        <Section title="Usage against your plan">
          {view.usage.length === 0 ? (
            <p style={{ ...muted, margin: 0 }}>No usage recorded yet.</p>
          ) : (
            <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))' }}>
              {view.usage.map((u) => (
                <UsageBlock key={u.month} usage={u} />
              ))}
            </div>
          )}
        </Section>

        <Section
          title="Monthly report"
          action={
            <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select
                aria-label="Report month"
                style={{ ...selectStyle, padding: '6px 8px', fontSize: 13, width: 'auto' }}
                value={report.month}
                onChange={(e) => setMonth(e.target.value)}
              >
                {view.reportMonths.map((m) => (
                  <option key={m.month} value={m.month}>
                    {m.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => window.print()}
                style={{ background: 'transparent', color: colors.muted, border: `1px solid ${colors.border}`, borderRadius: 8, padding: '6px 10px', cursor: 'pointer' }}
              >
                Print
              </button>
            </span>
          }
        >
          {loading ? <p style={{ ...muted, margin: '0 0 8px' }}>Loading…</p> : null}
          <h3 style={{ fontSize: 14, margin: '0 0 6px' }}>Hours</h3>
          <p style={{ margin: '0 0 6px', fontSize: 14 }}>
            <strong>{report.hours}h</strong> worked in {report.label}
            {report.targetHours ? ` against a ${report.targetHours}h monthly target.` : '.'}
          </p>
          {report.hoursByWork.map((h) => (
            <div key={h.label} style={rowStyle}>
              <span>{h.label}</span>
              <span>{h.hours}h</span>
            </div>
          ))}

          <h3 style={{ fontSize: 14, margin: '16px 0 6px' }}>Support</h3>
          <p style={{ margin: '0 0 6px', fontSize: 14 }}>
            {report.ticketsResolved.length} {report.ticketsResolved.length === 1 ? 'request' : 'requests'} resolved, {report.ticketsOpened} opened.
            {report.answered ? ` ${report.answeredOnTime} of ${report.answered} answered within the agreed time.` : ''}
          </p>
          {report.ticketsResolved.map((t, i) => (
            <div key={`${t.subject}-${i}`} style={rowStyle}>
              <span>{t.subject}</span>
              <span style={muted}>{t.resolved}</span>
            </div>
          ))}

          <h3 style={{ fontSize: 14, margin: '16px 0 6px' }}>Usage</h3>
          {report.usage ? <UsageBlock usage={report.usage} /> : <p style={{ ...muted, margin: 0 }}>No usage recorded for this month.</p>}

          <h3 style={{ fontSize: 14, margin: '16px 0 6px' }}>Coming in {report.nextMonthLabel}</h3>
          {report.comingNext.length ? (
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.6 }}>
              {report.comingNext.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          ) : (
            <p style={{ ...muted, margin: 0 }}>To be agreed at the monthly check in.</p>
          )}
        </Section>

        <p style={{ ...muted, fontSize: 12, textAlign: 'center' }}>
          {view.plan?.termStart && view.plan.termEnd
            ? `Contract ${view.plan.termStart} to ${view.plan.termEnd}. `
            : ''}
          Usage amounts exclude 5% VAT. To raise a new request, message us on WhatsApp or email support as usual.
        </p>
      </div>
    </div>
  )
}

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section style={cardStyle} aria-label={title}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <h2 style={{ ...sectionTitleStyle, margin: 0 }}>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function Bar({ percent }: { percent: number }) {
  const shown = Math.max(0, Math.min(100, percent))
  return (
    <div style={{ height: 8, borderRadius: 999, background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
      <div style={{ width: `${shown}%`, height: '100%', background: percent > 100 ? colors.warn : colors.accent }} />
    </div>
  )
}

function UsageBlock({ usage }: { usage: PortalUsage }) {
  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{usage.label}</div>
      <div style={{ fontSize: 13, marginBottom: 6 }}>
        WhatsApp: {usage.whatsappUsed.toLocaleString('en-AE')}
        {usage.whatsappIncluded ? ` of ${usage.whatsappIncluded.toLocaleString('en-AE')} included` : ''}
        {usage.whatsappPercent != null ? ` (${usage.whatsappPercent}%)` : ''}
      </div>
      {usage.whatsappPercent != null ? <Bar percent={usage.whatsappPercent} /> : null}
      <div style={{ ...muted, marginTop: 8 }}>
        AI: ${usage.aiUsd.toFixed(2)}
        {usage.aiCapUsd != null ? ` of $${Number(usage.aiCapUsd).toFixed(2)} included` : ''}
        {usage.leadCreditsUsd ? `. Lead credits: $${usage.leadCreditsUsd.toFixed(2)}` : ''}
      </div>
      <div style={{ fontSize: 13, marginTop: 6, color: usage.aboveAed > 0 ? colors.warn : colors.muted }}>
        {usage.aboveAed > 0 ? `Above your plan: about ${formatAED(usage.aboveAed)}` : 'Within your plan'}
      </div>
    </div>
  )
}

function useBusy() {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)
  const run = async (work: () => Promise<string | null>, done?: string) => {
    setBusy(true)
    setMessage('')
    try {
      const problem = await work()
      setFailed(Boolean(problem))
      setMessage(problem || done || '')
      return !problem
    } catch {
      setFailed(true)
      setMessage('That did not work. Please try again later.')
      return false
    } finally {
      setBusy(false)
    }
  }
  const note = message ? <p style={{ margin: '6px 0 0', fontSize: 13, color: failed ? colors.warn : colors.success }}>{message}</p> : null
  return { busy, run, note }
}

function TicketRow({ token, ticket, onDone }: { token: string; ticket: PortalTicket; onDone: () => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const { busy, run, note } = useBusy()
  const send = async () => {
    const ok = await run(async () => {
      const r = await portalAction(token, { action: 'ticket_message', ticket_id: ticket.id, message: text })
      return r.ok ? null : r.message
    }, 'Sent. The team will see it on your request.')
    if (ok) {
      setText('')
      setOpen(false)
      await onDone()
    }
  }
  return (
    <li style={{ ...rowStyle, flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <span style={{ minWidth: 0 }}>
          <strong style={{ fontWeight: 600 }}>{ticket.subject}</strong>
          <span style={{ display: 'block', ...muted }}>Opened {ticket.opened}</span>
        </span>
        <span style={{ textAlign: 'right', fontSize: 13 }}>
          {ticket.status}
          <span style={{ display: 'block', color: ticket.late ? colors.warn : colors.muted }}>{ticket.note}</span>
        </span>
      </div>
      {ticket.id ? (
        open ? (
          <div style={{ display: 'grid', gap: 8 }}>
            <label style={labelStyle}>
              Your message
              <textarea
                style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }}
                maxLength={PORTAL_MESSAGE_MAX}
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </label>
            <span style={{ display: 'flex', gap: 8 }}>
              <button type="button" style={{ ...buttonPrimaryStyle, padding: '6px 12px' }} disabled={busy || !text.trim()} onClick={() => void send()}>
                {busy ? 'Sending…' : 'Send'}
              </button>
              <button type="button" style={smallButton} onClick={() => setOpen(false)}>
                Cancel
              </button>
            </span>
          </div>
        ) : (
          <span>
            <button type="button" style={smallButton} onClick={() => setOpen(true)}>
              Add a message
            </button>
          </span>
        )
      ) : null}
      {note}
    </li>
  )
}

function QuoteRow({ token, quote, onDone }: { token: string; quote: PortalQuote; onDone: () => Promise<void> }) {
  const [accepting, setAccepting] = useState(false)
  const [name, setName] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [agreed, setAgreed] = useState(false)
  const { busy, run, note } = useBusy()

  const openPdf = () =>
    run(async () => {
      const r = await portalAction(token, { action: 'quote_pdf', quote_id: quote.id })
      if (!r.ok) return r.message
      const bin = atob(String(r.data.pdf_base64 || ''))
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
      window.open(url, '_blank', 'noopener')
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
      return null
    })

  const accept = async () => {
    const ok = await run(async () => {
      const problem = acceptProblem({ name, date, agreed })
      if (problem) return problem
      const r = await portalAction(token, { action: 'accept_quote', quote_id: quote.id, name, date, agreed })
      return r.ok ? null : r.message
    }, 'Thank you. The quote is accepted and Red Reach will be in touch.')
    if (ok) {
      setAccepting(false)
      await onDone()
    }
  }

  return (
    <li style={{ ...rowStyle, flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ minWidth: 0 }}>
          <strong style={{ fontWeight: 600 }}>{quote.reference}</strong>
          <span style={{ display: 'block', ...muted }}>
            {quote.date ? `Sent ${quote.date}` : ''}
            {quote.state === 'waiting' && quote.validUntil ? `, valid until ${quote.validUntil}` : ''}
          </span>
        </span>
        <span style={{ textAlign: 'right', fontSize: 13 }}>
          {money(quote.amount, quote.currency)}
          <span style={{ display: 'block', color: quote.state === 'accepted' ? colors.success : colors.muted }}>
            {quote.state === 'accepted' ? `Accepted${quote.acceptedBy ? ` by ${quote.acceptedBy}` : ''}${quote.acceptedOn ? ` on ${quote.acceptedOn}` : ''}` : 'Waiting for you'}
          </span>
        </span>
      </div>
      <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {quote.hasPdf ? (
          <button type="button" style={smallButton} disabled={busy} onClick={() => void openPdf()}>
            View PDF
          </button>
        ) : null}
        {quote.state === 'waiting' && !accepting ? (
          <button type="button" style={{ ...buttonPrimaryStyle, padding: '6px 12px' }} onClick={() => setAccepting(true)}>
            Accept quote
          </button>
        ) : null}
      </span>
      {accepting ? (
        <div style={{ display: 'grid', gap: 8 }}>
          <label style={labelStyle}>
            Your full name
            <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </label>
          <label style={labelStyle}>
            Date
            <input style={inputStyle} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 14 }}>
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
            <span>I accept this quote and its terms on behalf of my company.</span>
          </label>
          <span style={{ display: 'flex', gap: 8 }}>
            <button type="button" style={{ ...buttonPrimaryStyle, padding: '6px 12px' }} disabled={busy} onClick={() => void accept()}>
              {busy ? 'Accepting…' : 'Accept'}
            </button>
            <button type="button" style={smallButton} onClick={() => setAccepting(false)}>
              Cancel
            </button>
          </span>
        </div>
      ) : null}
      {note}
    </li>
  )
}

function InvoiceRow({ invoice }: { invoice: PortalInvoice }) {
  return (
    <li style={rowStyle}>
      <span style={{ minWidth: 0 }}>
        <strong style={{ fontWeight: 600 }}>{invoice.reference}</strong>
        <span style={{ display: 'block', ...muted }}>
          {invoice.date ? `Issued ${invoice.date}` : ''}
          {!invoice.paid && invoice.due ? `, due ${invoice.due}` : ''}
        </span>
      </span>
      <span style={{ textAlign: 'right', fontSize: 13, display: 'grid', gap: 4, justifyItems: 'end' }}>
        <span>{money(invoice.amount, invoice.currency)}</span>
        {invoice.paid ? (
          <span style={{ color: colors.success }}>Paid</span>
        ) : (
          <span style={{ color: colors.muted }}>{money(invoice.balance, invoice.currency)} to pay</span>
        )}
        {invoice.payUrl ? (
          <a href={invoice.payUrl} target="_blank" rel="noopener noreferrer" style={{ ...buttonPrimaryStyle, padding: '6px 12px', textDecoration: 'none' }}>
            Pay by card
          </a>
        ) : null}
      </span>
    </li>
  )
}

function UploadForm({ token, onDone }: { token: string; onDone: () => Promise<void> }) {
  const [file, setFile] = useState<File | null>(null)
  const [noteText, setNoteText] = useState('')
  const [inputKey, setInputKey] = useState(0)
  const { busy, run, note } = useBusy()
  const send = async () => {
    if (!file) return
    const ok = await run(async () => {
      const problem = portalUploadProblem({ filename: safeUploadName(file.name), size: file.size })
      if (problem) return problem
      const r = await portalAction(token, { action: 'upload', filename: file.name, content_base64: await fileToBase64(file), note: noteText })
      return r.ok ? null : r.message
    }, 'Thank you, we have your file.')
    if (ok) {
      setFile(null)
      setNoteText('')
      setInputKey((k) => k + 1)
      await onDone()
    }
  }
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <p style={{ ...muted, margin: 0 }}>Documents, logos or lists for your system, up to 5 MB each. They go straight to your project folder.</p>
      <input
        key={inputKey}
        type="file"
        aria-label="File to send"
        accept={Object.keys(PORTAL_UPLOAD_TYPES).map((e) => `.${e}`).join(',')}
        onChange={(e) => setFile(e.target.files?.[0] || null)}
        style={{ fontSize: 14 }}
      />
      <label style={labelStyle}>
        Note (optional)
        <input style={inputStyle} maxLength={1000} value={noteText} onChange={(e) => setNoteText(e.target.value)} />
      </label>
      <span>
        <button type="button" style={{ ...buttonPrimaryStyle, padding: '6px 12px' }} disabled={busy || !file} onClick={() => void send()}>
          {busy ? 'Sending…' : 'Send file'}
        </button>
      </span>
      {note}
    </div>
  )
}
