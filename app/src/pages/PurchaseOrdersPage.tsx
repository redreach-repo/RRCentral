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
  softDeletePurchaseOrder,
  updatePoLandedCost,
  type PurchaseOrder,
  type PurchaseOrderLine,
} from '../lib/opsSliceStores'
import { exportListCsv } from '../lib/listIo'
import { listWarehouses } from '../lib/warehouseStore'
import { defaultWarehouse, warehouseLabel, type Warehouse } from '../lib/warehouses'
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

/** M9: supplier purchase orders + receive into stock. */
export default function PurchaseOrdersPage() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [rows, setRows] = useState<PurchaseOrder[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [warehouseId, setWarehouseId] = useState('')
  const [selected, setSelected] = useState<PurchaseOrder | null>(null)
  const [lines, setLines] = useState<PurchaseOrderLine[]>([])
  const [vendor, setVendor] = useState('')
  const [sku, setSku] = useState('')
  const [desc, setDesc] = useState('')
  const [qty, setQty] = useState('1')
  const [cost, setCost] = useState('0')
  const [landed, setLanded] = useState('0')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [pos, wh] = await Promise.all([
        listPurchaseOrders(),
        listWarehouses().catch(() => [] as Warehouse[]),
      ])
      setRows(pos)
      setWarehouses(wh)
      setWarehouseId((prev) => prev || defaultWarehouse(wh)?.id || '')
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
          <p className={docsStyles.subtitle}>
            Order from suppliers and receive into inventory when the SKU matches. Landed cost (freight/duty) allocates into unit cost on receive (Unverified).
          </p>
        </div>
        <button
          type="button"
          className={docsStyles.newBtn}
          style={{ background: 'transparent', color: 'inherit', border: '1px solid var(--border)' }}
          disabled={!rows.length}
          onClick={() => {
            exportListCsv(
              'purchase-orders.csv',
              ['po_number', 'vendor_name', 'status', 'order_date', 'landed_cost_aed'],
              rows.map((r) => ({
                po_number: r.po_number,
                vendor_name: r.vendor_name,
                status: r.status,
                order_date: r.order_date,
                landed_cost_aed: r.landed_cost_aed,
              })),
            )
            showToast('PO CSV downloaded', 'success')
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
              void createPurchaseOrder({
                vendorName: vendor,
                orderDate: new Date().toISOString().slice(0, 10),
                sku,
                description: desc,
                qty: Number(qty),
                unitCost: Number(cost),
                landedCostAed: Number(landed) || 0,
                warehouseId: warehouseId || null,
              })
                .then(() => {
                  showToast('PO created', 'success')
                  setVendor('')
                  setSku('')
                  setDesc('')
                  setLanded('0')
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
              <label style={labelStyle}>
                Landed cost (AED)
                <input style={inputStyle} type="number" min={0} step="0.01" value={landed} onChange={(e) => setLanded(e.target.value)} />
              </label>
              <label style={labelStyle}>
                Warehouse
                <select
                  style={selectStyle}
                  value={warehouseId}
                  onChange={(e) => setWarehouseId(e.target.value)}
                  aria-label="Receive warehouse"
                >
                  <option value="">Default / none</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {warehouseLabel(w)}
                    </option>
                  ))}
                </select>
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
                  <li key={po.id} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <button type="button" style={buttonSecondaryStyle} onClick={() => void openPo(po)}>
                      {po.po_number} · {po.vendor_name} · {po.status}
                      {po.warehouse_id
                        ? ` · ${warehouses.find((w) => w.id === po.warehouse_id)?.code || 'WH'}`
                        : ''}
                    </button>
                    <button
                      type="button"
                      style={buttonSecondaryStyle}
                      onClick={() => {
                        if (!window.confirm(`Archive ${po.po_number}?`)) return
                        void softDeletePurchaseOrder(po.id)
                          .then(() => {
                            showToast('PO archived', 'success')
                            if (selected?.id === po.id) setSelected(null)
                            return load()
                          })
                          .catch((err) => showToast(errorMessage(err, 'Archive failed'), 'error'))
                      }}
                    >
                      Archive
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {selected ? (
              <div style={{ marginTop: 12 }}>
                <h3 style={{ fontSize: 14 }}>
                  {selected.po_number} · landed {Number(selected.landed_cost_aed || 0).toFixed(2)} AED
                </h3>
                <label style={{ ...labelStyle, maxWidth: 220, marginBottom: 8 }}>
                  Update landed cost
                  <input
                    style={inputStyle}
                    type="number"
                    min={0}
                    step="0.01"
                    defaultValue={selected.landed_cost_aed}
                    onBlur={(e) => {
                      const v = Number(e.target.value) || 0
                      void updatePoLandedCost(selected.id, v)
                        .then(async () => {
                          showToast('Landed cost saved', 'success')
                          await load()
                          const next = (await listPurchaseOrders()).find((p) => p.id === selected.id)
                          if (next) await openPo(next)
                        })
                        .catch((err) => showToast(errorMessage(err, 'Landed cost failed'), 'error'))
                    }}
                  />
                </label>
                {lines.map((l) => {
                  const rem = poReceiveRemaining(l.qty_ordered, l.qty_received)
                  return (
                    <div key={l.id} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
                      <span style={{ fontSize: 13 }}>
                        {l.sku || '—'} {l.description} · ordered {l.qty_ordered} · received {l.qty_received}
                        {l.landed_unit_cost ? ` · landed unit ${Number(l.landed_unit_cost).toFixed(2)}` : ''}
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
