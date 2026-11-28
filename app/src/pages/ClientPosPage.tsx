import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import DocumentChainModal from '../components/documents/DocumentChainModal'
import type { ChainStart } from '../lib/documentChain'
import { format } from 'date-fns'
import { ClipboardList, FileText, Plus } from 'lucide-react'
import { useToast } from '../contexts/ToastContext'
import { useAuth } from '../contexts/AuthContext'
import { poQuoteSummary } from '../lib/clientPoQuoteLink'
import EmptyState from '../components/EmptyState'
import ClientPoEditor, { type ClientPoClientOpt } from '../components/documents/ClientPoEditor'
import StatusPill from '../components/StatusPill'
import { db } from '../lib/db'
import { errorMessage } from '../lib/errors'
import { formatPoMoney } from '../lib/clientPoReader'
import { poLineBalances, type PoDrawdown } from '../lib/clientPoBalance'
import { loadPoDrawdowns } from '../lib/clientPoDrawdownStore'
import { CLIENT_PO_SETUP_OFF, getClientPoSetup, type ClientPoSetup } from '../lib/clientPoFile'
import {
  CLIENT_PO_DEPARTMENTS,
  clientPoDepartmentLabel,
  clientPoInvoicePool,
  clientPoIsOpen,
  clientPoPartyName,
  clientPoRemaining,
  clientPoStatusAfterMatch,
  clientPoStatusAfterReceipt,
  clientPoStatusLabel,
  filterClientPos,
  suggestClientPoInvoiceMatch,
} from '../lib/clientPurchaseOrders'
import {
  linkClientPoInvoice,
  listClientPurchaseOrdersWithDetails,
  recordClientPoReceipt,
  setClientPoStatus,
  type ClientPurchaseOrder,
} from '../lib/opsSliceStores'
import { exportListCsv } from '../lib/listIo'
import { advancesByPo } from '../lib/supplierAdvances'
import { loadSupplierAdvancesQuiet } from '../lib/supplierAdvanceStore'
import { formatAED } from '../lib/money'
import { buttonSecondaryStyle, colors } from '../lib/uiStyles'
import docsStyles from '../styles/docsList.module.css'

type InvoiceOpt = {
  id: string
  reference_number: string
  amount: number
  status: string
  account_id?: string | null
  client?: string
}

const STATUS_TABS = ['All', 'Open', 'Fulfilled', 'Canceled'] as const

const smallBtn = { ...buttonSecondaryStyle, padding: '4px 10px', fontSize: 12 }

/** M9a: customer purchase orders for every vertical, laid out like Invoices and Quotations. */
/** "3 lines · 50 of 90 left" from the PO lines and what invoices took. */
function poLeftSummary(r: ClientPurchaseOrder, drawdowns: PoDrawdown[]): string {
  const lines = r.line_items || []
  const count = `${lines.length} ${lines.length === 1 ? 'line' : 'lines'}`
  const b = poLineBalances(lines, drawdowns.filter((d) => d.po_id === r.id))
  const requested = b.reduce((s, x) => s + x.requested, 0)
  if (!requested) return count
  const left = b.reduce((s, x) => s + Math.max(0, x.balance), 0)
  return `${count} · ${left} of ${requested} left`
}

