import { useCallback, useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { format, isBefore, isToday, parseISO, startOfDay } from 'date-fns'
import {
  Plus,
  Pencil,
  Trash2,
  Search,
  X,
  ExternalLink,
  Loader2,
  Mail,
  UserPlus,
} from 'lucide-react'
import { db } from '../lib/db'
import { NEXT_ACTIONS } from '../lib/config'
import type { AppUser, CrmContact, CrmEntry } from '../lib/types'
import { useAuth } from '../contexts/AuthContext'
import { useSettings } from '../contexts/SettingsContext'
import { useToast } from '../contexts/ToastContext'
import {
  CONTACT_ROLES,
  contactDisplay,
  flatFieldsFromContacts,
  hydrateContacts,
  newContact,
  normalizeContacts,
  primaryContact,
} from '../lib/contacts'
import {
  deleteZohoCalendarEvent,
  isZohoCalendarEnabled,
  isZohoMailEnabled,
  syncFollowUpToZohoCalendar,
} from '../lib/zoho'
import EmailComposeModal from '../components/EmailComposeModal'
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
  contacts: CrmContact[]
  company_owner: string
  address: string
  website: string
  trn: string
  notes: string
  follow_up_date: string
  next_action: string
  owner: string
  quote_ref: string
}

const emptyForm = (): CrmForm => ({
  company_name: '',
  contacts: [newContact({ role: 'Primary' })],
  company_owner: '',
  address: '',
  website: '',
  trn: '',
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
  const { settings } = useSettings()
  const { showToast } = useToast()
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
  const [emailTarget, setEmailTarget] = useState<CrmEntry | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [crmRes, usersRes] = await Promise.all([
        db.from('crm').select('*').order('updated_at', { ascending: false }),
        db.from('app_users').select('*').eq('active', true).order('name'),
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
    const contacts = hydrateContacts(entry)
    setForm({
      company_name: entry.company_name || '',
      contacts: contacts.length ? contacts : [newContact({ role: 'Primary' })],
      company_owner: entry.company_owner || '',
      address: entry.address || '',
      website: entry.website || '',
      trn: entry.trn || '',
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
    return entries.filter((e) => {
      if (e.company_name.toLowerCase().includes(q)) return true
      if ((e.company_owner || '').toLowerCase().includes(q)) return true
      if ((e.address || '').toLowerCase().includes(q)) return true
      if ((e.trn || '').toLowerCase().includes(q)) return true
      return hydrateContacts(e).some(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q) ||
          c.phone.toLowerCase().includes(q),
      )
    })
  }, [entries, search])

  function openCreate() {
    setEditing(null)
    const defaultOwner =
      owners.find((o) => o.email === user?.email)?.name || user?.email || ''
    setForm({ ...emptyForm(), owner: defaultOwner })
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setEditing(null)
    setForm(emptyForm())
  }

  function updateContact(id: string, patch: Partial<CrmContact>) {
    setForm((f) => ({
      ...f,
      contacts: f.contacts.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    }))
  }

  function addContact() {
    setForm((f) => ({
      ...f,
      contacts: [...f.contacts, newContact({ role: f.contacts.length ? 'Other' : 'Primary' })],
    }))
  }

  function removeContact(id: string) {
    setForm((f) => {
      const next = f.contacts.filter((c) => c.id !== id)
      return { ...f, contacts: next.length ? next : [newContact({ role: 'Primary' })] }
    })
  }

  async function upsertClient(formData: CrmForm, contacts: CrmContact[]) {
    if (!formData.company_name.trim()) return
    const flat = flatFieldsFromContacts(contacts)
    const { data: existing } = await db
      .from('clients')
      .select('id')
      .ilike('company_name', formData.company_name.trim())
      .maybeSingle()

    const clientRow = {
      company_name: formData.company_name.trim(),
      primary_contact: flat.primary_contact,
      email: flat.email_phone,
      mobile: flat.mobile_number,
      office: flat.office_number,
      address: formData.address.trim(),
      trn: formData.trn.trim(),
      website: formData.website.trim(),
      company_owner: formData.company_owner.trim(),
      notes: formData.notes.trim(),
      contacts: normalizeContacts(contacts),
    }

    if (existing?.id) {
      await db.from('clients').update(clientRow).eq('id', existing.id)
    } else {
      await db.from('clients').insert(clientRow)
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
    const contacts = normalizeContacts(form.contacts)
    const flat = flatFieldsFromContacts(contacts)
    const followUpDate = form.follow_up_date || null
    const prevEventId = editing?.calendar_event_id || ''

    const payload: Record<string, unknown> = {
      company_name: form.company_name.trim(),
      ...flat,
      contacts,
      company_owner: form.company_owner.trim(),
      address: form.address.trim(),
      website: form.website.trim(),
      trn: form.trn.trim(),
      notes: form.notes.trim(),
      follow_up_date: followUpDate,
      next_action: form.next_action,
      owner: form.owner,
      quote_ref: form.quote_ref.trim(),
      updated_by: who,
      updated_at: new Date().toISOString(),
    }

    try {
      let savedId = editing?.id || ''
      if (editing) {
        const { error: err } = await db.from('crm').update(payload).eq('id', editing.id)
        if (err) throw err
        savedId = editing.id
      } else {
        const newId = crypto.randomUUID()
        const { error: err } = await db.from('crm').insert({
          ...payload,
          id: newId,
          created_by: who,
          calendar_event_id: '',
        })
        if (err) throw err
        savedId = newId
      }

      await upsertClient(form, contacts)

      // Best-effort Zoho Calendar sync
      if (isZohoCalendarEnabled(settings)) {
        try {
          const p = primaryContact(contacts)
          if (followUpDate) {
            const eventId = await syncFollowUpToZohoCalendar(settings, {
              company: form.company_name.trim(),
              nextAction: form.next_action,
              owner: form.owner,
              contactName: p?.name,
              contactEmail: p?.email,
              followUpDate,
              existingEventId: prevEventId || undefined,
            })
            if (savedId && eventId && eventId !== prevEventId) {
              await db
                .from('crm')
                .update({ calendar_event_id: eventId })
                .eq('id', savedId)
            }
          } else if (prevEventId) {
            await deleteZohoCalendarEvent(settings, prevEventId)
            if (savedId) {
              await db.from('crm').update({ calendar_event_id: '' }).eq('id', savedId)
            }
          }
        } catch (calErr) {
          showToast(
            calErr instanceof Error ? `Saved, but Zoho Calendar: ${calErr.message}` : 'Saved, but calendar sync failed',
            'error',
          )
        }
      }

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
      if (isZohoCalendarEnabled(settings) && deleteTarget.calendar_event_id) {
        try {
          await deleteZohoCalendarEvent(settings, deleteTarget.calendar_event_id)
        } catch {
          /* ignore calendar delete errors on CRM delete */
        }
      }
      const { error: err } = await db.from('crm').delete().eq('id', deleteTarget.id)
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
          <p style={pageSub}>Companies, contacts, company owner, and sales assignment</p>
        </div>
        <button type="button" style={btnPrimary} onClick={openCreate}>
          <Plus size={16} /> Add company
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
            placeholder="Search company or contact…"
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
        <div
          style={{
            ...emptyState,
            background: colors.card,
            borderRadius: 12,
            border: `1px solid ${colors.border}`,
          }}
        >
          {search ? 'No companies match your search.' : 'No CRM entries yet. Add your first company.'}
        </div>
      ) : (
        <div style={tableWrap}>
          <table style={table}>
            <thead>
              <tr>
                <th style={th}>Company</th>
                <th style={th}>Contacts</th>
                <th style={th}>Company owner</th>
                <th style={th}>Phone</th>
                <th style={th}>Follow-up</th>
                <th style={th}>Next action</th>
                <th style={th}>Sales owner</th>
                <th style={th}>Quote</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const contacts = hydrateContacts(row)
                const display = contactDisplay(contacts)
                const p = primaryContact(contacts)
                return (
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
                    <td style={td}>
                      {display.label}
                      {display.extra > 0 ? (
                        <span
                          style={{
                            marginLeft: 6,
                            fontSize: 11,
                            color: colors.accent,
                            fontWeight: 600,
                          }}
                        >
                          +{display.extra}
                        </span>
                      ) : null}
                    </td>
                    <td style={td}>{row.company_owner || '—'}</td>
                    <td style={td}>{p?.phone || row.mobile_number || row.office_number || '—'}</td>
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
                          style={{
                            color: colors.accent,
                            textDecoration: 'none',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          {row.quote_ref} <ExternalLink size={12} />
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>
                      <button
                        type="button"
                        style={btnGhost}
                        onClick={() => setEmailTarget(row)}
                        title="Email"
                      >
                        <Mail size={14} />
                      </button>
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
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <div style={overlay} onClick={closeModal}>
          <div style={{ ...modal, maxWidth: 720 }} onClick={(e) => e.stopPropagation()}>
            <div style={modalHeader}>
              <h3 style={{ margin: 0, fontSize: 16 }}>{editing ? 'Edit company' : 'Add company'}</h3>
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
                  <Field label="Company owner">
                    <input
                      style={input}
                      value={form.company_owner}
                      onChange={(e) => setForm((f) => ({ ...f, company_owner: e.target.value }))}
                      placeholder="Proprietor / business owner name"
                    />
                  </Field>
                  <Field label="Address">
                    <input
                      style={input}
                      value={form.address}
                      onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                    />
                  </Field>
                  <Field label="Website">
                    <input
                      style={input}
                      value={form.website}
                      onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
                      placeholder="www.example.com"
                    />
                  </Field>
                  <Field label="TRN">
                    <input
                      style={input}
                      value={form.trn}
                      onChange={(e) => setForm((f) => ({ ...f, trn: e.target.value }))}
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
                  <Field label="Sales owner (Red Reach)">
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

                <div style={{ marginTop: 8, marginBottom: 8 }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 10,
                    }}
                  >
                    <label style={{ ...label, margin: 0 }}>Contacts</label>
                    <button type="button" style={btnGhost} onClick={addContact}>
                      <UserPlus size={14} /> Add contact
                    </button>
                  </div>
                  <div style={{ display: 'grid', gap: 10 }}>
                    {form.contacts.map((c, idx) => (
                      <div
                        key={c.id}
                        style={{
                          border: `1px solid ${colors.border}`,
                          borderRadius: 10,
                          padding: 12,
                          background: 'rgba(0,0,0,0.2)',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            marginBottom: 8,
                            fontSize: 12,
                            color: colors.muted2,
                          }}
                        >
                          <span>Contact {idx + 1}</span>
                          {form.contacts.length > 1 ? (
                            <button type="button" style={btnGhost} onClick={() => removeContact(c.id)}>
                              <Trash2 size={14} />
                            </button>
                          ) : null}
                        </div>
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 140px), 1fr))',
                            gap: 10,
                          }}
                        >
                          <Field label="Name">
                            <input
                              style={input}
                              value={c.name}
                              onChange={(e) => updateContact(c.id, { name: e.target.value })}
                            />
                          </Field>
                          <Field label="Email">
                            <input
                              style={input}
                              type="email"
                              value={c.email}
                              onChange={(e) => updateContact(c.id, { email: e.target.value })}
                            />
                          </Field>
                          <Field label="Phone">
                            <input
                              style={input}
                              value={c.phone}
                              onChange={(e) => updateContact(c.id, { phone: e.target.value })}
                            />
                          </Field>
                          <Field label="Role">
                            <select
                              style={input}
                              value={c.role}
                              onChange={(e) => updateContact(c.id, { role: e.target.value })}
                            >
                              {CONTACT_ROLES.map((r) => (
                                <option key={r} value={r}>
                                  {r}
                                </option>
                              ))}
                            </select>
                          </Field>
                        </div>
                      </div>
                    ))}
                  </div>
                  {isZohoCalendarEnabled(settings) ? (
                    <p style={{ margin: '8px 0 0', fontSize: 12, color: colors.muted2 }}>
                      Follow-up date syncs to Zoho Calendar when enabled in Settings.
                    </p>
                  ) : null}
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
              <h3 style={{ margin: 0, fontSize: 16 }}>Delete company?</h3>
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

      <EmailComposeModal
        open={!!emailTarget}
        companyName={emailTarget?.company_name || ''}
        contacts={emailTarget ? hydrateContacts(emailTarget) : []}
        defaultSubject={
          emailTarget?.quote_ref
            ? `Regarding ${emailTarget.quote_ref}`
            : emailTarget
              ? `Follow-up — ${emailTarget.company_name}`
              : ''
        }
        zohoEnabled={isZohoMailEnabled(settings)}
        onClose={() => setEmailTarget(null)}
      />
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
