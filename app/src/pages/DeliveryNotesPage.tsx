import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { format } from 'date-fns'
import { Link2, Paperclip, Plus, Truck } from 'lucide-react'
import DeliveryNoteRowActions from '../components/deliveryNotes/DeliveryNoteRowActions'
import docsStyles from '../styles/docsList.module.css'
import { db } from '../lib/db'
import { DELIVERY_NOTE_STATUSES, DELIVERY_TERMS } from '../lib/config'
import type { Attachment, DeliveryNote, Quotation } from '../lib/types'
import { useAuth } from '../contexts/AuthContext'
import { useI18n } from '../contexts/I18nContext'
import { useSettings } from '../contexts/SettingsContext'
import { useToast } from '../contexts/ToastContext'
import Modal from '../components/Modal'
import EditorSectionTabs, {
  editorPanelStyle,
  type EditorSection,
} from '../components/EditorSectionTabs'
import LinkDriveFileModal from '../components/LinkDriveFileModal'
import StatusPill from '../components/StatusPill'
import EmptyState from '../components/EmptyState'
import SavedViewsBar from '../components/SavedViewsBar'
import { logActivity } from '../lib/activity'
import {
  canCreateDeliveryNoteFromQuote,
  createDeliveryNoteFromQuote,
  deliveryNoteTotalQty,
  matchQuoteForDeliveryNote,
  toDeliveryNoteLineDrafts,
} from '../lib/deliveryNotes'
import {
  deleteDeliveryNote,
  insertDeliveryNote,
  listDeliveryNotes,
  loadDeliveryNoteLineItems,
  restoreDeliveryNote,
  saveDeliveryNoteLineItems,
  updateDeliveryNote,
  type DeliveryNoteRow,
} from '../lib/deliveryNoteStore'
import { DELIVERY_NOTES_CSV_COLUMNS } from '../lib/deliveryNotesCsv'
import {
  deleteSignedDeliveryNoteAttachment,
  loadSignedDeliveryNoteAttachments,
} from '../lib/signedDeliveryNotes'
import { errorMessage } from '../lib/errors'
import { csvRowsToObjects, exportListCsv, parseCsv, parseListIoRows } from '../lib/listIo'
import { parseDeliveryNoteForm } from '../lib/schemas/deliveryNote'
import { parseDeliveryNoteFromQuoteForm } from '../lib/schemas/deliveryNoteFromQuote'
import { type DraftLineItem } from '../lib/lineItems'
import { sortByDateDesc } from '../lib/finance'
import {
  buttonDangerStyle,
  buttonPrimaryStyle,
  buttonSecondaryStyle,
  colors,
  fieldStyle,
  inputStyle,
  labelStyle,
  selectStyle,
  tableStyle,
  tableWrapStyle,
  tdStyle,
  thStyle,
} from '../lib/uiStyles'

interface NoteForm {
  delivery_date: string
  status: string
  delivery_terms: string
  ship_to: string
  notes: string
  received_by: string
  vehicle_notes: string
  items: DraftLineItem[]
}

const emptyForm = (): NoteForm => ({
  delivery_date: format(new Date(), 'yyyy-MM-dd'),
  status: 'Issued',
  delivery_terms: '',
  ship_to: '',
  notes: '',
  received_by: '',
  vehicle_notes: '',
  items: [],
})

type StatusTab = 'All' | 'Draft' | 'Issued' | 'Delivered'

