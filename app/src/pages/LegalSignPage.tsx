import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { useLocation } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import BrandLogo from '../components/BrandLogo'
import {
  LEGAL_SIGN_ASSENT_BLURB,
  LEGAL_SIGN_DONE_BLURB,
  legalDocLabel,
  signProblem,
  type LegalSignView,
} from '../lib/legalDocuments'
import { callLegalSign } from '../lib/legalDocumentStore'
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

function SignaturePad({
  onChange,
}: {
  onChange: (dataUrl: string) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const drawing = useRef(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const ratio = Math.max(1, window.devicePixelRatio || 1)
    const w = canvas.clientWidth
    const h = 140
    canvas.width = Math.floor(w * ratio)
    canvas.height = Math.floor(h * ratio)
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = '#141414'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }, [])

  function pos(e: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!
    const r = canvas.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  function start(e: ReactPointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId)
    drawing.current = true
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const p = pos(e)
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
  }

  function move(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const p = pos(e)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
  }

  function end() {
    drawing.current = false
    const canvas = canvasRef.current
    if (!canvas) return
    onChange(canvas.toDataURL('image/png'))
  }

  function clear() {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.clientWidth, 140)
    onChange('')
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height: 140,
          border: `1px solid ${colors.border}`,
          borderRadius: 8,
          touchAction: 'none',
          background: '#fff',
          cursor: 'crosshair',
        }}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      />
      <button type="button" style={{ ...buttonSecondaryStyle, marginTop: 8 }} onClick={clear}>
        Clear signature
      </button>
    </div>
  )
}

/** Client e-sign page for NDAs / legal docs (/sign#token). No login. */
export default function LegalSignPage() {
  const { hash } = useLocation()
  const token = decodeURIComponent(hash.replace(/^#/, ''))
  const [view, setView] = useState<LegalSignView | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [agreed, setAgreed] = useState(false)
  const [signaturePng, setSignaturePng] = useState('')
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const r = await callLegalSign(token)
    if (r.ok) setView(r.data as unknown as LegalSignView)
    else setError(r.error)
    setLoading(false)
  }, [token])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    document.title = view ? view.title : 'Sign document'
  }, [view])

  async function openPdf() {
    setBusy(true)
    const r = await callLegalSign(token, { action: 'pdf' })
    setBusy(false)
    if (!r.ok) {
      setFormError(r.error)
      return
    }
    const pdf = String(r.data.pdf_base64 || '')
    const bytes = Uint8Array.from(atob(pdf), (c) => c.charCodeAt(0))
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
    window.open(url, '_blank', 'noopener')
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  async function sign() {
    const problem = signProblem({ name, date, agreed, signaturePng })
    setFormError(problem || '')
    if (problem) return
    setBusy(true)
    const r = await callLegalSign(token, {
      action: 'sign',
      name: name.trim(),
      date,
      agreed: true,
      signature_png: signaturePng,
    })
    setBusy(false)
    if (r.ok) setView(r.data as unknown as LegalSignView)
    else setFormError(r.error)
  }

  if (!view) {
    return (
      <div style={wrap}>
        <div style={column}>
          <BrandLogo height={32} />
          <section style={cardStyle}>
            <p style={{ margin: 0, color: error ? colors.text : colors.muted }}>
              {loading ? 'Loading your document…' : error}
            </p>
          </section>
        </div>
      </div>
    )
  }

  const label = legalDocLabel(view.doc_type)

  return (
    <div style={wrap}>
      <div style={column}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <BrandLogo height={32} />
          <span style={muted}>{label}</span>
        </header>

        <section style={cardStyle}>
          <h1 style={{ fontSize: 22, margin: '0 0 4px' }}>{view.title}</h1>
          <p style={{ ...muted, margin: '0 0 12px' }}>
            For {view.company}
            {view.party_name ? ` · Attn: ${view.party_name}` : ''}
          </p>
          {view.has_pdf ? (
            <button type="button" style={buttonSecondaryStyle} disabled={busy} onClick={() => void openPdf()}>
              Open the PDF
            </button>
          ) : null}
        </section>

        {view.status === 'signed' ? (
          <section style={{ ...cardStyle, borderLeft: `4px solid ${colors.success}` }}>
            <h2 style={{ fontSize: 18, margin: '0 0 6px' }}>Signed. Thank you.</h2>
            <p style={{ margin: 0, fontSize: 14 }}>
              Signed by {view.signed_name}
              {view.signed_at ? ` on ${format(parseISO(view.signed_at), 'd MMM yyyy, HH:mm')}` : ''}
              {view.company ? ` for ${view.company}` : ''}. {LEGAL_SIGN_DONE_BLURB}
            </p>
          </section>
        ) : (
          <section style={cardStyle}>
            <h2 style={{ fontSize: 18, margin: '0 0 6px' }}>Sign this {label}</h2>
            <p style={{ ...muted, margin: '0 0 12px' }}>{LEGAL_SIGN_ASSENT_BLURB}</p>
            <div style={{ display: 'grid', gap: 10 }}>
              <label style={labelStyle}>Signature</label>
              <SignaturePad onChange={setSignaturePng} />
              <label style={labelStyle} htmlFor="sign-name">
                Full name
              </label>
              <input
                id="sign-name"
                style={inputStyle}
                value={name}
                autoComplete="name"
                onChange={(e) => setName(e.target.value)}
              />
              <label style={labelStyle} htmlFor="sign-date">
                Date
              </label>
              <input id="sign-date" type="date" style={inputStyle} value={date} onChange={(e) => setDate(e.target.value)} />
              <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 14 }}>
                <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
                I have read this {label} and agree to sign it on behalf of {view.company || 'my company'}.
              </label>
              {formError ? <p style={{ color: colors.danger, fontSize: 13, margin: 0 }}>{formError}</p> : null}
              <button type="button" style={buttonPrimaryStyle} disabled={busy} onClick={() => void sign()}>
                {busy ? 'Saving…' : 'Sign and submit'}
              </button>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