export default function ClientPosPage() {
  const { showToast } = useToast()
  const { user } = useAuth()
  const [rows, setRows] = useState<ClientPurchaseOrder[]>([])
  const [clients, setClients] = useState<ClientPoClientOpt[]>([])
  const [invoices, setInvoices] = useState<InvoiceOpt[]>([])
  const [loading, setLoading] = useState(true)

  const [department, setDepartment] = useState('')
  const [statusTab, setStatusTab] = useState<(typeof STATUS_TABS)[number]>('All')
  const [search, setSearch] = useState('')
  // Opened from Home ("Made by Sales"): search for that PO number.
  const [searchParams] = useSearchParams()
  const refParam = searchParams.get('ref') || ''
  useEffect(() => {
    if (refParam) setSearch(refParam)
  }, [refParam])

  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<ClientPurchaseOrder | null>(null)
  const [detailsReady, setDetailsReady] = useState(false)
  const [quoteLinkReady, setQuoteLinkReady] = useState(true)
  const [setup, setSetup] = useState<ClientPoSetup>(CLIENT_PO_SETUP_OFF)
  const [drawdowns, setDrawdowns] = useState<PoDrawdown[]>([])
  const [chainStart, setChainStart] = useState<ChainStart | null>(null)
  const [chainTitle, setChainTitle] = useState('')
  /** Supplier advances paid per PO (paid and still open), when that SQL is on the database. */
  const [advanceTotals, setAdvanceTotals] = useState<Map<string, { paid: number; open: number }>>(new Map())

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [pos, cl, inv] = await Promise.all([
        listClientPurchaseOrdersWithDetails(),
        // Company wide client list, the same one Quotations and Invoices use (every vertical).
        db.from('clients').select('id, company_name, account_id, trn').order('company_name'),
        db
          .from('invoices')
          .select('id, reference_number, amount, status, account_id, client')
          .order('created_at', { ascending: false })
          .limit(300),
      ])
      setRows(pos.rows)
      setDetailsReady(pos.detailsReady)
      setQuoteLinkReady(pos.quoteLinkReady)
      // What invoices have taken from each PO's lines (best effort: needs client-po-drawdowns.sql).
      const withLines = pos.rows.filter((r) => r.line_items?.length).map((r) => r.id)
      if (withLines.length) {
        loadPoDrawdowns(withLines)
          .then((d) => setDrawdowns(d.rows))
          .catch(() => setDrawdowns([]))
      }
      loadSupplierAdvancesQuiet()
        .then((a) => setAdvanceTotals(advancesByPo(a.advances, a.applications)))
        .catch(() => setAdvanceTotals(new Map()))
      setClients((cl.data || []) as ClientPoClientOpt[])
      setInvoices((inv.data || []) as InvoiceOpt[])
    } catch (e) {
      showToast(errorMessage(e, 'Could not load client POs'), 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    void load()
  }, [load])

  // What is set up for upload (AI reading, Google Drive), so the form can say what is missing.
  useEffect(() => {
    void getClientPoSetup().then(setSetup)
  }, [])

  const poLeftLabel = (r: ClientPurchaseOrder) => poLeftSummary(r, drawdowns)

  const filtered = useMemo(
    () => filterClientPos(rows, { department, status: statusTab, search }),
    [rows, department, statusTab, search],
  )

  function openCreate() {
    setEditing(null)
    setEditorOpen(true)
  }

  function openEdit(r: ClientPurchaseOrder) {
    setEditing(r)
    setEditorOpen(true)
  }

  async function matchInvoice(r: ClientPurchaseOrder) {
    const pool = clientPoInvoicePool({ account_id: r.account_id, partyName: clientPoPartyName(r) }, invoices)
    const match = suggestClientPoInvoiceMatch({ amount: Number(r.amount) }, pool)
    if (!match) {
      showToast('No close invoice amount match', 'info')
      return
    }
    try {
      const status = clientPoStatusAfterMatch(Number(r.amount), match.amount)
      await linkClientPoInvoice(r.id, match.invoiceId, status)
      showToast(`Linked ${match.reference} (${match.reason}) → ${status}`, 'success')
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Match failed'), 'error')
    }
  }

  function recordReceipt(r: ClientPurchaseOrder) {
    const add = window.prompt('Received amount to add (AED)', '0')
    if (add == null) return
    const next = Number(r.received_amount || 0) + (Number(add) || 0)
    const status = clientPoStatusAfterReceipt(Number(r.amount), next)
    void recordClientPoReceipt(r.id, next, status)
      .then(() => {
        showToast(`Receipt recorded → ${status}`, 'success')
        return load()
      })
      .catch((err) => showToast(errorMessage(err, 'Receipt failed'), 'error'))
  }

  function markFulfilled(r: ClientPurchaseOrder) {
    void setClientPoStatus(r.id, 'fulfilled')
      .then(() => {
        showToast('Marked fulfilled', 'success')
        return load()
      })
      .catch((err) => showToast(errorMessage(err, 'Update failed'), 'error'))
  }

  return (
    <div className={docsStyles.page}>
      <header className={docsStyles.hero}>
        <div>
          <p className={docsStyles.kicker}>Documents · all verticals</p>
          <h1 className={docsStyles.title}>Client POs</h1>
          <p className={docsStyles.subtitle}>
            Purchase orders received from clients in every vertical. Upload the PO and it is read for you and
            kept in the client's Google Drive folder. Match them to invoices and track what has been received.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className={docsStyles.newBtn}
            style={{ background: 'transparent', color: 'inherit', border: '1px solid var(--border)' }}
            disabled={!filtered.length}
            onClick={() => {
              exportListCsv(
                'client-pos.csv',
                ['po_number', 'client', 'vertical', 'issued_on', 'quote_reference', 'after_quote_expiry', 'amount', 'received', 'currency', 'status', 'invoice_id', 'vat_amount', 'payment_terms', 'delivery_date', 'lines', 'file_url'],
                filtered.map((r) => ({
                  po_number: r.po_number,
                  client: clientPoPartyName(r),
                  vertical: clientPoDepartmentLabel(r.division_code),
                  issued_on: r.issued_on || '',
                  quote_reference: r.quote_reference || '',
                  after_quote_expiry: r.after_quote_expiry ? 'yes' : '',
                  amount: r.amount,
                  received: r.received_amount || 0,
                  currency: r.currency,
                  status: r.status,
                  invoice_id: r.invoice_id || '',
                  vat_amount: r.vat_amount ?? '',
                  payment_terms: r.payment_terms || '',
                  delivery_date: r.delivery_date || '',
                  lines: r.line_items?.length || 0,
                  file_url: r.file_url || '',
                })),
              )
              showToast('Client PO CSV downloaded', 'success')
            }}
          >
            Export CSV
          </button>
          <button type="button" className={docsStyles.newBtn} onClick={openCreate}>
            <Plus size={16} /> New client PO
          </button>
        </div>
      </header>

      <div className={docsStyles.controls}>
        <div className={docsStyles.tabs} role="tablist" aria-label="Vertical">
          {[{ code: '', label: 'All verticals' }, ...CLIENT_PO_DEPARTMENTS, { code: 'none', label: 'Untagged' }].map(
            (d) => (
              <button
                key={d.code || 'all'}
                type="button"
                role="tab"
                aria-selected={department === d.code}
                className={department === d.code ? docsStyles.tabActive : docsStyles.tab}
                onClick={() => setDepartment(d.code)}
              >
                {d.label}
              </button>
            ),
          )}
        </div>
        <div className={docsStyles.tabs} role="tablist" aria-label="PO status">
          {STATUS_TABS.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={statusTab === t}
              className={statusTab === t ? docsStyles.tabActive : docsStyles.tab}
              onClick={() => setStatusTab(t)}
            >
              {t}
            </button>
          ))}
        </div>
        <input
          className={docsStyles.search}
          placeholder="Search client / PO / quote number…"
          aria-label="Search client POs"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className={docsStyles.loading}>Loading client POs…</div>
      ) : filtered.length === 0 ? (
        <div className={docsStyles.empty}>
          <EmptyState
            icon={<ClipboardList size={22} />}
            title="No client POs"
            subtitle={rows.length ? 'Nothing matches these filters.' : 'Add the first PO a client sent you.'}
            actionLabel="New client PO"
            onAction={openCreate}
          />
        </div>
      ) : (
        <div className={docsStyles.tableShell}>
          <div className={docsStyles.tableWrap}>
            <table className={docsStyles.table}>
              <thead>
                <tr>
                  <th className={docsStyles.colRef}>PO number</th>
                  <th className={docsStyles.colClient}>Client</th>
                  <th className={docsStyles.colDivision}>Vertical</th>
                  <th className={docsStyles.colDate}>Date</th>
                  <th className={docsStyles.colAmount}>Amount</th>
                  <th className={docsStyles.colAmount}>Received</th>
                  <th className={docsStyles.colStatus}>Status</th>
                  <th className={docsStyles.colActions} style={{ textAlign: 'right' }}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const open = clientPoIsOpen(r.status)
                  const suggestion =
                    open && !r.invoice_id
                      ? suggestClientPoInvoiceMatch(
                          { amount: Number(r.amount) },
                          clientPoInvoicePool({ account_id: r.account_id, partyName: clientPoPartyName(r) }, invoices),
                        )
                      : null
                  const linked = r.invoice_id ? invoices.find((i) => i.id === r.invoice_id) : null
                  return (
                    <tr key={r.id}>
                      <td className={docsStyles.colRef}>
                        <div className={docsStyles.ref}>{r.po_number}</div>
                        {r.file_url ? (
                          <a
                            href={r.file_url}
                            target="_blank"
                            rel="noreferrer"
                            className={docsStyles.meta}
                            style={{ color: colors.accentText, display: 'inline-flex', gap: 4, alignItems: 'center' }}
                          >
                            <FileText size={12} /> PO file
                          </a>
                        ) : null}
                        {poQuoteSummary(r) ? (
                          <div className={docsStyles.meta} style={r.after_quote_expiry ? { color: colors.warn } : undefined}>
                            {poQuoteSummary(r)}
                          </div>
                        ) : null}
                        {r.line_items?.length ? (
                          <div className={docsStyles.meta}>
                            {poLeftLabel(r)}
                          </div>
                        ) : null}
                        {r.invoice_id ? (
                          <div className={docsStyles.meta}>Invoice {linked?.reference_number || 'linked'}</div>
                        ) : suggestion ? (
                          <div className={docsStyles.meta}>
                            Suggest {suggestion.reference} · {suggestion.reason}
                          </div>
                        ) : null}
                      </td>
                      <td className={`${docsStyles.colClient} ${docsStyles.clientCell}`}>
                        {clientPoPartyName(r)}
                        {r.notes ? <div className={docsStyles.meta}>{r.notes}</div> : null}
                      </td>
                      <td className={docsStyles.colDivision}>{clientPoDepartmentLabel(r.division_code) || '—'}</td>
                      <td className={docsStyles.colDate}>
                        {r.issued_on ? format(new Date(r.issued_on), 'dd MMM yyyy') : '—'}
                      </td>
                      <td className={`${docsStyles.colAmount} ${docsStyles.amount}`}>
                        {formatPoMoney(Number(r.amount), r.currency)}
                        {advanceTotals.get(r.id) ? (
                          <div className={docsStyles.meta} style={{ fontWeight: 400 }}>
                            Supplier advances {formatAED(advanceTotals.get(r.id)!.paid)}
                            {advanceTotals.get(r.id)!.open > 0 ? ` (${formatAED(advanceTotals.get(r.id)!.open)} open)` : ''}
                          </div>
                        ) : null}
                      </td>
                      <td className={docsStyles.colAmount}>
                        {formatPoMoney(Number(r.received_amount || 0), r.currency)}
                        {open ? (
                          <div className={docsStyles.meta}>
                            {formatPoMoney(clientPoRemaining(Number(r.amount), Number(r.received_amount || 0)), r.currency)} left
                          </div>
                        ) : null}
                      </td>
                      <td className={docsStyles.colStatus}>
                        <StatusPill status={clientPoStatusLabel(r.status)} />
                      </td>
                      <td className={`${docsStyles.colActions} ${docsStyles.actionsCell}`}>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                          <button
                            type="button"
                            style={smallBtn}
                            onClick={() => {
                              setChainTitle(`Document chain · PO ${r.po_number}`)
                              setChainStart({ kind: 'po', id: r.id })
                            }}
                          >
                            Chain
                          </button>
                          <button type="button" style={smallBtn} onClick={() => openEdit(r)}>
                            {r.file_url || !detailsReady ? 'Details' : 'Details / add file'}
                          </button>
                          {open && !r.invoice_id ? (
                            <button type="button" style={smallBtn} onClick={() => void matchInvoice(r)}>
                              Match invoice
                            </button>
                          ) : null}
                          {open ? (
                            <button type="button" style={smallBtn} onClick={() => recordReceipt(r)}>
                              Record receipt
                            </button>
                          ) : null}
                          {open ? (
                            <button type="button" style={smallBtn} onClick={() => markFulfilled(r)}>
                              Mark fulfilled
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ClientPoEditor
        open={editorOpen}
        editing={editing}
        defaultDivision={department && department !== 'none' ? department : ''}
        clients={clients}
        setup={setup}
        detailsReady={detailsReady}
        quoteLinkReady={quoteLinkReady}
        who={user?.email || ''}
        onClose={() => setEditorOpen(false)}
        onSaved={() => {
          setEditorOpen(false)
          void load()
        }}
      />
      <DocumentChainModal start={chainStart} title={chainTitle} onClose={() => setChainStart(null)} />
    </div>
  )
}