export default function DeliveryNotesPage() {
  const { t } = useI18n()
  const { user, appUserId } = useAuth()
  const { settings } = useSettings()
  const { showToast } = useToast()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const who = user?.email || ''
  const prefix = settings.deliveryNotePrefix || 'DN'

  const [notes, setNotes] = useState<DeliveryNoteRow[]>([])
  const [quotes, setQuotes] = useState<Quotation[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<StatusTab>('All')
  const [showArchived, setShowArchived] = useState(false)
  const dnViewFilters = useMemo(
    () => ({ tab, archived: showArchived ? '1' : '0' }),
    [tab, showArchived],
  )
  const [importing, setImporting] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)
  const [actionsOpenId, setActionsOpenId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [quotePick, setQuotePick] = useState('')
  const [quoteFilter, setQuoteFilter] = useState('')
  const [editing, setEditing] = useState<DeliveryNote | null>(null)
  const [editorSection, setEditorSection] = useState<EditorSection>('basics')
  const [form, setForm] = useState<NoteForm>(emptyForm())
  const [signedAttachments, setSignedAttachments] = useState<Attachment[]>([])
  const [linkSignedOpen, setLinkSignedOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<DeliveryNote | null>(null)

  function closeEdit() {
    setEditing(null)
    setEditorSection('basics')
    setSignedAttachments([])
    setLinkSignedOpen(false)
  }

  async function refreshSignedAttachments(note: DeliveryNote) {
    const rows = await loadSignedDeliveryNoteAttachments(note)
    setSignedAttachments(rows)
  }

  async function removeSignedAttachment(id: string) {
    try {
      await deleteSignedDeliveryNoteAttachment(id)
      setSignedAttachments((prev) => prev.filter((a) => a.id !== id))
      showToast('Signed copy removed', 'success')
    } catch (e) {
      showToast(errorMessage(e, 'Could not remove signed copy'), 'error')
    }
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [notesRows, qRes] = await Promise.all([
        listDeliveryNotes({ includeDeleted: showArchived }),
        db.from('quotations').select('*').order('created_at', { ascending: false }),
      ])
      if (qRes.error) throw qRes.error
      setNotes(sortByDateDesc(notesRows))
      setQuotes((qRes.data || []) as Quotation[])
    } catch (e) {
      showToast(errorMessage(e, 'Failed to load delivery notes'), 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast, showArchived])

  useEffect(() => {
    void load()
  }, [load])

  async function importDeliveryNotesCsv(file: File) {
    setImporting(true)
    try {
      const text = await file.text()
      const { headers, rows } = parseCsv(text)
      const objects = csvRowsToObjects(headers, rows).map((row) => {
        const normalized: Record<string, string> = {}
        for (const c of DELIVERY_NOTES_CSV_COLUMNS) {
          normalized[c.key] = String(row[c.label] ?? row[c.key] ?? '').trim()
        }
        return normalized
      })
      const { ok, errors } = parseListIoRows(objects, DELIVERY_NOTES_CSV_COLUMNS)
      if (!ok.length && errors.length) {
        showToast(errors[0] || 'No valid delivery note rows', 'error')
        return
      }
      let saved = 0
      const now = new Date().toISOString()
      for (const row of ok) {
        const status = (DELIVERY_NOTE_STATUSES as readonly string[]).includes(row.status)
          ? row.status
          : 'Draft'
        const quote =
          quotes.find(
            (q) =>
              q.reference_number === row.quote_ref ||
              q.quote_id === row.quote_ref ||
              q.id === row.quote_ref,
          ) || null
        await insertDeliveryNote({
          id: crypto.randomUUID(),
          client: row.client,
          vertical: quote?.vertical || '',
          division_code: quote?.division_code || '01',
          reference_number: '',
          date: format(new Date(), 'yyyy-MM-dd'),
          delivery_date: row.delivery_date || null,
          description: '',
          quote_ref: row.quote_ref || quote?.reference_number || '',
          quote_id: quote?.quote_id || quote?.id || '',
          status,
          delivery_terms: quote?.delivery_terms || DELIVERY_TERMS[0] || '',
          ship_to: row.ship_to || '',
          notes: row.notes || '',
          received_by: '',
          vehicle_notes: '',
          created_by: who,
          updated_by: who,
          created_at: now,
          updated_at: now,
        })
        saved += 1
      }
      const skipNote = errors.length ? ` · ${errors.length} row(s) skipped` : ''
      showToast(`Imported ${saved} delivery note draft(s)${skipNote}`, 'success')
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Delivery note CSV import failed'), 'error')
    } finally {
      setImporting(false)
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

  useEffect(() => {
    if (loading) return
    const query =
      searchParams.get('quote') ||
      searchParams.get('ref') ||
      searchParams.get('client') ||
      ''
    if (!query) return
    const match = matchQuoteForDeliveryNote(quotes, query)
    setQuoteFilter(query)
    setCreateOpen(true)
    if (match) setQuotePick(match.id)
    setSearchParams({}, { replace: true })
  }, [loading, quotes, searchParams, setSearchParams])

  const eligibleQuotes = useMemo(() => {
    const all = quotes.filter(canCreateDeliveryNoteFromQuote)
    const q = quoteFilter.trim().toLowerCase()
    if (!q) return all
    return all.filter((row) =>
      `${row.reference_number} ${row.client} ${row.status}`.toLowerCase().includes(q),
    )
  }, [quotes, quoteFilter])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return notes.filter((n) => {
      if (tab !== 'All' && n.status !== tab) return false
      if (!q) return true
      return (
        n.client.toLowerCase().includes(q) ||
        n.reference_number.toLowerCase().includes(q) ||
        n.quote_ref.toLowerCase().includes(q) ||
        n.description.toLowerCase().includes(q)
      )
    })
  }, [notes, search, tab])

  async function createFromQuote() {
    const parsed = parseDeliveryNoteFromQuoteForm({ quoteId: quotePick })
    if (!parsed.ok) {
      showToast(parsed.error, 'error')
      return
    }
    const quote = quotes.find((q) => q.id === parsed.data.quoteId)
    if (!quote) {
      showToast('Select a quotation', 'error')
      return
    }
    setSaving(true)
    try {
      const note = await createDeliveryNoteFromQuote({ quote, who, prefix })
      showToast(`Delivery note ${note.reference_number} created`, 'success')
      setCreateOpen(false)
      setQuotePick('')
      navigate(`/document/delivery-note/${note.id}`)
    } catch (e) {
      showToast(errorMessage(e, 'Could not create delivery note'), 'error')
    } finally {
      setSaving(false)
    }
  }

  async function openEdit(note: DeliveryNote) {
    try {
      const items = await loadDeliveryNoteLineItems(note.reference_number)
      setEditorSection('basics')
      setEditing(note)
            setForm({
        delivery_date: (note.delivery_date || note.date || '').slice(0, 10),
        status: note.status || 'Issued',
        delivery_terms: note.delivery_terms || '',
        ship_to: note.ship_to || '',
        notes: note.notes || '',
        received_by: note.received_by || '',
        vehicle_notes: note.vehicle_notes || '',
        items: toDeliveryNoteLineDrafts(items),
      })
      void refreshSignedAttachments(note).catch((e) => {
        showToast(errorMessage(e, 'Failed to load signed copies'), 'error')
      })
    } catch (e) {
      showToast(errorMessage(e, 'Failed to load line items'), 'error')
    }
  }

  function updateItem(key: string, patch: Partial<DraftLineItem>) {
    setForm((f) => ({
      ...f,
      items: f.items.map((it) => (it.key === key ? { ...it, ...patch } : it)),
    }))
  }

  async function saveNote() {
    if (!editing) return
    const parsed = parseDeliveryNoteForm({
      delivery_date: form.delivery_date,
      status: form.status,
      delivery_terms: form.delivery_terms,
      ship_to: form.ship_to,
      notes: form.notes,
      received_by: form.received_by,
      vehicle_notes: form.vehicle_notes,
    })
    if (!parsed.ok) {
      showToast(parsed.error, 'error')
      return
    }
    const f = parsed.data
    setSaving(true)
    try {
      await updateDeliveryNote(editing.id, {
        delivery_date: f.delivery_date || null,
        status: f.status,
        delivery_terms: f.delivery_terms,
        ship_to: f.ship_to,
        notes: f.notes,
        received_by: f.received_by,
        vehicle_notes: f.vehicle_notes,
        updated_by: who,
        updated_at: new Date().toISOString(),
      })
      await saveDeliveryNoteLineItems(editing.reference_number, form.items)
      await logActivity('update_delivery_note', 'delivery_note', editing.reference_number, editing.client, who)
      showToast('Delivery note saved', 'success')
      closeEdit()
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Save failed'), 'error')
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    const archived = Boolean((deleteTarget as DeliveryNoteRow).deleted_at)
    setSaving(true)
    try {
      if (archived) {
        await restoreDeliveryNote(deleteTarget.id)
        showToast('Delivery note restored', 'success')
        setDeleteTarget(null)
        await load()
        return
      }
      // Soft-archive keeps line items so restore is lossless.
      await deleteDeliveryNote(deleteTarget.id)
      await logActivity(
        'delete_delivery_note',
        'delivery_note',
        deleteTarget.reference_number,
        deleteTarget.client,
        who,
      )
      showToast('Delivery note archived', 'success')
      setDeleteTarget(null)
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Archive failed'), 'error')
    } finally {
      setSaving(false)
    }
  }

  function renderActions(note: DeliveryNote) {
    return (
      <DeliveryNoteRowActions
        note={note}
        expanded={actionsOpenId === note.id}
        onToggle={() => setActionsOpenId((id) => (id === note.id ? null : note.id))}
        onEdit={(row) => void openEdit(row)}
        onDelete={(row) => setDeleteTarget(row)}
      />
    )
  }

  return (
    <div className={docsStyles.page}>
      <header className={docsStyles.hero}>
        <div>
          <p className={docsStyles.kicker}>{t('page.docs.kicker')}</p>
          <h1 className={docsStyles.title}>{t('page.deliveryNotes.title')}</h1>
          <p className={docsStyles.subtitle}>{t('page.deliveryNotes.subtitle')}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            ref={importInputRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void importDeliveryNotesCsv(file)
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
            disabled={!notes.length}
            onClick={() => {
              exportListCsv(
                'delivery-notes.csv',
                ['reference_number', 'client', 'quote_ref', 'status', 'delivery_date', 'ship_to', 'notes'],
                notes.map((n) => ({
                  reference_number: n.reference_number,
                  client: n.client,
                  quote_ref: n.quote_ref,
                  status: n.status,
                  delivery_date: n.delivery_date || '',
                  ship_to: n.ship_to,
                  notes: n.notes || '',
                })),
              )
              showToast('Delivery notes CSV downloaded', 'success')
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
          <button type="button" className={docsStyles.newBtn} onClick={() => setCreateOpen(true)}>
            <Plus size={16} /> {t('page.deliveryNotes.new')}
          </button>
        </div>
      </header>

      <SavedViewsBar
        moduleId="delivery_notes"
        filters={dnViewFilters}
        ownerUserId={appUserId}
        canWrite
        applyDefaultOnLoad={false}
        onApply={(f) => {
          const next = String(f.tab || 'All') as StatusTab
          const allowed: StatusTab[] = ['All', 'Draft', 'Issued', 'Delivered']
          setTab(allowed.includes(next) ? next : 'All')
          setShowArchived(String(f.archived || '0') === '1')
        }}
        onToast={showToast}
        filtersEqual={(a, b) =>
          String(a.tab || 'All') === String(b.tab || 'All') &&
          String(a.archived || '0') === String(b.archived || '0')
        }
      />

      <div className={docsStyles.controls}>
        <div className={docsStyles.tabs}>
          {(['All', 'Draft', 'Issued', 'Delivered'] as StatusTab[]).map((t) => (
            <button
              key={t}
              type="button"
              className={tab === t ? docsStyles.tabActive : docsStyles.tab}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
        </div>
        <input
          className={docsStyles.search}
          placeholder="Search client / quote / DN…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className={docsStyles.loading}>Loading delivery notes…</div>
      ) : filtered.length === 0 ? (
        <div className={docsStyles.empty}>
          <EmptyState
            icon={<Truck size={22} />}
            title="No delivery notes"
            subtitle="Create a delivery note from a finalized or awarded quotation."
            actionLabel="From quotation"
            onAction={() => setCreateOpen(true)}
          />
        </div>
      ) : (
        <div className={docsStyles.tableShell}>
          <div className={docsStyles.tableWrap}>
            <table className={docsStyles.table}>
              <thead>
                <tr>
                  <th className={docsStyles.colRef}>Reference</th>
                  <th className={docsStyles.colClient}>Client</th>
                  <th className={docsStyles.colDivision}>Quotation</th>
                  <th className={docsStyles.colDate}>Date</th>
                  <th className={docsStyles.colStatus}>Status</th>
                  <th className={docsStyles.colActions} style={{ textAlign: 'right' }}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((note) => (
                  <tr
                    key={note.id}
                    className={actionsOpenId === note.id ? docsStyles.rowExpanded : undefined}
                  >
                    <td className={docsStyles.colRef}>
                      <div className={docsStyles.ref}>{note.reference_number || '—'}</div>
                    </td>
                    <td className={`${docsStyles.colClient} ${docsStyles.clientCell}`}>
                      {note.client || '—'}
                    </td>
                    <td className={docsStyles.colDivision}>{note.quote_ref || '—'}</td>
                    <td className={docsStyles.colDate}>
                      {note.date ? format(new Date(note.date), 'dd MMM yyyy') : '—'}
                    </td>
                    <td className={docsStyles.colStatus}>
                      <StatusPill status={note.status} />
                    </td>
                    <td className={`${docsStyles.colActions} ${docsStyles.actionsCell}`}>
                      {renderActions(note)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal open={createOpen} title="Delivery note from quotation" onClose={() => setCreateOpen(false)} width={520}>
        <p style={{ color: colors.muted, fontSize: 14, marginTop: 0, lineHeight: 1.5 }}>
          Copies line items and quantities from the quotation. Prices are omitted — this is a goods
          receipt, not an invoice.
        </p>
        <div style={fieldStyle}>
          <label style={labelStyle}>Find quotation</label>
          <input
            style={inputStyle}
            placeholder="Maxtherm or RR-01-26003"
            value={quoteFilter}
            onChange={(e) => setQuoteFilter(e.target.value)}
          />
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>Quotation</label>
          <select style={selectStyle} value={quotePick} onChange={(e) => setQuotePick(e.target.value)}>
            <option value="">Select a quotation…</option>
            {eligibleQuotes.map((q) => (
              <option key={q.id} value={q.id}>
                {q.reference_number} — {q.client || 'No client'} ({q.status})
              </option>
            ))}
          </select>
        </div>
        {quotes.filter(canCreateDeliveryNoteFromQuote).length === 0 ? (
          <p style={{ color: colors.muted, fontSize: 13 }}>
            No eligible quotations. Finalize a quotation first, then return here.
          </p>
        ) : eligibleQuotes.length === 0 ? (
          <p style={{ color: colors.muted, fontSize: 13 }}>
            No quotation matches “{quoteFilter}”. Try the exact ref RR-01-26003 or the client name.
          </p>
        ) : null}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
          <button type="button" style={buttonSecondaryStyle} onClick={() => setCreateOpen(false)}>
            Cancel
          </button>
          <button
            type="button"
            style={buttonPrimaryStyle}
            disabled={saving || !quotePick}
            onClick={() => void createFromQuote()}
          >
            {saving ? 'Creating…' : 'Create delivery note'}
          </button>
        </div>
      </Modal>

      <Modal
        open={!!editing}
        title={editing ? `Edit ${editing.reference_number}` : 'Edit delivery note'}
        onClose={closeEdit}
        width={860}
      >
        <p style={{ color: colors.muted, fontSize: 13, marginTop: 0 }}>
          Based on quotation <strong style={{ color: colors.text }}>{editing?.quote_ref}</strong>
          {editing?.client ? ` · ${editing.client}` : ''}
        </p>
        <EditorSectionTabs
          value={editorSection}
          onChange={setEditorSection}
          sections={['basics', 'lines', 'notes']}
        />
        <div style={editorPanelStyle(editorSection === 'basics')}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          <div style={fieldStyle}>
            <label style={labelStyle}>Delivery date</label>
            <input
              type="date"
              style={inputStyle}
              value={form.delivery_date}
              onChange={(e) => setForm((f) => ({ ...f, delivery_date: e.target.value }))}
            />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Status</label>
            <select
              style={selectStyle}
              value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
            >
              {DELIVERY_NOTE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Delivery terms</label>
            <select
              style={selectStyle}
              value={form.delivery_terms}
              onChange={(e) => setForm((f) => ({ ...f, delivery_terms: e.target.value }))}
            >
              <option value="">—</option>
              {DELIVERY_TERMS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>Ship to</label>
          <textarea
            style={{ ...inputStyle, minHeight: 64, resize: 'vertical' }}
            value={form.ship_to}
            onChange={(e) => setForm((f) => ({ ...f, ship_to: e.target.value }))}
          />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          <div style={fieldStyle}>
            <label style={labelStyle}>Received by</label>
            <input
              style={inputStyle}
              value={form.received_by}
              onChange={(e) => setForm((f) => ({ ...f, received_by: e.target.value }))}
            />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Vehicle / driver notes</label>
            <input
              style={inputStyle}
              value={form.vehicle_notes}
              onChange={(e) => setForm((f) => ({ ...f, vehicle_notes: e.target.value }))}
            />
          </div>
        </div>
        </div>

        <div style={editorPanelStyle(editorSection === 'lines')}>
        <div style={{ margin: '8px 0 6px', fontWeight: 600, fontSize: 13 }}>Quantities delivered</div>
        <div style={tableWrapStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Description</th>
                <th style={thStyle}>SKU</th>
                <th style={thStyle}>Qty</th>
              </tr>
            </thead>
            <tbody>
              {form.items.map((it) => (
                <tr key={it.key}>
                  <td style={tdStyle}>
                    <input
                      style={inputStyle}
                      value={it.description}
                      onChange={(e) => updateItem(it.key, { description: e.target.value })}
                    />
                  </td>
                  <td style={{ ...tdStyle, width: 120 }}>
                    <input
                      style={inputStyle}
                      value={it.sku || ''}
                      onChange={(e) => updateItem(it.key, { sku: e.target.value })}
                    />
                  </td>
                  <td style={{ ...tdStyle, width: 90 }}>
                    <input
                      type="number"
                      min={0}
                      style={inputStyle}
                      value={it.qty}
                      onChange={(e) => updateItem(it.key, { qty: Number(e.target.value) })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ color: colors.muted2, fontSize: 12 }}>
          Total qty {deliveryNoteTotalQty(form.items)} · prices are never printed on delivery notes
        </p>
        </div>

        <div style={editorPanelStyle(editorSection === 'notes')}>
        <div style={fieldStyle}>
          <label style={labelStyle}>Notes</label>
          <textarea
            style={{ ...inputStyle, minHeight: 70, resize: 'vertical' }}
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          />
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>
            <Link2 size={12} style={{ marginRight: 4 }} />
            Signed delivery note (Google Drive)
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button type="button" style={buttonSecondaryStyle} onClick={() => setLinkSignedOpen(true)}>
              <Link2 size={14} /> Link signed DN on Google Drive
            </button>
            {editing?.client ? (
              <Link
                to={`/customer-files?company=${encodeURIComponent(editing.client)}`}
                style={{ ...buttonSecondaryStyle, textDecoration: 'none' }}
              >
                Open customer folder
              </Link>
            ) : null}
          </div>
          <p style={{ margin: '6px 0 0', fontSize: 12, color: colors.muted, lineHeight: 1.45 }}>
            Prefer Google Drive — paste the share link so the CRM stays light. Legacy in-app copies
            below can still be removed.
          </p>
        </div>
        {signedAttachments.length > 0 ? (
          <div style={fieldStyle}>
            <label style={labelStyle}>
              <Paperclip size={12} style={{ marginRight: 4 }} />
              Legacy signed copies (in CRM)
            </label>
            <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13 }}>
              {signedAttachments.map((a) => (
                <li key={a.id} style={{ marginBottom: 4 }}>
                  <a href={a.url} target="_blank" rel="noreferrer" style={{ color: colors.accentText }}>
                    {a.file_name || 'Signed delivery note'}
                  </a>{' '}
                  <button type="button" style={ghostTiny} onClick={() => void removeSignedAttachment(a.id)}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
          <button type="button" style={buttonSecondaryStyle} onClick={closeEdit}>
            Cancel
          </button>
          <button type="button" style={buttonPrimaryStyle} disabled={saving} onClick={() => void saveNote()}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </Modal>

      <LinkDriveFileModal
        open={linkSignedOpen && !!editing}
        onClose={() => setLinkSignedOpen(false)}
        company={editing?.client || ''}
        uploadedBy={who}
        mode="signed"
        category="signed_delivery_note"
        defaultRelatedRef={editing?.reference_number || ''}
        relatedRefOptions={
          editing?.reference_number
            ? [{ value: editing.reference_number, label: editing.reference_number }]
            : []
        }
      />

      <Modal
        open={!!deleteTarget}
        title={
          (deleteTarget as DeliveryNoteRow | null)?.deleted_at
            ? 'Restore delivery note?'
            : 'Archive delivery note?'
        }
        onClose={() => setDeleteTarget(null)}
        width={420}
      >
        <p style={{ color: colors.muted, fontSize: 14 }}>
          {(deleteTarget as DeliveryNoteRow | null)?.deleted_at ? (
            <>
              Restore <strong style={{ color: colors.text }}>{deleteTarget?.reference_number}</strong> to
              the active list.
            </>
          ) : (
            <>
              Archive <strong style={{ color: colors.text }}>{deleteTarget?.reference_number}</strong>{' '}
              (soft-delete). Use Show archived to restore later. The quotation is not affected.
            </>
          )}
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button type="button" style={buttonSecondaryStyle} onClick={() => setDeleteTarget(null)}>
            Cancel
          </button>
          <button
            type="button"
            style={
              (deleteTarget as DeliveryNoteRow | null)?.deleted_at
                ? buttonSecondaryStyle
                : buttonDangerStyle
            }
            disabled={saving}
            onClick={() => void confirmDelete()}
          >
            {(deleteTarget as DeliveryNoteRow | null)?.deleted_at ? 'Restore' : 'Archive'}
          </button>
        </div>
      </Modal>
    </div>
  )
}

const ghostTiny = {
  appearance: 'none' as const,
  border: 0,
  background: 'transparent',
  color: colors.muted,
  cursor: 'pointer',
  fontSize: 12,
  padding: 0,
  textDecoration: 'underline',
}
