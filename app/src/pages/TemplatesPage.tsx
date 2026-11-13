import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FilePlus2, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { db } from '../lib/db'
import { DIVISIONS } from '../lib/config'
import type { QuoteTemplate } from '../lib/types'
import { useToast } from '../contexts/ToastContext'
import Modal from '../components/Modal'
import EmptyState from '../components/EmptyState'
import SimpleRowActions from '../components/SimpleRowActions'
import { newDraftLine, type DraftLineItem } from '../lib/lineItems'
import { syncSeedTemplates } from '../lib/syncTemplates'
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
  selectStyle,
  tableStyle,
  tableWrapStyle,
  tdStyle,
  thStyle,
  formGridStyle,
} from '../lib/uiStyles'
import docsStyles from '../styles/docsList.module.css'
import { errorMessage } from '../lib/errors'
import { parseQuoteTemplateForm } from '../lib/schemas/quoteTemplate'

type TemplateForm = {
  name: string
  division_code: string
  description: string
  items: DraftLineItem[]
}

const emptyForm = (): TemplateForm => ({
  name: '',
  division_code: '01',
  description: '',
  items: [newDraftLine()],
})

function parseItems(json: unknown): DraftLineItem[] {
  if (!Array.isArray(json) || json.length === 0) return [newDraftLine()]
  return json.map((row) => {
    const r = row as {
      description?: string
      qty?: number
      unit_price?: number
      remarks?: string
      sku?: string
    }
    return newDraftLine({
      description: r.description || '',
      qty: Number(r.qty) || 1,
      unit_price: Number(r.unit_price) || 0,
      remarks: r.remarks || '',
      sku: r.sku || '',
    })
  })
}

