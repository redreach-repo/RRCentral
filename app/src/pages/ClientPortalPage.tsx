import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import BrandLogo from '../components/BrandLogo'
import type { PortalUsage, PortalView } from '../lib/clientPortal'
import { loadPortal } from '../lib/clientPortalStore'
import { formatAED } from '../lib/money'
import { cardStyle, colors, sectionTitleStyle, selectStyle } from '../lib/uiStyles'

const wrap: CSSProperties = {
  minHeight: '100vh',
  background: colors.bg,
  color: colors.text,
  padding: '24px 16px 48px',
  boxSizing: 'border-box',
}
const column: CSSProperties = { maxWidth: 880, margin: '0 auto', display: 'grid', gap: 16 }
const muted: CSSProperties = { color: colors.muted, fontSize: 13 }
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

        <Section title={`Your requests (${view.openTickets.length} open)`}>
          {view.openTickets.length === 0 ? (
            <p style={{ ...muted, margin: 0 }}>Nothing open right now.</p>
          ) : (
            <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
              {view.openTickets.map((t, i) => (
                <li key={`${t.subject}-${i}`} style={rowStyle}>
                  <span style={{ minWidth: 0 }}>
                    <strong style={{ fontWeight: 600 }}>{t.subject}</strong>
                    <span style={{ display: 'block', ...muted }}>Opened {t.opened}</span>
                  </span>
                  <span style={{ textAlign: 'right', fontSize: 13 }}>
                    {t.status}
                    <span style={{ display: 'block', color: t.late ? colors.warn : colors.muted }}>{t.note}</span>
                  </span>
                </li>
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
          Amounts exclude 5% VAT. To raise a request, message us on WhatsApp or email support as usual.
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
