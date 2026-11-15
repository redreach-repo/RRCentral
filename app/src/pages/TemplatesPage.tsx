import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FilePlus2, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { db } from '../lib/db'
import { DIVISIONS } from '../lib/config'
import type { QuoteTemplate } from '../lib/types'
import { useAuth } from '../contexts/AuthContext'
import { useI18n } from '../contexts/I18nContext'
import { useToast } from '../contexts/ToastContext'
import Modal from '../components/Modal'
import EmptyState from '../components/EmptyState'
import SavedViewsBar from '../components/SavedViewsBar'
import SimpleRowActions from '../components/SimpleRowActions'
import { newDraftLine, type DraftLineItem } from '../lib/lineItems'
import { syncSeedTemplates } from '../lib/syncTemplates'
import { formatAED } from '../lib/money'
import { QUOTE_TEMPLATES_CSV_COLUMNS } from '../lib/quoteTemplatesCsv'
import { csvRowsToObjects, exportListCsv, parseCsv, parseListIoRows } from '../lib/listIo'
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
  const { t } = useI18n()
  const { appUserId } = useAuth()
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
  const [showArchived, setShowArchived] = useState(false)
  const [importing, setImporting] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)
  const templatesViewFilters = useMemo(
    () => ({ archived: showArchived ? '1' : '0' }),
    [showArchived],
  )

  const load = useCallback(async () => {
    setLoading(true)
    try {
      let q = db.from('quote_templates').select('*').order('name')
      if (!showArchived) q = q.is('deleted_at', null)
      const { data, error } = await q
      if (error) throw error
      setTemplates((data || []) as QuoteTemplate[])
    } catch (e) {
      showToast(errorMessage(e, 'Failed to load templates'), 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast, showArchived])

  useEffect(() => {
    void load()
  }, [load])

  function openCreate() {
    setEditing(null)
    setForm(emptyForm())
    setOpen(true)
  }

  function openEdit(tpl: QuoteTemplate) {
    setEditing(tpl)
    setForm({
      name: tpl.name || '',
      division_code: tpl.division_code || '01',
      description: tpl.description || '',
      items: parseItems(tpl.items_json),
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
    const archived = Boolean(deleteTarget.deleted_at)
    setSaving(true)
    try {
      if (archived) {
        const { error } = await db
          .from('quote_templates')
          .update({ deleted_at: null })
          .eq('id', deleteTarget.id)
        if (error) throw error
        showToast('Template restored', 'success')
      } else {
        const { error } = await db
          .from('quote_templates')
          .update({ deleted_at: new Date().toISOString() })
          .eq('id', deleteTarget.id)
        if (error) throw error
        showToast('Template archived', 'success')
      }
      setDeleteTarget(null)
      await load()
    } catch (e) {
      showToast(errorMessage(e, archived ? 'Restore failed' : 'Archive failed'), 'error')
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

  async function importTemplatesCsv(file: File) {
    setImporting(true)
    try {
      const text = await file.text()
      const { headers, rows } = parseCsv(text)
      const objects = csvRowsToObjects(headers, rows).map((row) => {
        const normalized: Record<string, string> = {}
        for (const c of QUOTE_TEMPLATES_CSV_COLUMNS) {
          normalized[c.key] = String(row[c.label] ?? row[c.key] ?? '').trim()
        }
        return normalized
      })
      const { ok, errors } = parseListIoRows(objects, QUOTE_TEMPLATES_CSV_COLUMNS)
      if (!ok.length && errors.length) {
        showToast(errors[0] || 'No valid quote template rows', 'error')
        return
      }
      const divisionCodes = new Set(DIVISIONS.map((d) => d.code as string))
      let saved = 0
      let skipped = errors.length
      for (const row of ok) {
        const division = DIVISIONS.find((d) => d.code === row.division_code)
        if (!division || !divisionCodes.has(row.division_code)) {
          skipped += 1
          continue
        }
        let items_json: unknown = []
        if (row.items_json) {
          try {
            items_json = JSON.parse(row.items_json)
          } catch {
            skipped += 1
            continue
          }
        }
        const { error } = await db.from('quote_templates').insert({
          name: row.name,
          division_code: division.code,
          description: row.description || '',
          items_json,
        })
        if (error) {
          skipped += 1
          continue
        }
        saved += 1
      }
      const skipNote = skipped ? ` · ${skipped} row(s) skipped` : ''
      showToast(`Imported ${saved} quote template(s)${skipNote}`, 'success')
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Quote templates CSV import failed'), 'error')
    } finally {
      setImporting(false)
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

  const brand = (code: string) => DIVISIONS.find((d) => d.code === code)?.brand || code
  const deleteArchived = Boolean(deleteTarget?.deleted_at)

  return (
    <div className={docsStyles.page}>
      <header className={docsStyles.hero}>
        <div>
          <p className={docsStyles.kicker}>{t('page.ops.kicker')}</p>
          <h1 className={docsStyles.title}>{t('page.quoteTemplates.title')}</h1>
          <p className={docsStyles.subtitle}>{t('page.quoteTemplates.subtitle')}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            ref={importInputRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void importTemplatesCsv(file)
            }}
          />
          <button
            type="button"
            className={docsStyles.newBtn}
            style={{ background: 'transparent', color: 'inherit', border: '1px solid var(--border)' }}
            disabled={importing}
            onClick={() => importInputRef.current?.click()}
          >
            {importing ? 'Importing…' : 'Import CSV'}
          </button>
          <button
            type="button"
            className={docsStyles.newBtn}
            style={{ background: 'transparent', color: 'inherit', border: '1px solid var(--border)' }}
            disabled={!templates.length}
            onClick={() => {
              exportListCsv(
                'quote-templates.csv',
                QUOTE_TEMPLATES_CSV_COLUMNS.map((c) => c.key),
                templates.map((tpl) => ({
                  name: tpl.name,
                  division_code: tpl.division_code,
                  description: tpl.description || '',
                  items_json: JSON.stringify(tpl.items_json ?? []),
                })),
              )
              showToast('Quote templates CSV downloaded', 'success')
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
            disabled={syncing}
            onClick={() => void syncSkuTemplates()}
          >
            <RefreshCw size={16} />{' '}
            {syncing ? t('page.quoteTemplates.syncing') : t('page.quoteTemplates.syncSkus')}
          </button>
          <button type="button" className={docsStyles.newBtn} onClick={openCreate}>
            <Plus size={16} /> {t('page.quoteTemplates.new')}
          </button>
        </div>
      </header>

      <SavedViewsBar
        moduleId="quote_templates"
        filters={templatesViewFilters}
        ownerUserId={appUserId}
        canWrite
        applyDefaultOnLoad={false}
        onApply={(f) => setShowArchived(String(f.archived || '0') === '1')}
        onToast={showToast}
        filtersEqual={(a, b) => String(a.archived || '0') === String(b.archived || '0')}
      />

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
          {templates.map((tpl) => {
            const items = Array.isArray(tpl.items_json) ? tpl.items_json : []
            const archived = Boolean(tpl.deleted_at)
            return (
              <div key={tpl.id} style={cardStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>
                      {tpl.name}
                      {archived ? (
                        <span style={{ color: colors.muted, fontWeight: 400, fontSize: 13 }}> · archived</span>
                      ) : null}
                    </div>
                    <div style={{ fontSize: 13, color: colors.muted, marginTop: 4 }}>
                      {brand(tpl.division_code)} · {items.length} item{items.length === 1 ? '' : 's'}
                    </div>
                    {tpl.description ? (
                      <div style={{ fontSize: 13, color: colors.muted2, marginTop: 6 }}>{tpl.description}</div>
                    ) : null}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                    {!archived ? (
                      <button
                        type="button"
                        style={buttonPrimaryStyle}
                        onClick={() => navigate(`/quotations?template=${tpl.id}`)}
                      >
                        Create quote
                      </button>
                    ) : (
                      <button
                        type="button"
                        style={buttonSecondaryStyle}
                        onClick={() => setDeleteTarget(tpl)}
                      >
                        Restore
                      </button>
                    )}
                    {!archived ? (
                      <SimpleRowActions
                        expanded={actionsOpenId === tpl.id}
                        onToggle={() => setActionsOpenId((id) => (id === tpl.id ? null : tpl.id))}
                        onEdit={() => openEdit(tpl)}
                        onDelete={() => setDeleteTarget(tpl)}
                        deleteLabel="Archive"
                      />
                    ) : null}
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

      <Modal
        open={!!deleteTarget}
        title={deleteArchived ? 'Restore template?' : 'Archive template?'}
        onClose={() => setDeleteTarget(null)}
        width={400}
      >
        <p style={{ color: colors.muted, fontSize: 14 }}>
          {deleteArchived ? 'Restore' : 'Archive'}{' '}
          <strong style={{ color: colors.text }}>{deleteTarget?.name}</strong>?
          {!deleteArchived ? ' Use Show archived to restore later.' : ''}
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button type="button" style={buttonSecondaryStyle} onClick={() => setDeleteTarget(null)}>Cancel</button>
          <button
            type="button"
            style={deleteArchived ? buttonPrimaryStyle : buttonDangerStyle}
            disabled={saving}
            onClick={() => void confirmDelete()}
          >
            {deleteArchived ? 'Restore' : 'Archive'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
