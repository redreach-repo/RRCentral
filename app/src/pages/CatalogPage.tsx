import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, ExternalLink, FileText, Package, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { db } from '../lib/db'
import { DIVISIONS, FABRIC_OPTIONS } from '../lib/config'
import { BRAND_CATALOGUES, catalogueUrl } from '../lib/catalogues'
import { syncSeedCatalog } from '../lib/syncCatalog'
import type { Product } from '../lib/types'
import { useToast } from '../contexts/ToastContext'
import Modal from '../components/Modal'
import EmptyState from '../components/EmptyState'
import { formatAED } from '../lib/money'
import {
  buttonDangerStyle,
  buttonPrimaryStyle,
  buttonSecondaryStyle,
  cardStyle,
  colors,
  fieldStyle,
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
  formGridStyle,
  sectionTitleStyle,
} from '../lib/uiStyles'

type ProductForm = {
  sku: string
  name: string
  division_code: string
  unit_price: number
  moq: number
  fabric: string
  unit: string
  active: boolean
  notes: string
  stock_on_hand: number
  reorder_level: number
  track_sizes: boolean
}

const emptyForm = (): ProductForm => ({
  sku: '',
  name: '',
  division_code: '01',
  unit_price: 0,
  moq: 50,
  fabric: '',
  unit: 'pcs',
  active: true,
  notes: '',
  stock_on_hand: 0,
  reorder_level: 20,
  track_sizes: false,
})

