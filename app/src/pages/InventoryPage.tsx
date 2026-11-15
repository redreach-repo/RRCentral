import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Package, Plus, RefreshCw } from 'lucide-react'
import { db } from '../lib/db'
import { DIVISIONS } from '../lib/config'
import { availableStock, adjustStock } from '../lib/inventory'
import { syncSeedCatalog } from '../lib/syncCatalog'
import type { Product } from '../lib/types'
import { useAuth } from '../contexts/AuthContext'
import { useI18n } from '../contexts/I18nContext'
import { useToast } from '../contexts/ToastContext'
import Modal from '../components/Modal'
import EmptyState from '../components/EmptyState'
import SavedViewsBar from '../components/SavedViewsBar'
import {
  buttonPrimaryStyle,
  buttonSecondaryStyle,
  cardStyle,
  colors,
  inputStyle,
  labelStyle,
  selectStyle,
  tableStyle,
  tableWrapStyle,
  tdStyle,
  thStyle,
} from '../lib/uiStyles'
import docsStyles from '../styles/docsList.module.css'
import { errorMessage } from '../lib/errors'
import { parseInventoryAdjust } from '../lib/schemas/inventoryAdjust'
import { INVENTORY_ADJUST_CSV_COLUMNS } from '../lib/inventoryCsv'
import { csvRowsToObjects, exportListCsv, parseCsv, parseListIoRows } from '../lib/listIo'
import { createWarehouse, listWarehouses } from '../lib/warehouseStore'
import {
  listWarehouseStock,
  type WarehouseStockListRow,
} from '../lib/warehouseStockStore'
import { defaultWarehouse, warehouseLabel, type Warehouse } from '../lib/warehouses'

