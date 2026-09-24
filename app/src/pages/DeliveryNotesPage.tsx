import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { format } from 'date-fns'
import { ExternalLink, FileUp, Paperclip, Pencil, Plus, Trash2, Truck } from 'lucide-react'
import { db } from '../lib/db'
import { DELIVERY_NOTE_STATUSES, DELIVERY_TERMS } from '../lib/config'
import type { Attachment, DeliveryNote, Quotation } from '../lib/types'
import { useAuth } from '../contexts/AuthContext'
import { useSettings } from '../contexts/SettingsContext'
import { useToast } from '../contexts/ToastContext'
import Modal from '../components/Modal'
import StatusPill from '../components/StatusPill'
import EmptyState from '../components/EmptyState'
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
  deleteDeliveryNoteLineItems,
  listDeliveryNotes,
  loadDeliveryNoteLineItems,
  saveDeliveryNoteLineItems,
  updateDeliveryNote,
} from '../lib/deliveryNoteStore'
import {
  deleteSignedDeliveryNoteAttachment,
  loadSignedDeliveryNoteAttachments,
  saveSignedDeliveryNoteAttachments,
  type PendingSignedFile,
} from '../lib/signedDeliveryNotes'
import { errorMessage } from '../lib/errors'
import { type DraftLineItem } from '../lib/lineItems'
import { sortByDateDesc } from '../lib/finance'
import { useCompactCrm } from '../hooks/useMediaQuery'
import resp from '../styles/crmResponsive.module.css'
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
  const { user } = useAuth()
  const { settings } = useSettings()
  const { showToast } = useToast()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const compact = useCompactCrm()
  const who = user?.email || ''
  const prefix = settings.deliveryNotePrefix || 'DN'

  const [notes, setNotes] = useState<DeliveryNote[]>([])
  const [quotes, setQuotes] = useState<Quotation[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<StatusTab>('All')
  const [saving, setSaving] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [quotePick, setQuotePick] = useState('')
  const [quoteFilter, setQuoteFilter] = useState('')
  const [editing, setEditing] = useState<DeliveryNote | null>(null)
  const [form, setForm] = useState<NoteForm>(emptyForm())
  const [signedAttachments, setSignedAttachments] = useState<Attachment[]>([])
  const [pendingSignedFiles, setPendingSignedFiles] = useState<PendingSignedFile[]>([])
  const [deleteTarget, setDeleteTarget] = useState<DeliveryNote | null>(null)

  function closeEdit() {
    setEditing(null)
    setSignedAttachments([])
    setPendingSignedFiles([])
  }

  async function refreshSignedAttachments(note: DeliveryNote) {
    const rows = await loadSignedDeliveryNoteAttachments(note)
    setSignedAttachments(rows)
  }

  async function readFileAsDataUrl(file: File): Promise<PendingSignedFile> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () =>
        resolve({ name: file.name, dataUrl: String(reader.result || ''), mime: file.type })
      reader.onerror = () => reject(reader.error || new Error('Read failed'))
      reader.readAsDataURL(file)
    })
  }

  async function onPickSignedFiles(files: FileList | null) {
    if (!files?.length) return
    try {
      const rows = await Promise.all([...files].map((f) => readFileAsDataUrl(f)))
      setPendingSignedFiles((prev) => [...prev, ...rows])
    } catch (e) {
      showToast(errorMessage(e, 'Could not read file'), 'error')
    }
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
        listDeliveryNotes(),
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
  }, [showToast])

  useEffect(() => {
    void load()
  }, [load])

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
    const quote = quotes.find((q) => q.id === quotePick)
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
      setEditing(note)
      setPendingSignedFiles([])
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
    setSaving(true)
    try {
      await updateDeliveryNote(editing.id, {
        delivery_date: form.delivery_date || null,
        status: form.status,
        delivery_terms: form.delivery_terms,
        ship_to: form.ship_to,
        notes: form.notes,
        received_by: form.received_by,
        vehicle_notes: form.vehicle_notes,
        updated_by: who,
        updated_at: new Date().toISOString(),
      })
      await saveDeliveryNoteLineItems(editing.reference_number, form.items)
      if (pendingSignedFiles.length) {
        await saveSignedDeliveryNoteAttachments({
          note: editing,
          files: pendingSignedFiles,
          uploadedBy: who,
        })
        await logActivity(
          'save_signed_delivery_note',
          'delivery_note',
          editing.reference_number,
          editing.client,
          who,
        )
      }
      await logActivity('update_delivery_note', 'delivery_note', editing.reference_number, editing.client, who)
      showToast(
        pendingSignedFiles.length
          ? 'Delivery note and signed copy saved'
          : 'Delivery note saved',
        'success',
      )
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
    setSaving(true)
    try {
      await deleteDeliveryNoteLineItems(deleteTarget.reference_number)
      await deleteDeliveryNote(deleteTarget.id)
      await logActivity(
        'delete_delivery_note',
        'delivery_note',
        deleteTarget.reference_number,
        deleteTarget.client,
        who,
      )
      showToast('Delivery note deleted', 'success')
      setDeleteTarget(null)
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Delete failed'), 'error')
    } finally {
      setSaving(false)
    }
  }

  function renderActions(note: DeliveryNote) {
    return (
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        <button type="button" style={buttonSecondaryStyle} onClick={() => void openEdit(note)} title="Edit">
          <Pencil size={14} />
        </button>
        <Link
          to={`/document/delivery-note/${note.id}`}
          style={{ ...buttonSecondaryStyle, textDecoration: 'none' }}
          title="View / print PDF"
        >
          <ExternalLink size={14} />
        </Link>
        <button type="button" style={buttonDangerStyle} onClick={() => setDeleteTarget(note)} title="Delete">
          <Trash2 size={14} />
        </button>
      </div>
    )
  }

  return (
    <div style={pageStyle}>
      <div style={toolbarStyle}>
        <div>
          <h1 style={pageTitleStyle}>Delivery notes</h1>
          <p style={pageSubtitleStyle}>Goods receipts based on finalized quotations — quantities only</p>
        </div>
        <button type="button" style={buttonPrimaryStyle} onClick={() => setCreateOpen(true)}>
          <Plus size={16} /> From quotation
        </button>
      </div>

      <div className={resp.toolbar} style={{ marginBottom: 16 }}>
        <div className={resp.chipRow} style={{ marginBottom: 0, flex: 1 }}>
          {(['All', 'Draft', 'Issued', 'Delivered'] as StatusTab[]).map((t) => (
            <button
              key={t}
              type="button"
              style={{
                ...buttonSecondaryStyle,
                ...(tab === t ? { borderColor: colors.accent, color: colors.accent } : null),
              }}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
        </div>
        <input
          className={resp.toolbarSearch}
          style={{ ...inputStyle, maxWidth: compact ? '100%' : 320 }}
          placeholder="Search client / quote / DN…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div style={{ ...cardStyle, color: colors.muted }}>Loading delivery notes…</div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Truck size={22} />}
          title="No delivery notes"
          subtitle="Create a delivery note from a finalized or awarded quotation."
          actionLabel="From quotation"
          onAction={() => setCreateOpen(true)}
        />
      ) : compact ? (
        <div className={resp.listStack}>
          {filtered.map((note) => (
            <article key={note.id} className={resp.card}>
              <div className={resp.cardTop}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className={resp.cardTitle} style={{ cursor: 'default' }}>
                    {note.reference_number || '—'}
                  </div>
                  <div className={resp.cardMeta}>
                    {note.client || '—'}
                    {note.quote_ref ? ` · Quote ${note.quote_ref}` : ''}
                    {note.date ? ` · ${format(new Date(note.date), 'dd MMM yyyy')}` : ''}
                  </div>
                </div>
                <StatusPill status={note.status} />
              </div>
              <div className={resp.cardActions}>{renderActions(note)}</div>
            </article>
          ))}
        </div>
      ) : (
        <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
          <div style={tableWrapStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Reference</th>
                  <th style={thStyle}>Client</th>
                  <th style={thStyle}>Quotation</th>
                  <th style={thStyle}>Date</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((note) => (
                  <tr key={note.id}>
                    <td style={tdStyle}>
                      <strong>{note.reference_number || '—'}</strong>
                    </td>
                    <td style={tdStyle}>{note.client || '—'}</td>
                    <td style={tdStyle}>{note.quote_ref || '—'}</td>
                    <td style={tdStyle}>
                      {note.date ? format(new Date(note.date), 'dd MMM yyyy') : '—'}
                    </td>
                    <td style={tdStyle}>
                      <StatusPill status={note.status} />
                    </td>
                    <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{renderActions(note)}</td>
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
            <FileUp size={12} style={{ marginRight: 4 }} />
            Signed delivery note (PDF or photo)
          </label>
          <input
            type="file"
            accept="application/pdf,image/*,.pdf"
            multiple
            onChange={(e) => {
              void onPickSignedFiles(e.target.files)
              e.target.value = ''
            }}
          />
          <p style={{ margin: '6px 0 0', fontSize: 12, color: colors.muted, lineHeight: 1.45 }}>
            Upload the customer-signed copy after delivery. Saved with this delivery note.
          </p>
          {pendingSignedFiles.length > 0 ? (
            <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 12, color: colors.muted }}>
              {pendingSignedFiles.map((f) => (
                <li key={f.name + f.dataUrl.slice(0, 24)}>
                  {f.name} (pending save){' '}
                  <button
                    type="button"
                    style={ghostTiny}
                    onClick={() =>
                      setPendingSignedFiles((prev) => prev.filter((p) => p.dataUrl !== f.dataUrl))
                    }
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        {signedAttachments.length > 0 ? (
          <div style={fieldStyle}>
            <label style={labelStyle}>
              <Paperclip size={12} style={{ marginRight: 4 }} />
              Saved signed copies
            </label>
            <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13 }}>
              {signedAttachments.map((a) => (
                <li key={a.id} style={{ marginBottom: 4 }}>
                  <a href={a.url} target="_blank" rel="noreferrer" style={{ color: colors.accent }}>
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
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" style={buttonSecondaryStyle} onClick={closeEdit}>
            Cancel
          </button>
          <button type="button" style={buttonPrimaryStyle} disabled={saving} onClick={() => void saveNote()}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </Modal>

      <Modal open={!!deleteTarget} title="Delete delivery note?" onClose={() => setDeleteTarget(null)} width={420}>
        <p style={{ color: colors.muted, fontSize: 14 }}>
          Delete <strong style={{ color: colors.text }}>{deleteTarget?.reference_number}</strong> and its
          line items? The quotation is not affected.
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button type="button" style={buttonSecondaryStyle} onClick={() => setDeleteTarget(null)}>
            Cancel
          </button>
          <button type="button" style={buttonDangerStyle} disabled={saving} onClick={() => void confirmDelete()}>
            Delete
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
