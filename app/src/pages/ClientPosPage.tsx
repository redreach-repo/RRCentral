import { useCallback, useEffect, useState } from 'react'
import { FileText } from 'lucide-react'
import { useToast } from '../contexts/ToastContext'
import EmptyState from '../components/EmptyState'
import { db } from '../lib/db'
import { errorMessage } from '../lib/errors'
import {
  CLIENT_PO_DEPARTMENTS,
  clientPoDepartmentLabel,
  clientPoInvoicePool,
  clientPoIsOpen,
  clientPoPartyName,
  clientPoRemaining,
  clientPoStatusAfterMatch,
  clientPoStatusAfterReceipt,
  clientPoSummary,
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
import {
  buttonPrimaryStyle,
  buttonSecondaryStyle,
  cardStyle,
  colors,
  inputStyle,
  labelStyle,
  selectStyle,
} from '../lib/uiStyles'
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

/** M9a: customer purchase order tracker + soft invoice match. */
export default function ClientPosPage() {
  const { showToast } = useToast()
  const [rows, setRows] = useState<ClientPurchaseOrder[]>([])
  const [clients, setClients] = useState<ClientOpt[]>([])
  const [invoices, setInvoices] = useState<InvoiceOpt[]>([])
  const [clientId, setClientId] = useState('')
  const [divisionCode, setDivisionCode] = useState('')
  const [poNumber, setPoNumber] = useState('')
  const [amount, setAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [pos, cl, inv] = await Promise.all([
        listClientPurchaseOrders(),
        // Company wide client list, the same one Quotations and Invoices use (every department).
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

  return (
    <div className={docsStyles.page}>
      <header className={docsStyles.hero}>
        <div>
          <p className={docsStyles.kicker}>Documents · all departments</p>
          <h1 className={docsStyles.title}>
            <FileText size={22} style={{ verticalAlign: 'middle', marginRight: 8 }} />
            Client POs
          </h1>
          <p className={docsStyles.subtitle}>
            Track customer purchase order numbers for any client in any department. Soft-match invoices by
            amount.
          </p>
        </div>
        <button
          type="button"
          className={docsStyles.newBtn}
          style={{ background: 'transparent', color: 'inherit', border: '1px solid var(--border)' }}
          disabled={!rows.length}
          onClick={() => {
            exportListCsv(
              'client-pos.csv',
              ['po_number', 'client', 'department', 'amount', 'currency', 'status', 'invoice_id'],
              rows.map((r) => ({
                po_number: r.po_number,
                client: clientPoPartyName(r),
                department: clientPoDepartmentLabel(r.division_code),
                amount: r.amount,
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
      </header>

      {loading ? (
        <p>Loading…</p>
      ) : (
        <div style={{ display: 'grid', gap: 16 }}>
          <form
            style={cardStyle}
            onSubmit={(e) => {
              e.preventDefault()
              const client = clients.find((c) => c.id === clientId)
              if (!client) {
                showToast('Pick a client', 'error')
                return
              }
              void createClientPurchaseOrder({
                clientId: client.id,
                accountId: client.account_id ?? null,
                divisionCode: divisionCode || null,
                poNumber,
                amount: Number(amount) || 0,
                currency: 'AED',
                issuedOn: new Date().toISOString().slice(0, 10),
                notes,
              })
                .then(() => {
                  showToast('Client PO saved', 'success')
                  setPoNumber('')
                  setAmount('')
                  setNotes('')
                  setClientId('')
                  return load()
                })
                .catch((err) => showToast(errorMessage(err, 'Save failed'), 'error'))
            }}
          >
            <h2 style={{ marginTop: 0, fontSize: 16 }}>New client PO</h2>
            <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
              <label style={labelStyle}>
                Client
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
                Department
                <select style={selectStyle} value={divisionCode} onChange={(e) => setDivisionCode(e.target.value)}>
                  <option value="">Any department</option>
                  {CLIENT_PO_DEPARTMENTS.map((d) => (
                    <option key={d.code} value={d.code}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </label>
              <label style={labelStyle}>
                PO number
                <input style={inputStyle} value={poNumber} onChange={(e) => setPoNumber(e.target.value)} required />
              </label>
              <label style={labelStyle}>
                Amount
                <input
                  style={inputStyle}
                  type="number"
                  min={0}
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </label>
            </div>
            <label style={{ ...labelStyle, marginTop: 8 }}>
              Notes
              <input style={inputStyle} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>
            <button type="submit" style={{ ...buttonPrimaryStyle, marginTop: 10 }}>
              Save
            </button>
          </form>

          <section style={cardStyle}>
            <h2 style={{ marginTop: 0, fontSize: 16 }}>Tracked POs</h2>
            {rows.length === 0 ? (
              <EmptyState title="No client POs" subtitle="Add a customer PO number above." />
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
                {rows.map((r) => {
                  const suggestion = clientPoIsOpen(r.status)
                    ? suggestClientPoInvoiceMatch(
                        { amount: Number(r.amount) },
                        clientPoInvoicePool({ account_id: r.account_id, partyName: clientPoPartyName(r) }, invoices),
                      )
                    : null
                  return (
                    <li key={r.id} style={{ borderTop: `1px solid ${colors.border}`, paddingTop: 8 }}>
                      <div style={{ fontSize: 13 }}>
                        {clientPoSummary({
                          poNumber: r.po_number,
                          accountName: clientPoPartyName(r),
                          amount: Number(r.amount),
                          currency: r.currency,
                          status: r.status,
                        })}
                        {r.division_code ? (
                          <div style={{ color: colors.muted, fontSize: 12 }}>
                            {clientPoDepartmentLabel(r.division_code)}
                          </div>
                        ) : null}
                        {r.invoice_id ? (
                          <div style={{ color: colors.muted, fontSize: 12 }}>Linked invoice id {r.invoice_id}</div>
                        ) : null}
                        <div style={{ color: colors.muted, fontSize: 12 }}>
                          Received {Number(r.received_amount || 0).toFixed(2)} · remaining{' '}
                          {clientPoRemaining(Number(r.amount), Number(r.received_amount || 0)).toFixed(2)}
                        </div>
                        {suggestion && !r.invoice_id ? (
                          <div style={{ color: colors.muted, fontSize: 12 }}>
                            Suggest {suggestion.reference} · {suggestion.reason}
                          </div>
                        ) : null}
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
                        {clientPoIsOpen(r.status) && !r.invoice_id ? (
                          <button type="button" style={buttonSecondaryStyle} onClick={() => void matchInvoice(r)}>
                            Soft-match invoice
                          </button>
                        ) : null}
                        {clientPoIsOpen(r.status) ? (
                          <button
                            type="button"
                            style={buttonSecondaryStyle}
                            onClick={() => {
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
                            }}
                          >
                            Record receipt
                          </button>
                        ) : null}
                        {r.status === 'open' || r.status === 'partial' ? (
                          <button
                            type="button"
                            style={buttonSecondaryStyle}
                            onClick={() => {
                              void setClientPoStatus(r.id, 'fulfilled')
                                .then(() => {
                                  showToast('Marked fulfilled', 'success')
                                  return load()
                                })
                                .catch((err) => showToast(errorMessage(err, 'Update failed'), 'error'))
                            }}
                          >
                            Mark fulfilled
                          </button>
                        ) : null}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
