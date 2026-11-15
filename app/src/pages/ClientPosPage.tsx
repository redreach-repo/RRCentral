import { useCallback, useEffect, useState } from 'react'
import { FileText } from 'lucide-react'
import { useToast } from '../contexts/ToastContext'
import EmptyState from '../components/EmptyState'
import { db } from '../lib/db'
import { errorMessage } from '../lib/errors'
import { clientPoSummary } from '../lib/clientPurchaseOrders'
import {
  createClientPurchaseOrder,
  listClientPurchaseOrders,
  setClientPoStatus,
  type ClientPurchaseOrder,
} from '../lib/opsSliceStores'
import { buttonPrimaryStyle, buttonSecondaryStyle, cardStyle, colors, inputStyle, labelStyle, selectStyle } from '../lib/uiStyles'
import docsStyles from '../styles/docsList.module.css'

type AccountOpt = { id: string; name: string }

/** M9a: customer purchase order tracker. */
export default function ClientPosPage() {
  const { showToast } = useToast()
  const [rows, setRows] = useState<ClientPurchaseOrder[]>([])
  const [accounts, setAccounts] = useState<AccountOpt[]>([])
  const [accountId, setAccountId] = useState('')
  const [poNumber, setPoNumber] = useState('')
  const [amount, setAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [pos, accts] = await Promise.all([
        listClientPurchaseOrders(),
        db.from('accounts').select('id, name').order('name').limit(200),
      ])
      setRows(pos)
      const list = (accts.data || []) as AccountOpt[]
      setAccounts(list)
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

  return (
    <div className={docsStyles.page}>
      <header className={docsStyles.hero}>
        <div>
          <p className={docsStyles.kicker}>Sales · M9a</p>
          <h1 className={docsStyles.title}>
            <FileText size={22} style={{ verticalAlign: 'middle', marginRight: 8 }} />
            Client POs
          </h1>
          <p className={docsStyles.subtitle}>Track customer purchase order numbers against accounts.</p>
        </div>
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
                <input style={inputStyle} type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
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
                {rows.map((r) => (
                  <li key={r.id} style={{ borderTop: `1px solid ${colors.border}`, paddingTop: 8 }}>
                    <div style={{ fontSize: 13 }}>
                      {clientPoSummary({
                        poNumber: r.po_number,
                        accountName: r.accounts?.name || r.account_id,
                        amount: Number(r.amount),
                        currency: r.currency,
                        status: r.status,
                      })}
                    </div>
                    {r.status === 'open' || r.status === 'partial' ? (
                      <button
                        type="button"
                        style={{ ...buttonSecondaryStyle, marginTop: 6 }}
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
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
