import { useCallback, useEffect, useState } from 'react'
import { Truck } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import EmptyState from '../components/EmptyState'
import { errorMessage } from '../lib/errors'
import { poReceiveRemaining } from '../lib/purchasing'
import {
  createPurchaseOrder,
  listPoLines,
  listPurchaseOrders,
  receivePoLine,
  type PurchaseOrder,
  type PurchaseOrderLine,
} from '../lib/opsSliceStores'
import {
  buttonPrimaryStyle,
  buttonSecondaryStyle,
  cardStyle,
  colors,
  inputStyle,
  labelStyle,
} from '../lib/uiStyles'
import docsStyles from '../styles/docsList.module.css'

/** M9: supplier purchase orders + receive into stock. */
export default function PurchaseOrdersPage() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [rows, setRows] = useState<PurchaseOrder[]>([])
  const [selected, setSelected] = useState<PurchaseOrder | null>(null)
  const [lines, setLines] = useState<PurchaseOrderLine[]>([])
  const [vendor, setVendor] = useState('')
  const [sku, setSku] = useState('')
  const [desc, setDesc] = useState('')
  const [qty, setQty] = useState('1')
  const [cost, setCost] = useState('0')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setRows(await listPurchaseOrders())
    } catch (e) {
      showToast(errorMessage(e, 'Could not load POs'), 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    void load()
  }, [load])

  async function openPo(po: PurchaseOrder) {
    setSelected(po)
    try {
      setLines(await listPoLines(po.id))
    } catch (e) {
      showToast(errorMessage(e, 'Could not load lines'), 'error')
    }
  }

  return (
    <div className={docsStyles.page}>
      <header className={docsStyles.hero}>
        <div>
          <p className={docsStyles.kicker}>Ops · M9</p>
          <h1 className={docsStyles.title}>
            <Truck size={22} style={{ verticalAlign: 'middle', marginRight: 8 }} />
            Purchase orders
          </h1>
          <p className={docsStyles.subtitle}>Order from suppliers and receive into inventory when the SKU matches.</p>
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
              void createPurchaseOrder({
                vendorName: vendor,
                orderDate: new Date().toISOString().slice(0, 10),
                sku,
                description: desc,
                qty: Number(qty),
                unitCost: Number(cost),
              })
                .then(() => {
                  showToast('PO created', 'success')
                  setVendor('')
                  setSku('')
                  setDesc('')
                  return load()
                })
                .catch((err) => showToast(errorMessage(err, 'Create failed'), 'error'))
            }}
          >
            <h2 style={{ marginTop: 0, fontSize: 16 }}>New PO</h2>
            <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr' }}>
              <label style={labelStyle}>
                Vendor
                <input style={inputStyle} value={vendor} onChange={(e) => setVendor(e.target.value)} required />
              </label>
              <label style={labelStyle}>
                SKU
                <input style={inputStyle} value={sku} onChange={(e) => setSku(e.target.value)} />
              </label>
              <label style={labelStyle}>
                Description
                <input style={inputStyle} value={desc} onChange={(e) => setDesc(e.target.value)} />
              </label>
              <label style={labelStyle}>
                Qty
                <input style={inputStyle} type="number" min={0} step="0.01" value={qty} onChange={(e) => setQty(e.target.value)} />
              </label>
              <label style={labelStyle}>
                Unit cost
                <input style={inputStyle} type="number" min={0} step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} />
              </label>
            </div>
            <button type="submit" style={{ ...buttonPrimaryStyle, marginTop: 10 }}>
              Create
            </button>
          </form>

          <section style={cardStyle}>
            <h2 style={{ marginTop: 0, fontSize: 16 }}>Open POs</h2>
            {rows.length === 0 ? (
              <EmptyState title="No purchase orders" subtitle="Create one above. Apply the purchase_orders migration if empty after create." />
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
                {rows.map((po) => (
                  <li key={po.id}>
                    <button type="button" style={buttonSecondaryStyle} onClick={() => void openPo(po)}>
                      {po.po_number} · {po.vendor_name} · {po.status}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {selected ? (
              <div style={{ marginTop: 12 }}>
                <h3 style={{ fontSize: 14 }}>{selected.po_number}</h3>
                {lines.map((l) => {
                  const rem = poReceiveRemaining(l.qty_ordered, l.qty_received)
                  return (
                    <div key={l.id} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
                      <span style={{ fontSize: 13 }}>
                        {l.sku || '—'} {l.description} · ordered {l.qty_ordered} · received {l.qty_received}
                      </span>
                      {rem > 0 && selected.status !== 'canceled' ? (
                        <button
                          type="button"
                          style={buttonPrimaryStyle}
                          onClick={() => {
                            void receivePoLine(l.id, rem, user?.email || '')
                              .then(async () => {
                                showToast('Received into stock', 'success')
                                await load()
                                await openPo(selected)
                              })
                              .catch((err) => showToast(errorMessage(err, 'Receive failed'), 'error'))
                          }}
                        >
                          Receive {rem}
                        </button>
                      ) : null}
                    </div>
                  )
                })}
                <p style={{ color: colors.muted, fontSize: 12 }}>Receive updates product stock when the SKU exists.</p>
              </div>
            ) : null}
          </section>
        </div>
      )}
    </div>
  )
}