export default function TemplatesPage() {
  const { showToast } = useToast()
  const navigate = useNavigate()
  const [templates, setTemplates] = useState<QuoteTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<QuoteTemplate | null>(null)
  const [form, setForm] = useState<TemplateForm>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<QuoteTemplate | null>(null)
  const [actionsOpenId, setActionsOpenId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await db
        .from('quote_templates')
        .select('*')
        .order('name')
      if (error) throw error
      setTemplates((data || []) as QuoteTemplate[])
    } catch (e) {
      showToast(errorMessage(e, 'Failed to load templates'), 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    void load()
  }, [load])

  function openCreate() {
    setEditing(null)
    setForm(emptyForm())
    setOpen(true)
  }

  function openEdit(t: QuoteTemplate) {
    setEditing(t)
    setForm({
      name: t.name || '',
      division_code: t.division_code || '01',
      description: t.description || '',
      items: parseItems(t.items_json),
    })
    setOpen(true)
  }

  async function save() {
    const parsed = parseQuoteTemplateForm(form)
    if (!parsed.ok) {
      showToast(parsed.error, 'error')
      return
    }
    setSaving(true)
    try {
      const payload = {
        name: parsed.data.name,
        division_code: parsed.data.division_code,
        description: parsed.data.description,
        items_json: parsed.data.items_json,
      }
      if (editing) {
        const { error } = await db.from('quote_templates').update(payload).eq('id', editing.id)
        if (error) throw error
      } else {
        const { error } = await db.from('quote_templates').insert(payload)
        if (error) throw error
      }
      showToast('Template saved', 'success')
      setOpen(false)
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Save failed'), 'error')
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setSaving(true)
    try {
      const { error } = await db.from('quote_templates').delete().eq('id', deleteTarget.id)
      if (error) throw error
      showToast('Template deleted', 'success')
      setDeleteTarget(null)
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Delete failed'), 'error')
    } finally {
      setSaving(false)
    }
  }

  async function syncSkuTemplates() {
    setSyncing(true)
    try {
      const r = await syncSeedTemplates()
      showToast(`Templates synced · ${r.inserted} new · ${r.updated} updated`, 'success')
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Template sync failed'), 'error')
    } finally {
      setSyncing(false)
    }
  }

  const brand = (code: string) => DIVISIONS.find((d) => d.code === code)?.brand || code

  return (
    <div className={docsStyles.page}>
      <header className={docsStyles.hero}>
        <div>
          <p className={docsStyles.kicker}>Operations</p>
          <h1 className={docsStyles.title}>Templates</h1>
          <p className={docsStyles.subtitle}>Reusable quotation line-item sets</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className={docsStyles.newBtn}
            style={{ background: 'rgba(255,255,255,0.08)' }}
            disabled={syncing}
            onClick={() => void syncSkuTemplates()}
          >
            <RefreshCw size={16} /> {syncing ? 'Syncing…' : 'Load SKU templates'}
          </button>
          <button type="button" className={docsStyles.newBtn} onClick={openCreate}>
            <Plus size={16} /> New template
          </button>
        </div>
      </header>

      {loading ? (
        <div style={{ ...cardStyle, color: colors.muted }}>Loading templates…</div>
      ) : templates.length === 0 ? (
        <EmptyState
          icon={<FilePlus2 size={22} />}
          title="No templates"
          subtitle="Load Corporate / Hospitality SKU templates, or create your own."
          actionLabel="Load SKU templates"
          onAction={() => void syncSkuTemplates()}
        />
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {templates.map((t) => {
            const items = Array.isArray(t.items_json) ? t.items_json : []
            return (
              <div key={t.id} style={cardStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>{t.name}</div>
                    <div style={{ fontSize: 13, color: colors.muted, marginTop: 4 }}>
                      {brand(t.division_code)} · {items.length} item{items.length === 1 ? '' : 's'}
                    </div>
                    {t.description ? (
                      <div style={{ fontSize: 13, color: colors.muted2, marginTop: 6 }}>{t.description}</div>
                    ) : null}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                    <button
                      type="button"
                      style={buttonPrimaryStyle}
                      onClick={() => navigate(`/quotations?template=${t.id}`)}
                    >
                      Create quote
                    </button>
                    <SimpleRowActions
                      expanded={actionsOpenId === t.id}
                      onToggle={() => setActionsOpenId((id) => (id === t.id ? null : t.id))}
                      onEdit={() => openEdit(t)}
                      onDelete={() => setDeleteTarget(t)}
                    />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Modal open={open} title={editing ? 'Edit template' : 'New template'} onClose={() => setOpen(false)} width={720}>
        <div style={formGridStyle}>
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
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>Description</label>
          <input style={inputStyle} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', margin: '8px 0' }}>
          <strong style={{ fontSize: 14 }}>Items</strong>
          <button
            type="button"
            style={buttonSecondaryStyle}
            onClick={() => setForm((f) => ({ ...f, items: [...f.items, newDraftLine()] }))}
          >
            <Plus size={14} /> Row
          </button>
        </div>
        <div style={tableWrapStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Description</th>
                <th style={thStyle}>Qty</th>
                <th style={thStyle}>Price</th>
                <th style={thStyle}></th>
              </tr>
            </thead>
            <tbody>
              {form.items.map((it) => (
                <tr key={it.key}>
                  <td style={tdStyle}>
                    <input
                      style={inputStyle}
                      value={it.description}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          items: f.items.map((x) => (x.key === it.key ? { ...x, description: e.target.value } : x)),
                        }))
                      }
                    />
                  </td>
                  <td style={{ ...tdStyle, width: 90 }}>
                    <input
                      type="number"
                      style={inputStyle}
                      value={it.qty}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          items: f.items.map((x) => (x.key === it.key ? { ...x, qty: Number(e.target.value) } : x)),
                        }))
                      }
                    />
                  </td>
                  <td style={{ ...tdStyle, width: 120 }}>
                    <input
                      type="number"
                      style={inputStyle}
                      value={it.unit_price}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          items: f.items.map((x) =>
                            x.key === it.key ? { ...x, unit_price: Number(e.target.value) } : x,
                          ),
                        }))
                      }
                    />
                    <div style={{ fontSize: 11, color: colors.muted2, marginTop: 4 }}>
                      {formatAED((Number(it.qty) || 0) * (Number(it.unit_price) || 0))}
                    </div>
                  </td>
                  <td style={tdStyle}>
                    <button
                      type="button"
                      style={buttonDangerStyle}
                      disabled={form.items.length <= 1}
                      onClick={() =>
                        setForm((f) => ({ ...f, items: f.items.filter((x) => x.key !== it.key) }))
                      }
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button type="button" style={buttonSecondaryStyle} onClick={() => setOpen(false)}>Cancel</button>
          <button type="button" style={buttonPrimaryStyle} disabled={saving} onClick={() => void save()}>Save</button>
        </div>
      </Modal>

      <Modal open={!!deleteTarget} title="Delete template?" onClose={() => setDeleteTarget(null)} width={400}>
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
