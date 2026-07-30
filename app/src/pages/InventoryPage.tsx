import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Package, Plus, RefreshCw } from 'lucide-react'
import { db } from '../lib/db'
import { DIVISIONS } from '../lib/config'
import { availableStock, adjustStock } from '../lib/inventory'
import { syncSeedCatalog } from '../lib/syncCatalog'
import type { Product } from '../lib/types'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import Modal from '../components/Modal'
import EmptyState from '../components/EmptyState'
import {
  buttonPrimaryStyle,
  buttonSecondaryStyle,
  cardStyle,
  colors,
  inputStyle,
  labelStyle,
  pageStyle,
  pageSubtitleStyle,
  pageTitleStyle,
  selectStyle,
  tableStyle,
  tableWrapStyle,
  tdStyle,
  thStyle,
  toolbarStyle,
} from '../lib/uiStyles'

export default function InventoryPage() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'low' | 'reserved'>('all')
  const [search, setSearch] = useState('')
  const [adjustTarget, setAdjustTarget] = useState<Product | null>(null)
  const [delta, setDelta] = useState('0')
  const [reason, setReason] = useState('manual_adjust')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await db.from('products').select('*').order('sku')
      if (error) throw error
      setProducts((data || []) as Product[])
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to load inventory', 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    void load()
  }, [load])

  const rows = useMemo(() => {
    let list = products.filter((p) => p.active !== false)
    if (filter === 'low') {
      list = list.filter((p) => availableStock(p) <= Number(p.reorder_level || 0))
    } else if (filter === 'reserved') {
      list = list.filter((p) => Number(p.stock_reserved || 0) > 0)
    }
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter(
        (p) =>
          p.sku.toLowerCase().includes(q) ||
          p.name.toLowerCase().includes(q),
      )
    }
    return list
  }, [products, filter, search])

  const lowCount = products.filter(
    (p) => p.active !== false && availableStock(p) <= Number(p.reorder_level || 0),
  ).length

  async function syncSkus() {
    setBusy(true)
    try {
      const r = await syncSeedCatalog()
      showToast(`SKUs synced · ${r.inserted} new · ${r.updated} updated`, 'success')
      await load()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Sync failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function saveAdjust() {
    if (!adjustTarget?.sku) return
    const n = Number(delta)
    if (!Number.isFinite(n) || n === 0) {
      showToast('Enter a non-zero quantity', 'error')
      return
    }
    setBusy(true)
    try {
      await adjustStock({
        sku: adjustTarget.sku,
        qtyDelta: n,
        reason: reason || 'manual_adjust',
        userEmail: user?.email || '',
      })
      showToast('Stock updated', 'success')
      setAdjustTarget(null)
      setDelta('0')
      await load()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Adjust failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  const brand = (code: string) => DIVISIONS.find((d) => d.code === code)?.brand || code

  return (
    <div style={pageStyle}>
      <div style={toolbarStyle}>
        <div>
          <h1 style={pageTitleStyle}>Inventory</h1>
          <p style={pageSubtitleStyle}>
            Stock by SKU · available = on hand − reserved
            {lowCount > 0 ? ` · ${lowCount} low stock` : ''}
          </p>
        </div>
        <button type="button" style={buttonSecondaryStyle} disabled={busy} onClick={() => void syncSkus()}>
          <RefreshCw size={16} /> Sync catalogue SKUs
        </button>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <select
          style={selectStyle}
          value={filter}
          onChange={(e) => setFilter(e.target.value as typeof filter)}
        >
          <option value="all">All active</option>
          <option value="low">Low stock</option>
          <option value="reserved">Has reserved</option>
        </select>
        <input
          style={{ ...inputStyle, maxWidth: 280 }}
          placeholder="Search SKU / name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div style={{ ...cardStyle, color: colors.muted }}>Loading inventory…</div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Package size={22} />}
          title="No inventory rows"
          subtitle="Sync catalogue SKUs, then adjust stock levels."
          actionLabel="Sync catalogue SKUs"
          onAction={() => void syncSkus()}
        />
      ) : (
        <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
          <div style={tableWrapStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>SKU</th>
                  <th style={thStyle}>Name</th>
                  <th style={thStyle}>Division</th>
                  <th style={thStyle}>On hand</th>
                  <th style={thStyle}>Reserved</th>
                  <th style={thStyle}>Available</th>
                  <th style={thStyle}>Reorder</th>
                  <th style={thStyle}></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const avail = availableStock(p)
                  const low = avail <= Number(p.reorder_level || 0)
                  return (
                    <tr key={p.id}>
                      <td style={{ ...tdStyle, fontWeight: 600 }}>{p.sku || '—'}</td>
                      <td style={tdStyle}>
                        {p.name}
                        {p.track_sizes ? (
                          <span style={{ marginLeft: 6, fontSize: 11, color: colors.muted2 }}>sizes</span>
                        ) : null}
                      </td>
                      <td style={tdStyle}>{brand(p.division_code)}</td>
                      <td style={tdStyle}>{Number(p.stock_on_hand || 0)}</td>
                      <td style={tdStyle}>{Number(p.stock_reserved || 0)}</td>
                      <td
                        style={{
                          ...tdStyle,
                          color: low ? colors.danger : colors.text,
                          fontWeight: low ? 700 : 500,
                        }}
                      >
                        {low ? <AlertTriangle size={12} style={{ marginRight: 4 }} /> : null}
                        {avail}
                      </td>
                      <td style={tdStyle}>{Number(p.reorder_level || 0)}</td>
                      <td style={tdStyle}>
                        <button
                          type="button"
                          style={buttonSecondaryStyle}
                          onClick={() => {
                            setAdjustTarget(p)
                            setDelta('0')
                            setReason('manual_adjust')
                          }}
                        >
                          <Plus size={14} /> Adjust
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal
        open={!!adjustTarget}
        title={`Adjust stock — ${adjustTarget?.sku || ''}`}
        onClose={() => setAdjustTarget(null)}
        width={420}
      >
        <p style={{ margin: '0 0 12px', fontSize: 13, color: colors.muted }}>
          {adjustTarget?.name} · on hand {Number(adjustTarget?.stock_on_hand || 0)}
        </p>
        <label style={labelStyle}>Quantity change (+ receive / − issue)</label>
        <input
          type="number"
          style={{ ...inputStyle, marginBottom: 12 }}
          value={delta}
          onChange={(e) => setDelta(e.target.value)}
        />
        <label style={labelStyle}>Reason</label>
        <select style={{ ...selectStyle, marginBottom: 16 }} value={reason} onChange={(e) => setReason(e.target.value)}>
          <option value="manual_adjust">Manual adjust</option>
          <option value="purchase_receipt">Purchase receipt</option>
          <option value="stock_count">Stock count</option>
          <option value="damage_writeoff">Damage / write-off</option>
          <option value="sample_issue">Sample issue</option>
        </select>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" style={buttonSecondaryStyle} onClick={() => setAdjustTarget(null)}>
            Cancel
          </button>
          <button type="button" style={buttonPrimaryStyle} disabled={busy} onClick={() => void saveAdjust()}>
            Save
          </button>
        </div>
      </Modal>
    </div>
  )
}