export default function InventoryPage() {
  const { t } = useI18n()
  const { user, appUserId } = useAuth()
  const { showToast } = useToast()
  const [products, setProducts] = useState<Product[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [stockRows, setStockRows] = useState<WarehouseStockListRow[]>([])
  const [warehouseId, setWarehouseId] = useState('')
  const [newWhCode, setNewWhCode] = useState('')
  const [newWhName, setNewWhName] = useState('')
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'low' | 'reserved'>('all')
  const [search, setSearch] = useState('')
  const [adjustTarget, setAdjustTarget] = useState<Product | null>(null)
  const [delta, setDelta] = useState('0')
  const [reason, setReason] = useState('manual_adjust')
  const [busy, setBusy] = useState(false)
  const [importing, setImporting] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)
  const [showArchived, setShowArchived] = useState(false)
  const inventoryViewFilters = useMemo(
    () => ({
      stock: filter,
      q: search,
      archived: showArchived ? '1' : '0',
      warehouse: warehouseId,
    }),
    [filter, search, showArchived, warehouseId],
  )

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [{ data, error }, wh, stock] = await Promise.all([
        db.from('products').select('*').order('sku'),
        listWarehouses().catch(() => [] as Warehouse[]),
        listWarehouseStock().catch(() => [] as WarehouseStockListRow[]),
      ])
      if (error) throw error
      const raw = (data || []) as (Product & { deleted_at?: string | null })[]
      setProducts(showArchived ? raw : raw.filter((p) => !p.deleted_at))
      setWarehouses(wh)
      setStockRows(stock)
      setWarehouseId((prev) => prev || defaultWarehouse(wh)?.id || '')
    } catch (e) {
      showToast(errorMessage(e, 'Failed to load inventory'), 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast, showArchived])

  useEffect(() => {
    void load()
  }, [load])

  const rows = useMemo(() => {
    let list = showArchived
      ? products
      : products.filter((p) => p.active !== false)
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
  }, [products, filter, search, showArchived])

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
      showToast(errorMessage(e, 'Sync failed'), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function restoreProduct(p: Product & { deleted_at?: string | null }) {
    setBusy(true)
    try {
      const { error } = await db
        .from('products')
        .update({ deleted_at: null, active: true, updated_at: new Date().toISOString() })
        .eq('id', p.id)
      if (error) throw error
      showToast(`Restored ${p.sku}`, 'success')
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Restore failed'), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function saveAdjust() {
    if (!adjustTarget?.sku) return
    const parsed = parseInventoryAdjust({
      sku: adjustTarget.sku,
      delta,
      reason: reason || 'manual_adjust',
    })
    if (!parsed.ok) {
      showToast(parsed.error, 'error')
      return
    }
    setBusy(true)
    try {
      await adjustStock({
        sku: parsed.data.sku,
        qtyDelta: parsed.data.qtyDelta,
        reason: parsed.data.reason,
        userEmail: user?.email || '',
        warehouseId: warehouseId || null,
      })
      showToast('Stock updated', 'success')
      setAdjustTarget(null)
      setDelta('0')
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Adjust failed'), 'error')
    } finally {
      setBusy(false)
    }
  }

  const brand = (code: string) => DIVISIONS.find((d) => d.code === code)?.brand || code

  async function importAdjustCsv(file: File) {
    setImporting(true)
    try {
      const text = await file.text()
      const { headers, rows } = parseCsv(text)
      const objects = csvRowsToObjects(headers, rows).map((row) => {
        const normalized: Record<string, string> = {}
        for (const c of INVENTORY_ADJUST_CSV_COLUMNS) {
          normalized[c.key] = String(row[c.label] ?? row[c.key] ?? '').trim()
        }
        return normalized
      })
      const { ok, errors } = parseListIoRows(objects, INVENTORY_ADJUST_CSV_COLUMNS)
      if (!ok.length && errors.length) {
        showToast(errors[0] || 'No valid adjust rows', 'error')
        return
      }
      let saved = 0
      let skipped = errors.length
      for (const row of ok) {
        const qtyDelta = Number(row.qty_delta)
        if (!Number.isFinite(qtyDelta) || qtyDelta === 0) {
          skipped += 1
          continue
        }
        const updated = await adjustStock({
          sku: row.sku,
          qtyDelta,
          reason: row.reason || 'csv_adjust',
          reference: row.reference || 'csv',
          userEmail: user?.email || '',
          warehouseId: warehouseId || null,
        })
        if (!updated) {
          skipped += 1
          continue
        }
        saved += 1
      }
      const skipNote = skipped ? ` · ${skipped} row(s) skipped` : ''
      showToast(`Adjusted ${saved} SKU(s)${skipNote}`, 'success')
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Inventory CSV import failed'), 'error')
    } finally {
      setImporting(false)
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

  return (
    <div className={docsStyles.page}>
      <header className={docsStyles.hero}>
        <div>
          <p className={docsStyles.kicker}>{t('page.ops.kicker')}</p>
          <h1 className={docsStyles.title}>{t('page.inventory.title')}</h1>
          <p className={docsStyles.subtitle}>
            {t('page.inventory.subtitle').replace(
              '{low}',
              lowCount > 0 ? t('page.inventory.lowStock').replace('{n}', String(lowCount)) : '',
            )}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            ref={importInputRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void importAdjustCsv(file)
            }}
          />
          <button
            type="button"
            className={docsStyles.newBtn}
            style={{ background: 'transparent', color: 'inherit', border: '1px solid var(--border)' }}
            disabled={importing || busy}
            onClick={() => importInputRef.current?.click()}
          >
            {importing ? 'Importing…' : 'Import adjusts'}
          </button>
          <button
            type="button"
            className={docsStyles.newBtn}
            style={{ background: 'transparent', color: 'inherit', border: '1px solid var(--border)' }}
            disabled={!products.length}
            onClick={() => {
              exportListCsv(
                'inventory.csv',
                ['sku', 'name', 'division_code', 'stock_on_hand', 'stock_reserved', 'reorder_level'],
                products.map((p) => ({
                  sku: p.sku,
                  name: p.name,
                  division_code: p.division_code,
                  stock_on_hand: p.stock_on_hand,
                  stock_reserved: p.stock_reserved,
                  reorder_level: p.reorder_level,
                })),
              )
              showToast('Inventory CSV downloaded', 'success')
            }}
          >
            Export CSV
          </button>
          <button
            type="button"
            className={docsStyles.newBtn}
            style={{ background: 'transparent', color: 'inherit', border: '1px solid var(--border)' }}
            onClick={() => setShowArchived((v) => !v)}
          >
            {showArchived ? 'Hide archived' : 'Show archived'}
          </button>
          <button
            type="button"
            className={docsStyles.newBtn}
            style={{ background: 'rgba(255,255,255,0.08)' }}
            disabled={busy}
            onClick={() => void syncSkus()}
          >
            <RefreshCw size={16} /> {t('page.inventory.syncSkus')}
          </button>
        </div>
      </header>

      <SavedViewsBar
        moduleId="inventory"
        filters={inventoryViewFilters}
        ownerUserId={appUserId}
        canWrite
        applyDefaultOnLoad={false}
        onApply={(f) => {
          const stock = String(f.stock || 'all')
          if (stock === 'all' || stock === 'low' || stock === 'reserved') setFilter(stock)
          setSearch(String(f.q || ''))
          setShowArchived(String(f.archived || '0') === '1')
          setWarehouseId(String(f.warehouse || ''))
        }}
        onToast={showToast}
        filtersEqual={(a, b) =>
          String(a.stock || 'all') === String(b.stock || 'all') &&
          String(a.q || '') === String(b.q || '') &&
          String(a.archived || '0') === String(b.archived || '0') &&
          String(a.warehouse || '') === String(b.warehouse || '')
        }
      />

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
        <select
          style={selectStyle}
          value={warehouseId}
          onChange={(e) => setWarehouseId(e.target.value)}
          aria-label="Warehouse for adjustments"
        >
          <option value="">No warehouse</option>
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {warehouseLabel(w)}
            </option>
          ))}
        </select>
      </div>

      <div style={{ ...cardStyle, marginBottom: 16, display: 'grid', gap: 8, maxWidth: 560 }}>
        <strong style={{ fontSize: 14 }}>Warehouses (stub)</strong>
        <p style={{ margin: 0, fontSize: 12, color: colors.muted }}>
          Stock still rolls up on the product. Adjustments stamp the selected warehouse on the movement.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            style={{ ...inputStyle, maxWidth: 100 }}
            placeholder="Code"
            value={newWhCode}
            onChange={(e) => setNewWhCode(e.target.value)}
          />
          <input
            style={{ ...inputStyle, flex: 1, minWidth: 140 }}
            placeholder="Name"
            value={newWhName}
            onChange={(e) => setNewWhName(e.target.value)}
          />
          <button
            type="button"
            style={buttonSecondaryStyle}
            disabled={busy || !newWhCode.trim() || !newWhName.trim()}
            onClick={() => {
              void createWarehouse({ code: newWhCode, name: newWhName })
                .then(() => {
                  showToast('Warehouse added', 'success')
                  setNewWhCode('')
                  setNewWhName('')
                  return load()
                })
                .catch((e) => showToast(errorMessage(e, 'Could not add warehouse'), 'error'))
            }}
          >
            <Plus size={14} /> Add
          </button>
        </div>
      </div>

      {stockRows.length > 0 ? (
        <div style={{ ...cardStyle, marginBottom: 16 }}>
          <strong style={{ fontSize: 14 }}>Per-warehouse stock</strong>
          <p style={{ margin: '4px 0 10px', fontSize: 12, color: colors.muted }}>
            Stub rows from adjustments / PO receive. Product rollup remains the source of truth for reorder.
          </p>
          <div style={tableWrapStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Warehouse</th>
                  <th style={thStyle}>SKU</th>
                  <th style={thStyle}>Qty</th>
                </tr>
              </thead>
              <tbody>
                {stockRows.slice(0, 50).map((r) => (
                  <tr key={r.id}>
                    <td style={tdStyle}>
                      {r.warehouse_code || r.warehouse_id}
                      {r.warehouse_name ? ` · ${r.warehouse_name}` : ''}
                    </td>
                    <td style={tdStyle}>{r.sku}</td>
                    <td style={tdStyle}>{r.qty_on_hand}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

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
                  const archived = Boolean((p as Product & { deleted_at?: string | null }).deleted_at)
                  const avail = availableStock(p)
                  const low = avail <= Number(p.reorder_level || 0)
                  return (
                    <tr key={p.id} style={archived ? { opacity: 0.65 } : undefined}>
                      <td style={{ ...tdStyle, fontWeight: 600 }}>{p.sku || '—'}</td>
                      <td style={tdStyle}>
                        {p.name}
                        {archived ? (
                          <span style={{ marginLeft: 6, fontSize: 11, color: colors.muted2 }}>archived</span>
                        ) : null}
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
                        {archived ? (
                          <button
                            type="button"
                            style={buttonSecondaryStyle}
                            disabled={busy}
                            onClick={() => void restoreProduct(p)}
                          >
                            Restore
                          </button>
                        ) : (
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
                        )}
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
