import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { useLocation } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import BrandLogo from '../components/BrandLogo'
import { useI18n } from '../contexts/I18nContext'
import { type AcceptView } from '../lib/quoteAccept'
import { parseQuoteAcceptForm } from '../lib/schemas/quoteAccept'
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
  const { t } = useI18n()
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
    document.title = view
      ? t('page.quoteAccept.heading').replace('{ref}', view.reference)
      : t('page.quoteAccept.docTitle')
  }, [view, t])

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
    const parsed = parseQuoteAcceptForm({ name, date, agreed })
    if (!parsed.ok) {
      setFormError(parsed.error)
      return
    }
    setFormError('')
    setBusy(true)
    const r = await callQuoteAccept(token, {
      action: 'accept',
      name: parsed.data.name,
      date: parsed.data.date,
      agreed: true,
    })
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
            <p style={{ margin: 0, color: error ? colors.text : colors.muted }}>
              {loading ? t('page.quoteAccept.loading') : error}
            </p>
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
          <h1 style={{ fontSize: 24, margin: '0 0 4px' }}>
            {t('page.quoteAccept.heading').replace('{ref}', view.reference)}
          </h1>
          <p style={{ ...muted, margin: '0 0 12px' }}>
            {t('page.quoteAccept.forClient').replace('{client}', view.client)}
            {view.date ? t('page.quoteAccept.dated').replace('{date}', day(view.date)) : ''}
            {view.validUntil
              ? t('page.quoteAccept.validUntil').replace('{date}', day(view.validUntil))
              : ''}
          </p>
          <p style={{ fontSize: 20, fontWeight: 700, margin: '0 0 8px' }}>{money(view.amount, view.currency)}</p>
          {view.description ? <p style={{ fontSize: 14, whiteSpace: 'pre-wrap', margin: '0 0 12px' }}>{view.description}</p> : null}
          {view.hasPdf ? (
            <button type="button" style={buttonSecondaryStyle} disabled={busy} onClick={() => void openPdf()}>
              {t('page.quoteAccept.openPdf')}
            </button>
          ) : null}
        </section>

        {view.state === 'accepted' ? (
          <section style={{ ...cardStyle, borderLeft: `4px solid ${colors.success}` }}>
            <h2 style={{ fontSize: 18, margin: '0 0 6px' }}>{t('page.quoteAccept.acceptedThanks')}</h2>
            <p style={{ margin: 0, fontSize: 14 }}>
              {t('page.quoteAccept.acceptedBy').replace('{name}', view.acceptedName || '')}
              {view.acceptedAt
                ? t('page.quoteAccept.acceptedOn').replace(
                    '{when}',
                    format(parseISO(view.acceptedAt), 'd MMM yyyy, HH:mm'),
                  )
                : ''}
              {t('page.quoteAccept.acceptedNext')}
            </p>
          </section>
        ) : view.state === 'closed' ? (
          <section style={cardStyle}>
            <p style={{ margin: 0, fontSize: 14 }}>{t('page.quoteAccept.closed')}</p>
          </section>
        ) : (
          <section style={cardStyle}>
            <h2 style={{ fontSize: 18, margin: '0 0 6px' }}>{t('page.quoteAccept.acceptThis')}</h2>
            <p style={{ ...muted, margin: '0 0 12px' }}>{t('page.quoteAccept.instructions')}</p>
            <div style={{ display: 'grid', gap: 10 }}>
              <label style={labelStyle} htmlFor="accept-name">
                {t('page.quoteAccept.fullName')}
              </label>
              <input id="accept-name" style={inputStyle} value={name} autoComplete="name" onChange={(e) => setName(e.target.value)} />
              <label style={labelStyle} htmlFor="accept-date">
                {t('page.quoteAccept.date')}
              </label>
              <input id="accept-date" type="date" style={inputStyle} value={date} onChange={(e) => setDate(e.target.value)} />
              <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 14 }}>
                <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
                {t('page.quoteAccept.agree')
                  .replace('{ref}', view.reference)
                  .replace('{amount}', money(view.amount, view.currency))
                  .replace('{client}', view.client)}
              </label>
              {formError ? <p style={{ color: colors.danger, fontSize: 13, margin: 0 }}>{formError}</p> : null}
              <button type="button" style={buttonPrimaryStyle} disabled={busy} onClick={() => void accept()}>
                {busy ? t('page.quoteAccept.saving') : t('page.quoteAccept.accept')}
              </button>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
