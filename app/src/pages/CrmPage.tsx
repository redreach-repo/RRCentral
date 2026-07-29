import { useCallback, useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { format, isBefore, isToday, parseISO, startOfDay } from 'date-fns'
import { Plus, Pencil, Trash2, Search, X, ExternalLink, Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { NEXT_ACTIONS } from '../lib/config'
import type { AppUser, CrmEntry } from '../lib/types'
import { useAuth } from '../contexts/AuthContext'
import {
  page,
  pageHeader,
  pageTitle,
  pageSub,
  btn,
  btnPrimary,
  btnDanger,
  btnGhost,
  input,
  label,
  tableWrap,
  table,
  th,
  td,
  overlay,
  modal,
  modalHeader,
  modalBody,
  modalFooter,
  formGrid,
  emptyState,
  errorBanner,
  colors,
} from '../lib/pageStyles'

type CrmForm = {
  company_name: string
  primary_contact: string
  email_phone: string
  mobile_number: string
  office_number: string
  notes: string
  follow_up_date: string
  next_action: string
  owner: string
  quote_ref: string
}

const emptyForm = (): CrmForm => ({
  company_name: '',
  primary_contact: '',
  email_phone: '',
  mobile_number: '',
  office_number: '',
  notes: '',
  follow_up_date: '',
  next_action: '',
  owner: '',
  quote_ref: '',
})

function followUpColor(dateStr: string | null): string {
  if (!dateStr) return colors.muted2
  try {
    const d = startOfDay(parseISO(dateStr.slice(0, 10)))
    if (isToday(d)) return colors.warn
    if (isBefore(d, startOfDay(new Date()))) return colors.danger
    return colors.success
  } catch {
    return colors.muted2
  }
}

export default function CrmPage() {
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [entries, setEntries] = useState<CrmEntry[]>([])
  const [owners, setOwners] = useState<AppUser[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<CrmEntry | null>(null)
  const [form, setForm] = useState<CrmForm>(emptyForm)
  const [deleteTarget, setDeleteTarget] = useState<CrmEntry | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [crmRes, usersRes] = await Promise.all([
        supabase.from('crm').select('*').order('updated_at', { ascending: false }),
        supabase.from('app_users').select('*').eq('active', true).order('name'),
      ])
      if (crmRes.error) throw crmRes.error
      if (usersRes.error) throw usersRes.error
      setEntries((crmRes.data || []) as CrmEntry[])
      setOwners((usersRes.data || []) as AppUser[])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load CRM')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const openEdit = useCallback((entry: CrmEntry) => {
    setEditing(entry)
    setForm({
      company_name: entry.company_name || '',
      primary_contact: entry.primary_contact || '',
      email_phone: entry.email_phone || '',
      mobile_number: entry.mobile_number || '',
      office_number: entry.office_number || '',
      notes: entry.notes || '',
      follow_up_date: entry.follow_up_date ? entry.follow_up_date.slice(0, 10) : '',
      next_action: entry.next_action || '',
      owner: entry.owner || '',
      quote_ref: entry.quote_ref || '',
    })
    setModalOpen(true)
  }, [])

  useEffect(() => {
    const editId = searchParams.get('edit')
    if (!editId || loading || !entries.length) return
    const found = entries.find((e) => e.id === editId)
    if (found) {
      openEdit(found)
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, entries, loading, openEdit, setSearchParams])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return entries
    return entries.filter((e) => e.company_name.toLowerCase().includes(q))
  }, [entries, search])

  function openCreate() {
    setEditing(null)
    const defaultOwner =
      owners.find((o) => o.email === user?.email)?.name ||
      user?.email ||
      ''
    setForm({ ...emptyForm(), owner: defaultOwner })
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setEditing(null)
    setForm(emptyForm())
  }

  async function upsertClient(payload: CrmForm) {
    if (!payload.company_name.trim()) return
    const { data: existing } = await supabase
      .from('clients')
      .select('id')
      .ilike('company_name', payload.company_name.trim())
      .maybeSingle()

    const clientRow = {
      company_name: payload.company_name.trim(),
      primary_contact: payload.primary_contact,
      email: payload.email_phone,
      mobile: payload.mobile_number,
      office: payload.office_number,
      notes: payload.notes,
    }

    if (existing?.id) {
      await supabase.from('clients').update(clientRow).eq('id', existing.id)
    } else {
      await supabase.from('clients').insert(clientRow)
    }
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    if (!form.company_name.trim()) {
      setError('Company name is required')
      return
    }
    setSaving(true)
    setError('')
    const who = user?.email || ''
    const payload = {
      company_name: form.company_name.trim(),
      primary_contact: form.primary_contact.trim(),
      email_phone: form.email_phone.trim(),
      mobile_number: form.mobile_number.trim(),
      office_number: form.office_number.trim(),
      notes: form.notes.trim(),
      follow_up_date: form.follow_up_date || null,
      next_action: form.next_action,
      owner: form.owner,
      quote_ref: form.quote_ref.trim(),
      updated_by: who,
      updated_at: new Date().toISOString(),
    }

    try {
      if (editing) {
        const { error: err } = await supabase.from('crm').update(payload).eq('id', editing.id)
        if (err) throw err
      } else {
        const { error: err } = await supabase.from('crm').insert({
          ...payload,
          created_by: who,
        })
        if (err) throw err
      }
      await upsertClient(form)
      closeModal()
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setSaving(true)
    setError('')
    try {
      const { error: err } = await supabase.from('crm').delete().eq('id', deleteTarget.id)
      if (err) throw err
      setDeleteTarget(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={page}>
      <div style={pageHeader}>
        <div>
          <h2 style={pageTitle}>CRM / Sales Visits</h2>
          <p style={pageSub}>Contacts, follow-ups, and ownership</p>
        </div>
        <button type="button" style={btnPrimary} onClick={openCreate}>
          <Plus size={16} /> Add contact
        </button>
      </div>

      {error && <div style={errorBanner}>{error}</div>}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 360 }}>
          <Search
            size={16}
            style={{
              position: 'absolute',
              left: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              color: colors.muted2,
            }}
          />
          <input
            style={{ ...input, paddingLeft: 36 }}
            placeholder="Search by company…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div style={emptyState}>
          <Loader2 size={22} style={{ animation: 'spin 1s linear infinite' }} /> Loading…
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ ...emptyState, ...{ background: colors.card, borderRadius: 12, border: `1px solid ${colors.border}` } }}>
          {search ? 'No companies match your search.' : 'No CRM entries yet. Add your first contact.'}
        </div>
      ) : (
        <div style={tableWrap}>
          <table style={table}>
            <thead>
              <tr>
                <th style={th}>Company</th>
                <th style={th}>Contact</th>
                <th style={th}>Phone</th>
                <th style={th}>Follow-up</th>
                <th style={th}>Next action</th>
                <th style={th}>Owner</th>
                <th style={th}>Quote</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id}>
                  <td style={td}>
                    <button
                      type="button"
                      onClick={() => openEdit(row)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: colors.text,
                        fontWeight: 600,
                        cursor: 'pointer',
                        padding: 0,
                        textAlign: 'left',
                      }}
                    >
                      {row.company_name}
                    </button>
                  </td>
                  <td style={td}>{row.primary_contact || '—'}</td>
                  <td style={td}>{row.mobile_number || row.office_number || row.email_phone || '—'}</td>
                  <td style={{ ...td, color: followUpColor(row.follow_up_date), fontWeight: 600 }}>
                    {row.follow_up_date
                      ? format(parseISO(row.follow_up_date.slice(0, 10)), 'dd MMM yyyy')
                      : '—'}
                  </td>
                  <td style={td}>{row.next_action || '—'}</td>
                  <td style={td}>{row.owner || '—'}</td>
                  <td style={td}>
                    {row.quote_ref ? (
                      <Link
                        to={`/quotations?ref=${encodeURIComponent(row.quote_ref)}`}
                        style={{ color: colors.accent, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                      >
                        {row.quote_ref} <ExternalLink size={12} />
                      </Link>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>
                    <button type="button" style={btnGhost} onClick={() => openEdit(row)} title="Edit">
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      style={btnGhost}
                      onClick={() => setDeleteTarget(row)}
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <div style={overlay} onClick={closeModal}>
          <div style={modal} onClick={(e) => e.stopPropagation()}>
            <div style={modalHeader}>
              <h3 style={{ margin: 0, fontSize: 16 }}>{editing ? 'Edit contact' : 'Add contact'}</h3>
              <button type="button" style={btnGhost} onClick={closeModal}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={(e) => void handleSave(e)}>
              <div style={modalBody}>
                <div style={formGrid}>
                  <Field label="Company *">
                    <input
                      style={input}
                      required
                      value={form.company_name}
                      onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))}
                    />
                  </Field>
                  <Field label="Primary contact">
                    <input
                      style={input}
                      value={form.primary_contact}
                      onChange={(e) => setForm((f) => ({ ...f, primary_contact: e.target.value }))}
                    />
                  </Field>
                  <Field label="Email / phone">
                    <input
                      style={input}
                      value={form.email_phone}
                      onChange={(e) => setForm((f) => ({ ...f, email_phone: e.target.value }))}
                    />
                  </Field>
                  <Field label="Mobile">
                    <input
                      style={input}
                      value={form.mobile_number}
                      onChange={(e) => setForm((f) => ({ ...f, mobile_number: e.target.value }))}
                    />
                  </Field>
                  <Field label="Office">
                    <input
                      style={input}
                      value={form.office_number}
                      onChange={(e) => setForm((f) => ({ ...f, office_number: e.target.value }))}
                    />
                  </Field>
                  <Field label="Follow-up date">
                    <input
                      type="date"
                      style={input}
                      value={form.follow_up_date}
                      onChange={(e) => setForm((f) => ({ ...f, follow_up_date: e.target.value }))}
                    />
                  </Field>
                  <Field label="Next action">
                    <select
                      style={input}
                      value={form.next_action}
                      onChange={(e) => setForm((f) => ({ ...f, next_action: e.target.value }))}
                    >
                      <option value="">—</option>
                      {NEXT_ACTIONS.map((a) => (
                        <option key={a} value={a}>
                          {a}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Owner">
                    <select
                      style={input}
                      value={form.owner}
                      onChange={(e) => setForm((f) => ({ ...f, owner: e.target.value }))}
                    >
                      <option value="">—</option>
                      {owners.map((o) => (
                        <option key={o.id} value={o.name || o.email}>
                          {o.name || o.email}
                        </option>
                      ))}
                      {form.owner &&
                        !owners.some((o) => (o.name || o.email) === form.owner) && (
                          <option value={form.owner}>{form.owner}</option>
                        )}
                    </select>
                  </Field>
                  <Field label="Quote ref">
                    <input
                      style={input}
                      value={form.quote_ref}
                      onChange={(e) => setForm((f) => ({ ...f, quote_ref: e.target.value }))}
                      placeholder="RR-01-26001"
                    />
                  </Field>
                </div>
                <Field label="Notes">
                  <textarea
                    style={{ ...input, minHeight: 80, resize: 'vertical' }}
                    value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  />
                </Field>
              </div>
              <div style={modalFooter}>
                <button type="button" style={btn} onClick={closeModal} disabled={saving}>
                  Cancel
                </button>
                <button type="submit" style={btnPrimary} disabled={saving}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div style={overlay} onClick={() => setDeleteTarget(null)}>
          <div style={{ ...modal, maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <div style={modalHeader}>
              <h3 style={{ margin: 0, fontSize: 16 }}>Delete contact?</h3>
            </div>
            <div style={modalBody}>
              <p style={{ margin: 0, color: colors.muted, fontSize: 14 }}>
                Delete <strong style={{ color: colors.text }}>{deleteTarget.company_name}</strong>? This
                cannot be undone.
              </p>
            </div>
            <div style={modalFooter}>
              <button type="button" style={btn} onClick={() => setDeleteTarget(null)} disabled={saving}>
                Cancel
              </button>
              <button type="button" style={btnDanger} onClick={() => void handleDelete()} disabled={saving}>
                {saving ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label: text, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={label as CSSProperties}>{text}</label>
      {children}
    </div>
  )
}
