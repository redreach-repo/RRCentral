import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FilePlus2, Pencil, Plus, Trash2 } from 'lucide-react'
import { db } from '../lib/db'
import { DIVISIONS } from '../lib/config'
import type { QuoteTemplate } from '../lib/types'
import { useToast } from '../contexts/ToastContext'
import Modal from '../components/Modal'
import EmptyState from '../components/EmptyState'
import { newDraftLine, type DraftLineItem } from '../lib/lineItems'
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
} from '../lib/uiStyles'

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
    const r = row as { description?: string; qty?: number; unit_price?: number; remarks?: string }
    return newDraftLine({
      description: r.description || '',
      qty: Number(r.qty) || 1,
      unit_price: Number(r.unit_price) || 0,
      remarks: r.remarks || '',
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
  const [deleteTarget, setDeleteTarget] = useState<QuoteTemplate | null>(null)

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
      showToast(e instanceof Error ? e.message : 'Failed to load templates', 'error')
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
    if (!form.name.trim()) {
      showToast('Name is required', 'error')
      return
    }
    setSaving(true)
    try {
      const items_json = form.items
        .filter((i) => i.description.trim() || i.unit_price)
        .map((i) => ({
          description: i.description.trim(),
          qty: Number(i.qty) || 0,
          unit_price: Number(i.unit_price) || 0,
          remarks: i.remarks || '',
        }))
      const payload = {
        name: form.name.trim(),
        division_code: form.division_code,
        description: form.description.trim(),
        items_json,
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
      showToast(e instanceof Error ? e.message : 'Save failed', 'error')
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
      showToast(e instanceof Error ? e.message : 'Delete failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  const brand = (code: string) => DIVISIONS.find((d) => d.code === code)?.brand || code

  return (
    <div style={pageStyle}>
      <div style={toolbarStyle}>
        <div>
          <h1 style={pageTitleStyle}>Templates</h1>
          <p style={pageSubtitleStyle}>Reusable quotation line-item sets</p>
        </div>
        <button type="button" style={buttonPrimaryStyle} onClick={openCreate}>
          <Plus size={16} /> New template
        </button>
      </div>

      {loading ? (
        <div style={{ ...cardStyle, color: colors.muted }}>Loading templates…</div>
      ) : templates.length === 0 ? (
        <EmptyState
          icon={<FilePlus2 size={22} />}
          title="No templates"
          subtitle="Save common quote line items as templates."
          actionLabel="New template"
          onAction={openCreate}
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
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      style={buttonPrimaryStyle}
                      onClick={() => navigate(`/quotations?template=${t.id}`)}
                    >
                      Create quote
                    </button>
                    <button type="button" style={buttonSecondaryStyle} onClick={() => openEdit(t)}>
                      <Pencil size={14} />
                    </button>
                    <button type="button" style={buttonDangerStyle} onClick={() => setDeleteTarget(t)}>
                      <Trash2 size={14} />
                    </button>
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
