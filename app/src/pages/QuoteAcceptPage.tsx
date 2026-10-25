import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { useLocation } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import BrandLogo from '../components/BrandLogo'
import { acceptProblem, type AcceptView } from '../lib/quoteAccept'
import { callQuoteAccept } from '../lib/quoteAcceptStore'
import { buttonPrimaryStyle, buttonSecondaryStyle, cardStyle, colors, inputStyle, labelStyle } from '../lib/uiStyles'

const wrap: CSSProperties = {
  minHeight: '100vh',
  background: colors.bg,
  color: colors.text,
  padding: '24px 16px 48px',
  boxSizing: 'border-box',
}
const column: CSSProperties = { maxWidth: 720, margin: '0 auto', display: 'grid', gap: 16 }
const muted: CSSProperties = { color: colors.muted, fontSize: 13 }

const day = (iso: string) => (iso ? format(parseISO(iso.slice(0, 10)), 'd MMM yyyy') : '')
const money = (n: number, ccy: string) =>
  `${ccy} ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/**
 * Where a client accepts a quote, opened from a private link (/accept#token).
 * No sign in: the quote-accept function checks the token and returns only
 * this quote's headline and PDF.
 */
export default function QuoteAcceptPage() {
  const { hash } = useLocation()
  const token = decodeURIComponent(hash.replace(/^#/, ''))
  const [view, setView] = useState<AcceptView | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [agreed, setAgreed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const r = await callQuoteAccept(token)
    if (r.ok) setView(r.data)
    else setError(r.message)
    setLoading(false)
  }, [token])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    document.title = view ? `Quote ${view.reference}` : 'Quote'
  }, [view])

  async function openPdf() {
    setBusy(true)
    const r = await callQuoteAccept<{ pdf_base64: string; filename: string }>(token, { action: 'pdf' })
    setBusy(false)
    if (!r.ok) {
      setFormError(r.message)
      return
    }
    const bytes = Uint8Array.from(atob(r.data.pdf_base64), (c) => c.charCodeAt(0))
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
    window.open(url, '_blank', 'noopener')
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  async function accept() {
    const problem = acceptProblem({ name, date, agreed })
    setFormError(problem || '')
    if (problem) return
    setBusy(true)
    const r = await callQuoteAccept(token, { action: 'accept', name: name.trim(), date, agreed })
    setBusy(false)
    if (r.ok) setView(r.data)
    else setFormError(r.message)
  }

  if (!view) {
    return (
      <div style={wrap}>
        <div style={column}>
          <BrandLogo height={32} />
          <section style={cardStyle}>
            <p style={{ margin: 0, color: error ? colors.text : colors.muted }}>{loading ? 'Loading your quote…' : error}</p>
          </section>
        </div>
      </div>
    )
  }

  return (
    <div style={wrap}>
      <div style={column}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <BrandLogo height={32} />
          <span style={muted}>{view.brand}</span>
        </header>

        <section style={cardStyle}>
          <h1 style={{ fontSize: 24, margin: '0 0 4px' }}>Quote {view.reference}</h1>
          <p style={{ ...muted, margin: '0 0 12px' }}>
            For {view.client}
            {view.date ? `, dated ${day(view.date)}` : ''}
            {view.validUntil ? `, valid until ${day(view.validUntil)}` : ''}
          </p>
          <p style={{ fontSize: 20, fontWeight: 700, margin: '0 0 8px' }}>{money(view.amount, view.currency)}</p>
          {view.description ? <p style={{ fontSize: 14, whiteSpace: 'pre-wrap', margin: '0 0 12px' }}>{view.description}</p> : null}
          {view.hasPdf ? (
            <button type="button" style={buttonSecondaryStyle} disabled={busy} onClick={() => void openPdf()}>
              Open the quote PDF
            </button>
          ) : null}
        </section>

        {view.state === 'accepted' ? (
          <section style={{ ...cardStyle, borderLeft: `4px solid ${colors.success}` }}>
            <h2 style={{ fontSize: 18, margin: '0 0 6px' }}>Accepted. Thank you.</h2>
            <p style={{ margin: 0, fontSize: 14 }}>
              Accepted by {view.acceptedName}
              {view.acceptedAt ? ` on ${format(parseISO(view.acceptedAt), 'd MMM yyyy, HH:mm')}` : ''}. The Red Reach team will be in
              touch with the next steps and the invoice.
            </p>
          </section>
        ) : view.state === 'closed' ? (
          <section style={cardStyle}>
            <p style={{ margin: 0, fontSize: 14 }}>This quote can no longer be accepted online. Ask Red Reach for a new one.</p>
          </section>
        ) : (
          <section style={cardStyle}>
            <h2 style={{ fontSize: 18, margin: '0 0 6px' }}>Accept this quote</h2>
            <p style={{ ...muted, margin: '0 0 12px' }}>
              Type your full name and the date. We keep your name, the date, the time and your internet address as the
              record of acceptance.
            </p>
            <div style={{ display: 'grid', gap: 10 }}>
              <label style={labelStyle} htmlFor="accept-name">
                Full name
              </label>
              <input id="accept-name" style={inputStyle} value={name} autoComplete="name" onChange={(e) => setName(e.target.value)} />
              <label style={labelStyle} htmlFor="accept-date">
                Date
              </label>
              <input id="accept-date" type="date" style={inputStyle} value={date} onChange={(e) => setDate(e.target.value)} />
              <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 14 }}>
                <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
                I accept quote {view.reference} for {money(view.amount, view.currency)} on behalf of {view.client}.
              </label>
              {formError ? <p style={{ color: colors.danger, fontSize: 13, margin: 0 }}>{formError}</p> : null}
              <button type="button" style={buttonPrimaryStyle} disabled={busy} onClick={() => void accept()}>
                {busy ? 'Saving…' : 'Accept'}
              </button>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
