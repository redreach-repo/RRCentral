import { useCallback, useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { ClipboardList, Plus } from 'lucide-react'
import { useToast } from '../contexts/ToastContext'
import EmptyState from '../components/EmptyState'
import Modal from '../components/Modal'
import StatusPill from '../components/StatusPill'
import { db } from '../lib/db'
import { errorMessage } from '../lib/errors'
import { formatAED } from '../lib/money'
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
  createClientPurchaseOrder,
  linkClientPoInvoice,
  listClientPurchaseOrders,
  recordClientPoReceipt,
  setClientPoStatus,
  type ClientPurchaseOrder,
} from '../lib/opsSliceStores'
import { exportListCsv } from '../lib/listIo'
import { buttonPrimaryStyle, buttonSecondaryStyle, inputStyle, labelStyle, selectStyle } from '../lib/uiStyles'
import docsStyles from '../styles/docsList.module.css'

type ClientOpt = { id: string; company_name: string; account_id?: string | null }
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
export default function ClientPosPage() {
  const { showToast } = useToast()
  const [rows, setRows] = useState<ClientPurchaseOrder[]>([])
  const [clients, setClients] = useState<ClientOpt[]>([])
  const [invoices, setInvoices] = useState<InvoiceOpt[]>([])
  const [loading, setLoading] = useState(true)

  const [department, setDepartment] = useState('')
  const [statusTab, setStatusTab] = useState<(typeof STATUS_TABS)[number]>('All')
  const [search, setSearch] = useState('')

  const [editorOpen, setEditorOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [clientId, setClientId] = useState('')
  const [divisionCode, setDivisionCode] = useState('')
  const [poNumber, setPoNumber] = useState('')
  const [amount, setAmount] = useState('')
  const [issuedOn, setIssuedOn] = useState('')
  const [notes, setNotes] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [pos, cl, inv] = await Promise.all([
        listClientPurchaseOrders(),
        // Company wide client list, the same one Quotations and Invoices use (every vertical).
        db.from('clients').select('id, company_name, account_id').order('company_name'),
        db
          .from('invoices')
          .select('id, reference_number, amount, status, account_id, client')
          .order('created_at', { ascending: false })
          .limit(300),
      ])
      setRows(pos)
      setClients((cl.data || []) as ClientOpt[])
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

  const filtered = useMemo(
    () => filterClientPos(rows, { department, status: statusTab, search }),
    [rows, department, statusTab, search],
  )

  function openCreate() {
    setClientId('')
    setDivisionCode(department && department !== 'none' ? department : '')
    setPoNumber('')
    setAmount('')
    setIssuedOn(new Date().toISOString().slice(0, 10))
    setNotes('')
    setEditorOpen(true)
  }

  async function save() {
    const client = clients.find((c) => c.id === clientId)
    if (!client) {
      showToast('Pick a client', 'error')
      return
    }
    if (!poNumber.trim()) {
      showToast('Enter the PO number', 'error')
      return
    }
    setSaving(true)
    try {
      await createClientPurchaseOrder({
        clientId: client.id,
        accountId: client.account_id ?? null,
        divisionCode: divisionCode || null,
        poNumber,
        amount: Number(amount) || 0,
        currency: 'AED',
        issuedOn,
        notes,
      })
      showToast('Client PO saved', 'success')
      setEditorOpen(false)
      await load()
    } catch (err) {
      showToast(errorMessage(err, 'Save failed'), 'error')
    } finally {
      setSaving(false)
    }
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
            Purchase orders received from clients in every vertical. Match them to invoices and track what has
            been received.
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
                ['po_number', 'client', 'vertical', 'issued_on', 'amount', 'received', 'currency', 'status', 'invoice_id'],
                filtered.map((r) => ({
                  po_number: r.po_number,
                  client: clientPoPartyName(r),
                  vertical: clientPoDepartmentLabel(r.division_code),
                  issued_on: r.issued_on || '',
                  amount: r.amount,
                  received: r.received_amount || 0,
                  currency: r.currency,
                  status: r.status,
                  invoice_id: r.invoice_id || '',
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
          placeholder="Search client / PO number…"
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
                      <td className={`${docsStyles.colAmount} ${docsStyles.amount}`}>{formatAED(Number(r.amount))}</td>
                      <td className={docsStyles.colAmount}>
                        {formatAED(Number(r.received_amount || 0))}
                        {open ? (
                          <div className={docsStyles.meta}>
                            {formatAED(clientPoRemaining(Number(r.amount), Number(r.received_amount || 0)))} left
                          </div>
                        ) : null}
                      </td>
                      <td className={docsStyles.colStatus}>
                        <StatusPill status={clientPoStatusLabel(r.status)} />
                      </td>
                      <td className={`${docsStyles.colActions} ${docsStyles.actionsCell}`}>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
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

      <Modal open={editorOpen} title="New client PO" onClose={() => setEditorOpen(false)} width={640}>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
          style={{ display: 'grid', gap: 12 }}
        >
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))' }}>
            <label style={labelStyle}>
              Client *
              <select style={selectStyle} value={clientId} onChange={(e) => setClientId(e.target.value)} required>
                <option value="">Pick a client…</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.company_name}
                  </option>
                ))}
              </select>
            </label>
            <label style={labelStyle}>
              Vertical
              <select style={selectStyle} value={divisionCode} onChange={(e) => setDivisionCode(e.target.value)}>
                <option value="">Not set</option>
                {CLIENT_PO_DEPARTMENTS.map((d) => (
                  <option key={d.code} value={d.code}>
                    {d.label}
                  </option>
                ))}
              </select>
            </label>
            <label style={labelStyle}>
              PO number *
              <input style={inputStyle} value={poNumber} onChange={(e) => setPoNumber(e.target.value)} required />
            </label>
            <label style={labelStyle}>
              Amount (AED)
              <input
                style={inputStyle}
                type="number"
                min={0}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
            <label style={labelStyle}>
              PO date
              <input style={inputStyle} type="date" value={issuedOn} onChange={(e) => setIssuedOn(e.target.value)} />
            </label>
          </div>
          <label style={labelStyle}>
            Notes
            <input style={inputStyle} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" style={buttonSecondaryStyle} onClick={() => setEditorOpen(false)}>
              Cancel
            </button>
            <button type="submit" style={buttonPrimaryStyle} disabled={saving}>
              {saving ? 'Saving…' : 'Save PO'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
