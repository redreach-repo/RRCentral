import { useCallback, useEffect, useState } from 'react'
import { FileText } from 'lucide-react'
import { useToast } from '../contexts/ToastContext'
import EmptyState from '../components/EmptyState'
import { db } from '../lib/db'
import { errorMessage } from '../lib/errors'
import {
  clientPoIsOpen,
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

type AccountOpt = { id: string; name: string }
type InvoiceOpt = {
  id: string
  reference_number: string
  amount: number
  status: string
  account_id?: string | null
  client?: string
}

/** M9a: customer purchase order tracker + soft invoice match. */
const PO_STATUSES = ['all', 'open', 'partial', 'fulfilled', 'canceled'] as const

export default function ClientPosPage() {
  const { showToast } = useToast()
  const [rows, setRows] = useState<ClientPurchaseOrder[]>([])
  const [accounts, setAccounts] = useState<AccountOpt[]>([])
  const [invoices, setInvoices] = useState<InvoiceOpt[]>([])
  const [accountId, setAccountId] = useState('')
  const [poNumber, setPoNumber] = useState('')
  const [amount, setAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [statusFilter, setStatusFilter] = useState<(typeof PO_STATUSES)[number]>('all')
  const [receiptDrafts, setReceiptDrafts] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [pos, accts, inv] = await Promise.all([
        listClientPurchaseOrders(),
        db.from('accounts').select('id, name').order('name').limit(200),
        db
          .from('invoices')
          .select('id, reference_number, amount, status, account_id, client')
          .order('created_at', { ascending: false })
          .limit(300),
      ])
      setRows(pos)
      const list = (accts.data || []) as AccountOpt[]
      setAccounts(list)
      setInvoices((inv.data || []) as InvoiceOpt[])
      if (!accountId && list[0]) setAccountId(list[0].id)
    } catch (e) {
      showToast(errorMessage(e, 'Could not load client POs'), 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast, accountId])

  useEffect(() => {
    void load()
  }, [load])

  async function matchInvoice(r: ClientPurchaseOrder) {
    const accountInvoices = invoices.filter(
      (i) => i.account_id === r.account_id || (!i.account_id && Boolean(r.accounts?.name)),
    )
    const pool = accountInvoices.length ? accountInvoices : invoices
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
          <p className={docsStyles.kicker}>Sales · M9a</p>
          <h1 className={docsStyles.title}>
            <FileText size={22} style={{ verticalAlign: 'middle', marginRight: 8 }} />
            Client POs
          </h1>
          <p className={docsStyles.subtitle}>
            Track customer purchase order numbers against accounts. Soft-match invoices by amount.
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
              ['po_number', 'account', 'amount', 'currency', 'status', 'invoice_id'],
              rows.map((r) => ({
                po_number: r.po_number,
                account: r.accounts?.name || r.account_id,
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
              void createClientPurchaseOrder({
                accountId,
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
                  return load()
                })
                .catch((err) => showToast(errorMessage(err, 'Save failed'), 'error'))
            }}
          >
            <h2 style={{ marginTop: 0, fontSize: 16 }}>New client PO</h2>
            <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '2fr 1fr 1fr' }}>
              <label style={labelStyle}>
                Account
                <select style={selectStyle} value={accountId} onChange={(e) => setAccountId(e.target.value)} required>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
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
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'end', marginBottom: 8 }}>
              <h2 style={{ margin: 0, fontSize: 16, flex: 1 }}>Tracked POs</h2>
              <label style={labelStyle}>
                Status
                <select
                  style={selectStyle}
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as (typeof PO_STATUSES)[number])}
                >
                  {PO_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s === 'all' ? 'All' : s}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {rows.filter((r) => statusFilter === 'all' || r.status === statusFilter).length === 0 ? (
              <EmptyState title="No client POs" subtitle="Add a customer PO number above." />
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
                {rows
                  .filter((r) => statusFilter === 'all' || r.status === statusFilter)
                  .map((r) => {
                  const suggestion = clientPoIsOpen(r.status)
                    ? suggestClientPoInvoiceMatch(
                        { amount: Number(r.amount) },
                        invoices.filter((i) => i.account_id === r.account_id || !i.account_id),
                      )
                    : null
                  return (
                    <li key={r.id} style={{ borderTop: `1px solid ${colors.border}`, paddingTop: 8 }}>
                      <div style={{ fontSize: 13 }}>
                        {clientPoSummary({
                          poNumber: r.po_number,
                          accountName: r.accounts?.name || r.account_id,
                          amount: Number(r.amount),
                          currency: r.currency,
                          status: r.status,
                        })}
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
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6, alignItems: 'center' }}>
                        {clientPoIsOpen(r.status) && !r.invoice_id ? (
                          <button type="button" style={buttonSecondaryStyle} onClick={() => void matchInvoice(r)}>
                            Soft-match invoice
                          </button>
                        ) : null}
                        {clientPoIsOpen(r.status) ? (
                          <>
                            <input
                              style={{ ...inputStyle, maxWidth: 120, height: 36 }}
                              type="number"
                              min={0}
                              step="0.01"
                              placeholder="Add AED"
                              aria-label={`Receipt amount for ${r.po_number}`}
                              value={receiptDrafts[r.id] ?? ''}
                              onChange={(e) =>
                                setReceiptDrafts((prev) => ({ ...prev, [r.id]: e.target.value }))
                              }
                            />
                            <button
                              type="button"
                              style={buttonSecondaryStyle}
                              onClick={() => {
                                const add = Number(receiptDrafts[r.id] || 0)
                                if (!(add > 0)) {
                                  showToast('Enter a receipt amount greater than 0', 'error')
                                  return
                                }
                                const next = Number(r.received_amount || 0) + add
                                const status = clientPoStatusAfterReceipt(Number(r.amount), next)
                                void recordClientPoReceipt(r.id, next, status)
                                  .then(() => {
                                    showToast(`Receipt recorded → ${status}`, 'success')
                                    setReceiptDrafts((prev) => {
                                      const copy = { ...prev }
                                      delete copy[r.id]
                                      return copy
                                    })
                                    return load()
                                  })
                                  .catch((err) => showToast(errorMessage(err, 'Receipt failed'), 'error'))
                              }}
                            >
                              Record receipt
                            </button>
                          </>
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