export default function CatalogPage() {
  const { showToast } = useToast()
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [divisionFilter, setDivisionFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)
  const [form, setForm] = useState<ProductForm>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await db
        .from('products')
        .select('*')
        .order('name')
      if (error) throw error
      setProducts((data || []) as Product[])
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to load catalog', 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    let list = products
    if (divisionFilter !== 'all') list = list.filter((p) => p.division_code === divisionFilter)
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          p.fabric.toLowerCase().includes(q),
      )
    }
    return list
  }, [products, divisionFilter, search])

  function openCreate() {
    setEditing(null)
    setForm(emptyForm())
    setOpen(true)
  }

  function openEdit(p: Product) {
    setEditing(p)
    setForm({
      sku: p.sku || '',
      name: p.name || '',
      division_code: p.division_code || '01',
      unit_price: Number(p.unit_price) || 0,
      moq: Number(p.moq) || 50,
      fabric: p.fabric || '',
      unit: p.unit || 'pcs',
      active: !!p.active,
      notes: p.notes || '',
      stock_on_hand: Number(p.stock_on_hand) || 0,
      reorder_level: Number(p.reorder_level) || 20,
      track_sizes: !!p.track_sizes,
    })
    setOpen(true)
  }

  async function save() {
    if (!form.name.trim()) {
      showToast('Name is required', 'error')
      return
    }
    setSaving(true)
    try {
      const payload = {
        ...form,
        name: form.name.trim(),
        sku: form.sku.trim(),
        updated_at: new Date().toISOString(),
      }
      if (editing) {
        const { error } = await db.from('products').update(payload).eq('id', editing.id)
        if (error) throw error
      } else {
        const { error } = await db.from('products').insert(payload)
        if (error) throw error
      }
      showToast('Product saved', 'success')
      setOpen(false)
      await load()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Save failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(p: Product) {
    const { error } = await db
      .from('products')
      .update({ active: !p.active, updated_at: new Date().toISOString() })
      .eq('id', p.id)
    if (error) {
      showToast(error.message, 'error')
      return
    }
    await load()
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setSaving(true)
    try {
      const { error } = await db.from('products').delete().eq('id', deleteTarget.id)
      if (error) throw error
      showToast('Product deleted', 'success')
      setDeleteTarget(null)
      await load()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Delete failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function syncCatalogueSkus() {
    setSyncing(true)
    try {
      const result = await syncSeedCatalog()
      showToast(
        `Catalogue SKUs synced · ${result.inserted} new · ${result.updated} updated`,
        'success',
      )
      await load()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'SKU sync failed', 'error')
    } finally {
      setSyncing(false)
    }
  }

  const brand = (code: string) => DIVISIONS.find((d) => d.code === code)?.brand || code

  const visibleCatalogues = useMemo(() => {
    if (divisionFilter === 'all') return BRAND_CATALOGUES
    return BRAND_CATALOGUES.filter((c) => c.divisionCode === divisionFilter)
  }, [divisionFilter])

  return (
    <div style={pageStyle}>
      <div style={toolbarStyle}>
        <div>
          <h1 style={pageTitleStyle}>Catalog</h1>
          <p style={pageSubtitleStyle}>Brand catalogues and products across divisions</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            style={buttonSecondaryStyle}
            disabled={syncing}
            onClick={() => void syncCatalogueSkus()}
            title="Load / refresh RR Threads catalogue SKUs"
          >
            <RefreshCw size={16} /> {syncing ? 'Syncing…' : 'Sync catalogue SKUs'}
          </button>
          <button type="button" style={buttonPrimaryStyle} onClick={openCreate}>
            <Plus size={16} /> Add product
          </button>
        </div>
      </div>

      {visibleCatalogues.length > 0 ? (
        <div style={{ marginBottom: 24 }}>
          <h2 style={sectionTitleStyle}>Brand catalogues</h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))',
              gap: 12,
            }}
          >
            {visibleCatalogues.map((c) => {
              const href = catalogueUrl(c.fileName)
              return (
                <div
                  key={c.id}
                  style={{
                    ...cardStyle,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                  }}
                >
                  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 10,
                        background: 'rgba(96,165,250,0.15)',
                        color: '#60a5fa',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <FileText size={20} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>{c.title}</div>
                      <div style={{ fontSize: 12, color: colors.muted, marginTop: 4 }}>
                        {c.brand} · {c.pages} pages · PDF
                      </div>
                      <p style={{ margin: '8px 0 0', fontSize: 13, color: colors.muted2 }}>
                        {c.description}
                      </p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ ...buttonPrimaryStyle, textDecoration: 'none' }}
                    >
                      <ExternalLink size={14} /> View PDF
                    </a>
                    <a
                      href={href}
                      download={c.fileName}
                      style={{ ...buttonSecondaryStyle, textDecoration: 'none' }}
                    >
                      <Download size={14} /> Download
                    </a>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : null}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <select style={selectStyle} value={divisionFilter} onChange={(e) => setDivisionFilter(e.target.value)}>
          <option value="all">All divisions</option>
          {DIVISIONS.map((d) => (
            <option key={d.code} value={d.code}>{d.brand}</option>
          ))}
        </select>
        <input
          style={{ ...inputStyle, maxWidth: 280 }}
          placeholder="Search SKU / name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <h2 style={sectionTitleStyle}>Products</h2>

      {loading ? (
        <div style={{ ...cardStyle, color: colors.muted }}>Loading catalog…</div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Package size={22} />}
          title="No products"
          subtitle="Add catalog items to use in quotations."
          actionLabel="Add product"
          onAction={openCreate}
        />
      ) : (
        <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
          <p style={{ margin: '0 0 12px', fontSize: 12, color: colors.muted }}>
            SKU scheme matches the Premium Catalogue (COR-001…) plus sellable fabric variants from
            quotes (e.g. COR-003-OX-GB). Use <strong>Sync catalogue SKUs</strong> to load or refresh.
          </p>
          <div style={tableWrapStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>SKU</th>
                  <th style={thStyle}>Name</th>
                  <th style={thStyle}>Division</th>
                  <th style={thStyle}>Unit price</th>
                  <th style={thStyle}>MOQ</th>
                  <th style={thStyle}>Fabric</th>
                  <th style={thStyle}>Active</th>
                  <th style={thStyle}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id}>
                    <td style={tdStyle}>{p.sku || '—'}</td>
                    <td style={tdStyle}>{p.name}</td>
                    <td style={tdStyle}>{brand(p.division_code)}</td>
                    <td style={tdStyle}>{formatAED(p.unit_price)}</td>
                    <td style={tdStyle}>{p.moq}</td>
                    <td style={tdStyle}>{p.fabric || '—'}</td>
                    <td style={tdStyle}>
                      <button
                        type="button"
                        onClick={() => void toggleActive(p)}
                        style={{
                          ...buttonSecondaryStyle,
                          padding: '4px 10px',
                          background: p.active ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.06)',
                          color: p.active ? '#4ade80' : colors.muted,
                        }}
                      >
                        {p.active ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                    <td style={tdStyle}>
                      <button type="button" style={buttonSecondaryStyle} onClick={() => openEdit(p)}>
                        <Pencil size={14} />
                      </button>{' '}
                      <button type="button" style={buttonDangerStyle} onClick={() => setDeleteTarget(p)}>
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal open={open} title={editing ? 'Edit product' : 'Add product'} onClose={() => setOpen(false)} width={520}>
        <div style={formGridStyle}>
          <div style={fieldStyle}>
            <label style={labelStyle}>SKU</label>
            <input style={inputStyle} value={form.sku} onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))} />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Name *</label>
            <input style={inputStyle} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Division</label>
            <select style={selectStyle} value={form.division_code} onChange={(e) => setForm((f) => ({ ...f, division_code: e.target.value }))}>
              {DIVISIONS.map((d) => (
                <option key={d.code} value={d.code}>{d.brand}</option>
              ))}
            </select>
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Unit price</label>
            <input type="number" style={inputStyle} value={form.unit_price} onChange={(e) => setForm((f) => ({ ...f, unit_price: Number(e.target.value) }))} />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>MOQ</label>
            <input type="number" style={inputStyle} value={form.moq} onChange={(e) => setForm((f) => ({ ...f, moq: Number(e.target.value) }))} />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Fabric</label>
            <select style={selectStyle} value={form.fabric} onChange={(e) => setForm((f) => ({ ...f, fabric: e.target.value }))}>
              {FABRIC_OPTIONS.map((f) => (
                <option key={f || 'none'} value={f}>{f || '—'}</option>
              ))}
            </select>
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Unit</label>
            <input style={inputStyle} value={form.unit} onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))} />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Stock on hand</label>
            <input
              type="number"
              style={inputStyle}
              value={form.stock_on_hand}
              onChange={(e) => setForm((f) => ({ ...f, stock_on_hand: Number(e.target.value) }))}
            />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Reorder level</label>
            <input
              type="number"
              style={inputStyle}
              value={form.reorder_level}
              onChange={(e) => setForm((f) => ({ ...f, reorder_level: Number(e.target.value) }))}
            />
          </div>
          <div style={{ ...fieldStyle, display: 'flex', alignItems: 'center', gap: 8, paddingTop: 22 }}>
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
              id="prod-active"
            />
            <label htmlFor="prod-active" style={{ fontSize: 13 }}>Active</label>
          </div>
          <div style={{ ...fieldStyle, display: 'flex', alignItems: 'center', gap: 8, paddingTop: 22 }}>
            <input
              type="checkbox"
              checked={form.track_sizes}
              onChange={(e) => setForm((f) => ({ ...f, track_sizes: e.target.checked }))}
              id="prod-sizes"
            />
            <label htmlFor="prod-sizes" style={{ fontSize: 13 }}>Track size runs</label>
          </div>
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>Notes</label>
          <textarea style={{ ...inputStyle, minHeight: 70, resize: 'vertical' }} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" style={buttonSecondaryStyle} onClick={() => setOpen(false)}>Cancel</button>
          <button type="button" style={buttonPrimaryStyle} disabled={saving} onClick={() => void save()}>Save</button>
        </div>
      </Modal>

      <Modal open={!!deleteTarget} title="Delete product?" onClose={() => setDeleteTarget(null)} width={400}>
        <p style={{ color: colors.muted, fontSize: 14 }}>
          Delete <strong style={{ color: colors.text }}>{deleteTarget?.name}</strong>?
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button type="button" style={buttonSecondaryStyle} onClick={() => setDeleteTarget(null)}>Cancel</button>
          <button type="button" style={buttonDangerStyle} disabled={saving} onClick={() => void confirmDelete()}>Delete</button>
        </div>
      </Modal>
    </div>
  )
}
