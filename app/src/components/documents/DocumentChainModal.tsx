import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ClipboardList, CreditCard, FileText, Loader2, Receipt, Truck } from 'lucide-react'
import Modal from '../Modal'
import StatusPill from '../StatusPill'
import { chainHref, summarizeChain, type ChainStart, type DocumentChain } from '../../lib/documentChain'
import { loadDocumentChain } from '../../lib/documentChainStore'
import { clientPoStatusLabel } from '../../lib/clientPurchaseOrders'
import { colors, formatMoney } from '../../lib/uiStyles'

const step: CSSProperties = { display: 'grid', gridTemplateColumns: '28px 1fr', gap: 10, alignItems: 'start' }
const icon: CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 14,
  display: 'grid',
  placeItems: 'center',
  border: `1px solid ${colors.border}`,
  color: colors.muted,
}
const row: CSSProperties = {
  display: 'flex',
  gap: 8,
  alignItems: 'center',
  flexWrap: 'wrap',
  fontSize: 13,
  padding: '4px 0',
  borderBottom: `1px solid ${colors.border}`,
}
const empty: CSSProperties = { fontSize: 13, color: colors.muted, padding: '4px 0' }
const meta: CSSProperties = { color: colors.muted, fontSize: 12 }
const linkStyle: CSSProperties = { color: colors.accentText, fontWeight: 600 }

function Step(props: { icon: ReactNode; title: string; children: ReactNode; emptyText: string; count: number }) {
  return (
    <div style={step}>
      <div style={icon} aria-hidden>
        {props.icon}
      </div>
      <div>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>
          {props.title}
          {props.count > 1 ? <span style={meta}> · {props.count}</span> : null}
        </div>
        {props.count ? props.children : <div style={empty}>{props.emptyText}</div>}
      </div>
    </div>
  )
}

function day(iso: string | null | undefined): string {
  return iso ? String(iso).slice(0, 10) : ''
}

/**
 * The whole chain around one document: quotation (with revisions), client
 * PO, delivery notes, invoices and payments, each opening its own page.
 */
export default function DocumentChainModal(props: { start: ChainStart | null; title?: string; onClose: () => void }) {
  const { start } = props
  const [chain, setChain] = useState<DocumentChain | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!start) return
    let alive = true
    setLoading(true)
    setChain(null)
    loadDocumentChain(start)
      .then((c) => alive && setChain(c))
      .catch(() => alive && setChain({ client: '', quotes: [], pos: [], dns: [], invoices: [], payments: [] }))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [start])

  const summary = chain ? summarizeChain(chain) : null
  const poNumber = (id: string | null | undefined) => chain?.pos.find((p) => p.id === id)?.po_number

  return (
    <Modal open={Boolean(start)} title={props.title || 'Document chain'} onClose={props.onClose} width={720}>
      {loading || !chain ? (
        <div style={{ ...empty, display: 'flex', gap: 6, alignItems: 'center' }}>
          <Loader2 size={14} className="spin" /> Following the links…
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 16 }}>
          {chain.client ? <div style={{ fontSize: 13, color: colors.muted }}>{chain.client}</div> : null}

          <Step icon={<FileText size={14} />} title="Quotation" count={chain.quotes.length} emptyText="No quotation found">
            {chain.quotes.map((q) => (
              <div key={q.id} style={row}>
                <Link to={chainHref('quote', q.id)} style={linkStyle}>
                  {q.reference_number || q.quote_id || 'Draft'}
                </Link>
                <StatusPill status={q.status} />
                <span style={meta}>
                  {day(q.date)}
                  {q.valid_until ? ` · valid until ${day(q.valid_until)}` : ''}
                </span>
                <span style={{ marginLeft: 'auto' }}>{formatMoney(Number(q.amount) || 0)}</span>
              </div>
            ))}
          </Step>

          <Step icon={<ClipboardList size={14} />} title="Client PO" count={chain.pos.length} emptyText="No client PO linked">
            {chain.pos.map((p) => (
              <div key={p.id} style={row}>
                {p.file_url ? (
                  <a href={p.file_url} target="_blank" rel="noreferrer" style={linkStyle}>
                    PO {p.po_number}
                  </a>
                ) : (
                  <Link to="/client-pos" style={linkStyle}>
                    PO {p.po_number}
                  </Link>
                )}
                <StatusPill status={clientPoStatusLabel(p.status || 'open')} />
                <span style={meta}>
                  {day(p.issued_on)}
                  {p.after_quote_expiry ? ' · came after the quote expired' : ''}
                </span>
                <span style={{ marginLeft: 'auto' }}>{formatMoney(Number(p.amount) || 0, p.currency || 'AED')}</span>
              </div>
            ))}
          </Step>

          <Step icon={<Truck size={14} />} title="Delivery notes" count={chain.dns.length} emptyText="Not delivered yet">
            {chain.dns.map((d) => (
              <div key={d.id} style={row}>
                <Link to={chainHref('dn', d.id)} style={linkStyle}>
                  {d.reference_number}
                </Link>
                <StatusPill status={d.status || 'Issued'} />
                <span style={meta}>
                  {day(d.date)}
                  {d.client_po_id ? ` · PO ${poNumber(d.client_po_id) || 'linked'}` : ''}
                  {d.invoice_ref ? ` · invoice ${d.invoice_ref}` : ''}
                </span>
              </div>
            ))}
          </Step>

          <Step icon={<Receipt size={14} />} title="Invoices" count={chain.invoices.length} emptyText="Not invoiced yet">
            {chain.invoices.map((i) => (
              <div key={i.id} style={row}>
                <Link to={chainHref('invoice', i.id)} style={linkStyle}>
                  {i.reference_number}
                </Link>
                <StatusPill status={i.status === 'Cancelled' ? 'Cancelled' : i.payment_status || i.status || 'Sent'} />
                <span style={meta}>{day(i.date)}</span>
                <span style={{ marginLeft: 'auto' }}>{formatMoney(Number(i.amount) || 0, i.currency || 'AED')}</span>
              </div>
            ))}
          </Step>

          <Step icon={<CreditCard size={14} />} title="Payments" count={chain.payments.length} emptyText="No payments recorded">
            {chain.payments.map((p) => (
              <div key={p.id} style={row}>
                <span>{day(p.created_at)}</span>
                <span style={meta}>
                  {p.invoice_ref}
                  {p.method ? ` · ${p.method}` : ''}
                </span>
                <span style={{ marginLeft: 'auto' }}>{formatMoney(Number(p.amount) || 0)}</span>
              </div>
            ))}
          </Step>

          {summary && chain.invoices.length ? (
            <div style={{ fontSize: 13, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <span>Invoiced {formatMoney(summary.invoiced)}</span>
              <span>Paid {formatMoney(summary.paid)}</span>
              <strong style={{ color: summary.balance > 0 ? colors.warn : undefined }}>Balance {formatMoney(summary.balance)}</strong>
            </div>
          ) : null}
          {summary?.gaps.length ? (
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: colors.muted }}>
              {summary.gaps.map((g) => (
                <li key={g}>{g}</li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </Modal>
  )
}
