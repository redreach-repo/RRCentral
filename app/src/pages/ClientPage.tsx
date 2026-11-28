import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { CLIENT_SECTIONS, filterClientRows, type Client360, type ClientFilter, type ClientSectionKey } from '../lib/client360'
import { loadClient360 } from '../lib/client360Store'
import { formatMoneyAmount } from '../lib/currency'
import { errorMessage } from '../lib/errors'
import { roleAtLeast } from '../lib/permissions'
import { buttonSecondaryStyle, inputStyle } from '../lib/uiStyles'
import styles from './ClientPage.module.css'

const smallBtn = { ...buttonSecondaryStyle, padding: '6px 10px', fontSize: 13 }
const money = (n: number, c: string) => formatMoneyAmount(n, c)

/**
 * One client, everything about it (HighMast brief fix 3): header with the
 * money totals, then Inquiries, Quotations, POs, Invoices, Payments, Delivery
 * notes, Contacts, Documents, Tickets and one Timeline, newest first. What a
 * person sees follows their access: staff see no money, locked Sales see only
 * their own clients and no margin unless switched on.
 */
export default function ClientPage() {
  const { id = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const { userRole, salesLocked, hasPermission } = useAuth()
  const { showToast } = useToast()
  const [view, setView] = useState<Client360 | null | undefined>(undefined)
  const [linksMissing, setLinksMissing] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [filter, setFilter] = useState<ClientFilter>({})

  const moneyVisible = userRole === 'viewer' || roleAtLeast(userRole, 'sales')
  const marginVisible = moneyVisible && userRole !== 'viewer' && (!salesLocked || hasPermission('quotes.margin'))

  const load = useCallback(async () => {
    try {
      const r = await loadClient360(id, { moneyVisible, marginVisible })
      setView(r.view)
      setLinksMissing(r.linksMissing)
    } catch (e) {
      showToast(errorMessage(e, 'Could not load this client'), 'error')
      setView(null)
    }
  }, [id, moneyVisible, marginVisible, showToast])

  useEffect(() => {
    setView(undefined)
    void load()
  }, [load])

  useEffect(() => {
    if (!printing) return
    const t = window.setTimeout(() => {
      window.print()
      setPrinting(false)
    }, 50)
    return () => window.clearTimeout(t)
  }, [printing])

  const sections = useMemo(
    () => CLIENT_SECTIONS.filter((sec) => view && (view.money_visible || !['quotes', 'invoices', 'payments'].includes(sec.key))),
    [view],
  )
  const tabParam = params.get('tab') as ClientSectionKey | null
  const tab: ClientSectionKey = sections.some((x) => x.key === tabParam) ? (tabParam as ClientSectionKey) : sections[0]?.key ?? 'inquiries'

  if (view === undefined) return <div className={styles.page}><p className={styles.empty}>Loading client…</p></div>
  if (view === null) {
    return (
      <div className={styles.page}>
        <h1 className={styles.name}>Client not found</h1>
        <p className={styles.empty}>
          This client does not exist or is not one you can open. <Link to="/clients">Back to client records</Link>
        </p>
      </div>
    )
  }

  const h = view.header
  const setTab = (k: ClientSectionKey) => {
    const next = new URLSearchParams(params)
    next.set('tab', k)
    setParams(next, { replace: true })
  }
  const shown = printing ? sections.map((x) => x.key) : [tab]

  return (
    <div className={styles.page}>
      {h.merged_into ? (
        <div className={styles.notice}>
          This record was merged. <Link to={`/clients/${h.merged_into}`}>Open the client it was merged into</Link>.
        </div>
      ) : null}
      {linksMissing ? (
        <div className={styles.notice}>
          Documents are not linked to clients yet. Run client-links.sql in Supabase, then refresh. Until then some lists here are empty.
        </div>
      ) : null}

      <header className={styles.head}>
        <p className={styles.kicker}>
          Client record{h.account_reference ? ` · ${h.account_reference}` : ''} · {h.status}
        </p>
        <h1 className={styles.name}>{h.legal_name || 'No name'}</h1>
        <div className={styles.facts}>
          {h.short_name && h.short_name !== h.legal_name ? (
            <span>
              Short name <strong>{h.short_name}</strong>
            </span>
          ) : null}
          <span>
            TRN <strong>{h.trn || 'not set'}</strong>
          </span>
          {h.address ? <span>{h.address}</span> : null}
          {h.owner ? (
            <span>
              Owner <strong>{h.owner}</strong>
            </span>
          ) : null}
          {view.money_visible ? (
            <span>
              Credit limit <strong>{h.credit_limit == null ? 'none' : money(h.credit_limit, 'AED')}</strong>
            </span>
          ) : null}
          {h.credit_hold ? <span className={styles.hold}>On credit hold</span> : null}
          {h.account_id ? <Link to={`/accounts/${h.account_id}`}>Account page</Link> : null}
        </div>
      </header>

      {view.money_visible ? <Totals view={view} /> : null}

      <div className={`${styles.filters} ${styles.noPrint}`}>
        <label>
          From
          <input type="date" style={inputStyle} value={filter.from ?? ''} onChange={(e) => setFilter({ ...filter, from: e.target.value || undefined })} />
        </label>
        <label>
          To
          <input type="date" style={inputStyle} value={filter.to ?? ''} onChange={(e) => setFilter({ ...filter, to: e.target.value || undefined })} />
        </label>
        <label>
          Status
          <input style={inputStyle} placeholder="e.g. Sent" value={filter.status ?? ''} onChange={(e) => setFilter({ ...filter, status: e.target.value || undefined })} />
        </label>
        <label>
          Division
          <select style={inputStyle} value={filter.division ?? ''} onChange={(e) => setFilter({ ...filter, division: e.target.value || undefined })}>
            <option value="">All</option>
            {['01', '02', '03', '04', '05', '06', '07', '08', '09'].map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
        {filter.from || filter.to || filter.status || filter.division ? (
          <button type="button" style={smallBtn} onClick={() => setFilter({})}>
            Clear
          </button>
        ) : null}
        <span style={{ flex: 1 }} />
        <button type="button" style={smallBtn} onClick={() => setPrinting(true)}>
          Export history (PDF)
        </button>
      </div>

      <nav className={styles.tabs} role="tablist" aria-label="Client sections">
        {sections.map((sec) => (
          <button
            key={sec.key}
            type="button"
            role="tab"
            aria-selected={tab === sec.key}
            className={`${styles.tab} ${tab === sec.key ? styles.tabActive : ''}`}
            onClick={() => setTab(sec.key)}
          >
            {sec.label} ({view.counts[sec.key]})
          </button>
        ))}
      </nav>

      {shown.map((k) => (
        <section key={k} aria-label={CLIENT_SECTIONS.find((x) => x.key === k)?.label}>
          {printing ? <h2 style={{ fontSize: 16 }}>{CLIENT_SECTIONS.find((x) => x.key === k)?.label}</h2> : null}
          <Section k={k} view={view} filter={filter} />
        </section>
      ))}
    </div>
  )
}

function Totals({ view }: { view: Client360 }) {
  const list = view.totals.length ? view.totals : [{ currency: 'AED', quoted: 0, awarded: 0, invoiced: 0, paid: 0, balance: 0, overdue: 0 }]
  return (
    <>
      {list.map((t) => (
        <div key={t.currency} className={styles.totals} aria-label={`Totals in ${t.currency}`}>
          <Tile label="Total quoted" value={money(t.quoted, t.currency)} />
          <Tile label="Total awarded" value={money(t.awarded, t.currency)} />
          <Tile label="Total invoiced" value={money(t.invoiced, t.currency)} />
          <Tile label="Balance due" value={money(t.balance, t.currency)} />
          <Tile label="Overdue" value={money(t.overdue, t.currency)} overdue={t.overdue > 0} />
        </div>
      ))}
    </>
  )
}

function Tile({ label, value, overdue }: { label: string; value: string; overdue?: boolean }) {
  return (
    <div className={`${styles.tile} ${overdue ? styles.tileOverdue : ''}`}>
      <div className={styles.tileLabel}>{label}</div>
      <div className={styles.tileValue}>{value}</div>
    </div>
  )
}

function Table({ head, children, empty }: { head: ReactNode; children: ReactNode[]; empty: string }) {
  if (!children.length) return <p className={styles.empty}>{empty}</p>
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>{head}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

const ref = (to: string, text: string) => <Link to={to}>{text}</Link>
const q = encodeURIComponent

function Section({ k, view, filter }: { k: ClientSectionKey; view: Client360; filter: ClientFilter }) {
  switch (k) {
    case 'inquiries':
      return (
        <Table
          empty="No deals or website enquiries for this client."
          head={
            <>
              <th>Date</th>
              <th>Pipeline</th>
              <th>What</th>
              <th>Stage</th>
              <th>Owner</th>
            </>
          }
        >
          {filterClientRows(view.inquiries.map((r) => ({ ...r, status: r.stage })), filter).map((r) => (
            <tr key={`${r.pipeline}-${r.id}`}>
              <td>{r.date ?? ''}</td>
              <td>{r.kind === 'enquiry' ? 'Website enquiry' : r.pipeline}</td>
              <td>{r.pipeline === 'Company' ? ref('/crm', r.title || 'Deal') : r.title}</td>
              <td>{r.stage}</td>
              <td>{r.owner}</td>
            </tr>
          ))}
        </Table>
      )
    case 'quotes':
      return (
        <Table
          empty="No quotations for this client."
          head={
            <>
              <th>Quote</th>
              <th>Date</th>
              <th>Status</th>
              <th>Valid until</th>
              <th className={styles.num}>Amount</th>
              {view.margin_visible ? <th className={styles.num}>Margin</th> : null}
            </>
          }
        >
          {filterClientRows(view.quotes, filter).map((g) => (
            <Fragment key={g.base_reference}>
              {g.revisions.map((r, i) => (
                <tr key={r.id}>
                  <td>
                    {i === 0 ? null : <span className={styles.sub}>↳ </span>}
                    {ref(`/quotations?ref=${q(r.reference)}`, r.reference)}
                    {r.id === g.current.id && g.revisions.length > 1 ? <span className={styles.sub}> current</span> : null}
                  </td>
                  <td>{r.date ?? ''}</td>
                  <td>{r.status}</td>
                  <td>{r.valid_until ?? ''}</td>
                  <td className={styles.num}>{money(r.amount, r.currency)}</td>
                  {view.margin_visible ? (
                    <td className={styles.num}>{r.margin == null ? '—' : `${money(r.margin, 'AED')}${r.margin_pct == null ? '' : ` (${r.margin_pct}%)`}`}</td>
                  ) : null}
                </tr>
              ))}
            </Fragment>
          ))}
        </Table>
      )
    case 'pos':
      return (
        <Table
          empty="No purchase orders for this client."
          head={
            <>
              <th>PO</th>
              <th>Date</th>
              <th>Status</th>
              <th>Quote</th>
              {view.money_visible ? <th className={styles.num}>Amount</th> : null}
            </>
          }
        >
          {filterClientRows(view.pos, filter).map((p) => (
            <tr key={p.id}>
              <td>{ref(`/client-pos?ref=${q(p.po_number)}`, p.po_number)}</td>
              <td>{p.date ?? ''}</td>
              <td>{p.status}</td>
              <td>{p.quote_reference ? ref(`/quotations?ref=${q(p.quote_reference)}`, p.quote_reference) : '—'}</td>
              {view.money_visible ? <td className={styles.num}>{money(p.amount, p.currency)}</td> : null}
            </tr>
          ))}
        </Table>
      )
    case 'invoices':
      return (
        <Table
          empty="No invoices for this client."
          head={
            <>
              <th>Invoice</th>
              <th>Date</th>
              <th>Status</th>
              <th className={styles.num}>Amount</th>
              <th className={styles.num}>Balance</th>
              <th className={styles.num}>Days overdue</th>
            </>
          }
        >
          {filterClientRows(view.invoices, filter).map((i) => (
            <tr key={i.id}>
              <td>
                {ref(`/invoices?ref=${q(i.reference)}`, i.reference)}
                {i.credit_note ? <span className={styles.sub}> credit note</span> : null}
              </td>
              <td>{i.date ?? ''}</td>
              <td>
                {i.status}
                {i.payment_status ? <span className={styles.sub}> · {i.payment_status}</span> : null}
              </td>
              <td className={styles.num}>{money(i.amount, i.currency)}</td>
              <td className={styles.num}>{money(i.balance, i.currency)}</td>
              <td className={`${styles.num} ${i.days_overdue > 0 ? styles.overdue : ''}`}>{i.days_overdue > 0 ? i.days_overdue : ''}</td>
            </tr>
          ))}
        </Table>
      )
    case 'payments':
      return (
        <Table
          empty="No payments recorded for this client."
          head={
            <>
              <th>Date</th>
              <th>For</th>
              <th>Method</th>
              <th className={styles.num}>Amount</th>
            </>
          }
        >
          {filterClientRows(view.payments, filter).map((p) => (
            <tr key={p.id}>
              <td>{p.date ?? ''}</td>
              <td>{p.invoice_ref ? ref(`/invoices?ref=${q(p.invoice_ref)}`, p.invoice_ref) : '—'}</td>
              <td>{p.method}</td>
              <td className={styles.num}>{money(p.amount, p.currency)}</td>
            </tr>
          ))}
        </Table>
      )
    case 'delivery_notes':
      return (
        <Table
          empty="No delivery notes for this client."
          head={
            <>
              <th>Delivery note</th>
              <th>Date</th>
              <th>Status</th>
              <th>Quote</th>
              <th>Invoice</th>
            </>
          }
        >
          {filterClientRows(view.delivery_notes, filter).map((d) => (
            <tr key={d.id}>
              <td>{ref(`/delivery-notes?ref=${q(d.reference)}`, d.reference)}</td>
              <td>{d.date ?? ''}</td>
              <td>{d.status}</td>
              <td>{d.quote_ref || '—'}</td>
              <td>{d.invoice_ref || '—'}</td>
            </tr>
          ))}
        </Table>
      )
    case 'contacts':
      return (
        <Table
          empty="No contacts saved for this client."
          head={
            <>
              <th>Name</th>
              <th>Role</th>
              <th>Email</th>
              <th>Phone</th>
            </>
          }
        >
          {view.contacts.map((c, i) => (
            <tr key={`${c.email}-${c.phone}-${i}`}>
              <td>{c.name || '—'}</td>
              <td>{c.role}</td>
              <td>{c.email ? <a href={`mailto:${c.email}`}>{c.email}</a> : ''}</td>
              <td>{c.phone}</td>
            </tr>
          ))}
        </Table>
      )
    case 'documents':
      return (
        <Table
          empty="No documents or attachments for this client."
          head={
            <>
              <th>Date</th>
              <th>Document</th>
              <th>Kind</th>
            </>
          }
        >
          {filterClientRows(view.documents, filter).map((d) => (
            <tr key={d.id}>
              <td>{d.date ?? ''}</td>
              <td>
                {d.url ? (
                  <a href={d.url} target="_blank" rel="noreferrer">
                    {d.title}
                  </a>
                ) : (
                  d.title
                )}
              </td>
              <td>{d.category || d.source}</td>
            </tr>
          ))}
        </Table>
      )
    case 'tickets':
      return (
        <Table
          empty="No support tickets for this client."
          head={
            <>
              <th>Date</th>
              <th>Subject</th>
              <th>Status</th>
              <th>Priority</th>
            </>
          }
        >
          {filterClientRows(view.tickets, filter).map((t) => (
            <tr key={t.id}>
              <td>{t.date ?? ''}</td>
              <td>{ref(`/support/${t.id}`, t.subject)}</td>
              <td>{t.status}</td>
              <td>{t.priority}</td>
            </tr>
          ))}
        </Table>
      )
    case 'timeline':
      return (
        <Table
          empty="Nothing has happened with this client yet."
          head={
            <>
              <th>When</th>
              <th>What</th>
              <th>Details</th>
              <th>By</th>
            </>
          }
        >
          {filterClientRows(view.timeline, filter).map((x, i) => (
            <tr key={`${x.at}-${i}`}>
              <td style={{ whiteSpace: 'nowrap' }}>{x.at.slice(0, 16).replace('T', ' ')}</td>
              <td>{x.kind}</td>
              <td>
                {x.ref ? <span className={styles.sub}>{x.ref} · </span> : null}
                {x.text}
              </td>
              <td>{x.by}</td>
            </tr>
          ))}
        </Table>
      )
  }
}
