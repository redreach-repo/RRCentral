import { useCallback, useEffect, useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { Building2, ExternalLink, Plus } from 'lucide-react'
import VendorRowActions from '../components/vendors/VendorRowActions'
import { db } from '../lib/db'
import type { Attachment, Expense, Vendor } from '../lib/types'
import { useAuth } from '../contexts/AuthContext'
import { useI18n } from '../contexts/I18nContext'
import { useToast } from '../contexts/ToastContext'
import { canEditField, canViewField } from '../lib/fieldPermissions'
import { parseVendorForm } from '../lib/schemas/vendor'
import Modal from '../components/Modal'
import EmptyState from '../components/EmptyState'
import SavedViewsBar from '../components/SavedViewsBar'
import EditorSectionTabs, {
  editorPanelStyle,
  type EditorSection,
} from '../components/EditorSectionTabs'
import { logActivity } from '../lib/activity'
import { errorMessage, isMissingRelationError } from '../lib/errors'
import { expenseVatParts } from '../lib/finance'
import { formatAED } from '../lib/money'
import {
  listExpenseAttachmentsForIds,
  listExpensesForVendor,
} from '../lib/supplierInvoiceStore'
import { listVendors } from '../lib/vendors'
import {
  buttonDangerStyle,
  buttonPrimaryStyle,
  buttonSecondaryStyle,
  cardStyle,
  colors,
  fieldStyle,
  formGridStyle,
  inputStyle,
  labelStyle,
  tableStyle,
  tableWrapStyle,
  tdStyle,
  thStyle,
} from '../lib/uiStyles'
import docsStyles from '../styles/docsList.module.css'

type VendorForm = {
  company_name: string
  primary_contact: string
  email: string
  mobile: string
  office: string
  address: string
  trn: string
  website: string
  payment_terms: string
  notes: string
}

const emptyForm = (): VendorForm => ({
  company_name: '',
  primary_contact: '',
  email: '',
  mobile: '',
  office: '',
  address: '',
  trn: '',
  website: '',
  payment_terms: '',
  notes: '',
})

function isHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(String(url || '').trim())
}

export default function VendorsPage() {
  const { t } = useI18n()
  const { user, appUserId, userRole } = useAuth()
  const { showToast } = useToast()
  const showTrn = canViewField(userRole, 'vendor.trn')
  const editTrn = canEditField(userRole, 'vendor.trn')
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const vendorViewFilters = useMemo(() => {
    const q = search.trim()
    return q ? { q } : {}
  }, [search])
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Vendor | null>(null)
  const [form, setForm] = useState<VendorForm>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Vendor | null>(null)
  const [actionsOpenId, setActionsOpenId] = useState<string | null>(null)
  const [editorSection, setEditorSection] = useState<EditorSection>('basics')
  const [missingTable, setMissingTable] = useState(false)
  const [vendorInvoices, setVendorInvoices] = useState<Expense[]>([])
  const [invoiceAttachments, setInvoiceAttachments] = useState<Attachment[]>([])
  const [invoicesLoading, setInvoicesLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const rows = await listVendors()
      setVendors(rows)
      setMissingTable(false)
    } catch (e) {
      if (isMissingRelationError(e)) {
        setMissingTable(true)
        setVendors([])
      } else {
        showToast(errorMessage(e, 'Failed to load vendors'), 'error')
      }
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    void load()
  }, [load])

  const loadVendorInvoices = useCallback(
    async (companyName: string) => {
      setInvoicesLoading(true)
      setVendorInvoices([])
      setInvoiceAttachments([])
      try {
        const rows = await listExpensesForVendor(companyName)
        setVendorInvoices(rows)
        const attachments = await listExpenseAttachmentsForIds(rows.map((r) => r.id))
        setInvoiceAttachments(attachments)
      } catch (e) {
        showToast(errorMessage(e, 'Failed to load vendor invoices'), 'error')
      } finally {
        setInvoicesLoading(false)
      }
    },
    [showToast],
  )

  const attachmentsByExpense = useMemo(() => {
    const map = new Map<string, Attachment[]>()
    for (const a of invoiceAttachments) {
      const key = String(a.entity_ref || '').trim()
      if (!key) continue
      const list = map.get(key) || []
      list.push(a)
      map.set(key, list)
    }
    return map
  }, [invoiceAttachments])

  const invoiceTotal = useMemo(
    () => vendorInvoices.reduce((sum, e) => sum + (Number(e.amount) || 0), 0),
    [vendorInvoices],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return vendors
    return vendors.filter(
      (v) =>
        v.company_name.toLowerCase().includes(q) ||
        v.primary_contact.toLowerCase().includes(q) ||
        v.email.toLowerCase().includes(q) ||
        v.trn.toLowerCase().includes(q) ||
        v.mobile.toLowerCase().includes(q),
    )
  }, [vendors, search])

  function openCreate() {
    setEditing(null)
    setForm(emptyForm())
    setVendorInvoices([])
    setInvoiceAttachments([])
    setEditorSection('basics')
    setOpen(true)
  }

  function openEdit(v: Vendor) {
    setEditing(v)
    setForm({
      company_name: v.company_name || '',
      primary_contact: v.primary_contact || '',
      email: v.email || '',
      mobile: v.mobile || '',
      office: v.office || '',
      address: v.address || '',
      trn: v.trn || '',
      website: v.website || '',
      payment_terms: v.payment_terms || '',
      notes: v.notes || '',
    })
    setEditorSection('basics')
    setOpen(true)
    void loadVendorInvoices(v.company_name)
  }

  async function save() {
    const parsed = parseVendorForm({
      ...form,
      trn: editTrn ? form.trn : editing?.trn || '',
    })
    if (!parsed.ok) {
      showToast(parsed.error, 'error')
      return
    }
    setSaving(true)
    try {
      const payload = {
        ...parsed.data,
        active: true,
        updated_at: new Date().toISOString(),
      }
      if (editing) {
        const { error } = await db.from('vendors').update(payload).eq('id', editing.id)
        if (error) throw error
      } else {
        const { error } = await db.from('vendors').insert({
          ...payload,
          id: crypto.randomUUID(),
          created_at: new Date().toISOString(),
        })
        if (error) throw error
      }
      await logActivity(
        editing ? 'update_vendor' : 'save_vendor',
        'vendor',
        payload.company_name,
        payload.trn ? `TRN ${payload.trn}` : '',
        user?.email || '',
      )
      showToast(editing ? 'Vendor updated' : 'Vendor registered', 'success')
      setOpen(false)
      await load()
    } catch (e) {
      if (isMissingRelationError(e)) {
        showToast(
          'Vendors table is missing. Run supabase/migrations/20260924203122_vendors.sql in Supabase first.',
          'error',
        )
        setMissingTable(true)
      } else {
        showToast(errorMessage(e, 'Save failed'), 'error')
      }
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setSaving(true)
    try {
      const { error } = await db
        .from('vendors')
        .update({ active: false, updated_at: new Date().toISOString() })
        .eq('id', deleteTarget.id)
      if (error) throw error
      await logActivity('archive_vendor', 'vendor', deleteTarget.company_name, '', user?.email || '')
      showToast('Vendor archived', 'success')
      setDeleteTarget(null)
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Delete failed'), 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={docsStyles.page}>
      <header className={docsStyles.hero}>
        <div>
          <p className={docsStyles.kicker}>{t('page.finance.kicker')}</p>
          <h1 className={docsStyles.title}>{t('page.vendors.title')}</h1>
          <p className={docsStyles.subtitle}>{t('page.vendors.subtitle')}</p>
        </div>
        <button
          type="button"
          className={docsStyles.newBtn}
          onClick={openCreate}
          disabled={missingTable}
        >
          <Plus size={16} /> {t('page.vendors.new')}
        </button>
      </header>

      {missingTable ? (
        <div style={{ ...cardStyle, color: colors.muted, lineHeight: 1.55, marginBottom: 16 }}>
          The <code>vendors</code> table is not on this database yet. Run{' '}
          <code>supabase/migrations/20260924203122_vendors.sql</code> in the Supabase SQL editor, then refresh.
        </div>
      ) : null}

      <SavedViewsBar
        moduleId="vendors"
        filters={vendorViewFilters}
        ownerUserId={appUserId}
        canWrite
        applyDefaultOnLoad={false}
        onApply={(f) => setSearch(String(f.q || ''))}
        onToast={showToast}
      />

      <div className={docsStyles.controls}>
        <input
          className={docsStyles.search}
          placeholder="Search company, contact, TRN…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className={docsStyles.loading}>Loading vendors…</div>
      ) : filtered.length === 0 ? (
        <div className={docsStyles.empty}>
          <EmptyState
            icon={<Building2 size={22} />}
            title="No vendors yet"
            subtitle="Register the supplier company from your invoice (name, TRN, contact)."
            actionLabel="Register vendor"
            onAction={openCreate}
          />
        </div>
      ) : (
        <div className={docsStyles.tableShell}>
          <div className={docsStyles.tableWrap}>
            <table className={docsStyles.table}>
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Contact</th>
                  {showTrn ? <th>TRN</th> : null}
                  <th>Phone / email</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((v) => (
                  <tr key={v.id}>
                    <td className={docsStyles.clientCell}>
                      <div className={docsStyles.ref}>{v.company_name}</div>
                      {v.address ? <div className={docsStyles.meta}>{v.address}</div> : null}
                    </td>
                    <td>{v.primary_contact || '—'}</td>
                    {showTrn ? <td>{v.trn || '—'}</td> : null}
                    <td>
                      {v.mobile || v.office || '—'}
                      {v.email ? <div className={docsStyles.meta}>{v.email}</div> : null}
                    </td>
                    <td className={docsStyles.actionsCell}>
                      <VendorRowActions
                        vendor={v}
                        expanded={actionsOpenId === v.id}
                        onToggle={() => setActionsOpenId((id) => (id === v.id ? null : v.id))}
                        onEdit={openEdit}
                        onDelete={setDeleteTarget}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal
        open={open}
        title={editing ? 'Edit vendor' : 'Register vendor'}
        onClose={() => setOpen(false)}
        width={editing ? 760 : 640}
      >
        <EditorSectionTabs
          value={editorSection}
          onChange={setEditorSection}
          sections={editing ? ['basics', 'terms', 'notes', 'lines'] : ['basics', 'terms', 'notes']}
        />
        <div style={editorPanelStyle(editorSection === 'basics')}>
        <p style={{ color: colors.muted, fontSize: 13, marginTop: 0, lineHeight: 1.45 }}>
          Enter the supplier’s <strong style={{ color: colors.text }}>company name</strong> as it
          appears on their tax invoice. There is no separate vendor number — the invoice number
          belongs on the supplier invoice form.
        </p>
        <div style={formGridStyle}>
          <div style={{ ...fieldStyle, gridColumn: '1 / -1' }}>
            <label style={labelStyle}>Company name *</label>
            <input
              style={inputStyle}
              value={form.company_name}
              onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))}
              placeholder="As printed on the supplier invoice"
            />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Primary contact</label>
            <input
              style={inputStyle}
              value={form.primary_contact}
              onChange={(e) => setForm((f) => ({ ...f, primary_contact: e.target.value }))}
            />
          </div>
          {showTrn ? (
            <div style={fieldStyle}>
              <label style={labelStyle}>TRN</label>
              <input
                style={inputStyle}
                value={form.trn}
                onChange={(e) => setForm((f) => ({ ...f, trn: e.target.value }))}
                placeholder="UAE tax registration number"
                disabled={!editTrn}
                readOnly={!editTrn}
              />
            </div>
          ) : null}
          <div style={fieldStyle}>
            <label style={labelStyle}>Email</label>
            <input
              style={inputStyle}
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Mobile</label>
            <input
              style={inputStyle}
              value={form.mobile}
              onChange={(e) => setForm((f) => ({ ...f, mobile: e.target.value }))}
            />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Office</label>
            <input
              style={inputStyle}
              value={form.office}
              onChange={(e) => setForm((f) => ({ ...f, office: e.target.value }))}
            />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Website</label>
            <input
              style={inputStyle}
              value={form.website}
              onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
            />
          </div>
          <div style={{ ...fieldStyle, gridColumn: '1 / -1' }}>
            <label style={labelStyle}>Address</label>
            <input
              style={inputStyle}
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
            />
          </div>
        </div>
        </div>

        <div style={editorPanelStyle(editorSection === 'terms')}>
          <div style={fieldStyle}>
            <label style={labelStyle}>Payment terms</label>
            <input
              style={inputStyle}
              value={form.payment_terms}
              onChange={(e) => setForm((f) => ({ ...f, payment_terms: e.target.value }))}
              placeholder="e.g. Net 30"
            />
          </div>
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
        </div>

        {editing ? (
          <div style={editorPanelStyle(editorSection === 'lines')}>
          <div style={{ marginTop: 8, marginBottom: 16 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                gap: 12,
                marginBottom: 8,
              }}
            >
              <label style={{ ...labelStyle, marginBottom: 0 }}>Supplier invoices</label>
              {!invoicesLoading && vendorInvoices.length > 0 ? (
                <span style={{ fontSize: 12, color: colors.muted }}>
                  {vendorInvoices.length} invoice{vendorInvoices.length === 1 ? '' : 's'} ·{' '}
                  {formatAED(invoiceTotal)} total
                </span>
              ) : null}
            </div>
            {invoicesLoading ? (
              <div style={{ fontSize: 13, color: colors.muted }}>Loading invoices…</div>
            ) : vendorInvoices.length === 0 ? (
              <div
                style={{
                  fontSize: 13,
                  color: colors.muted,
                  lineHeight: 1.45,
                  padding: '10px 12px',
                  background: colors.card,
                  border: `1px solid ${colors.border}`,
                  borderRadius: 8,
                }}
              >
                No supplier invoices linked to this company name yet. Save one from a quotation or
                Expenses — match the vendor name exactly.
              </div>
            ) : (
              <div style={{ ...tableWrapStyle, maxHeight: 280, overflow: 'auto', borderRadius: 8 }}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Date</th>
                      <th style={thStyle}>Invoice #</th>
                      <th style={thStyle}>Total</th>
                      <th style={thStyle}>Quote</th>
                      <th style={thStyle}>File</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vendorInvoices.map((e) => {
                      const parts = expenseVatParts(e)
                      const files = attachmentsByExpense.get(e.id) || []
                      const links = files.filter((a) => isHttpUrl(a.url))
                      return (
                        <tr key={e.id}>
                          <td style={tdStyle}>
                            {e.date ? format(parseISO(e.date.slice(0, 10)), 'dd MMM yyyy') : '—'}
                          </td>
                          <td style={tdStyle}>{e.supplier_invoice_no || '—'}</td>
                          <td style={tdStyle}>
                            {formatAED(parts.inclusive)}
                            {parts.vat > 0 ? (
                              <div style={{ fontSize: 11, color: colors.muted2 }}>
                                VAT {formatAED(parts.vat)}
                              </div>
                            ) : null}
                          </td>
                          <td style={tdStyle}>{e.quote_ref || e.references_text || '—'}</td>
                          <td style={tdStyle}>
                            {links.length === 0 ? (
                              <span style={{ color: colors.muted2 }}>—</span>
                            ) : (
                              links.map((a) => (
                                <a
                                  key={a.id}
                                  href={a.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 4,
                                    color: '#c1121f',
                                    fontSize: 12,
                                    marginRight: 8,
                                  }}
                                >
                                  <ExternalLink size={12} />
                                  {a.file_name || 'Open'}
                                </a>
                              ))
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          </div>
        ) : null}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
          <button type="button" style={buttonSecondaryStyle} onClick={() => setOpen(false)}>
            Cancel
          </button>
          <button type="button" style={buttonPrimaryStyle} disabled={saving} onClick={() => void save()}>
            {saving ? 'Saving…' : 'Save vendor'}
          </button>
        </div>
      </Modal>

      <Modal open={!!deleteTarget} title="Archive vendor?" onClose={() => setDeleteTarget(null)} width={400}>
        <p style={{ color: colors.muted, fontSize: 14 }}>
          Archive <strong style={{ color: colors.text }}>{deleteTarget?.company_name}</strong>? Past
          expenses keep the company name.
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button type="button" style={buttonSecondaryStyle} onClick={() => setDeleteTarget(null)}>
            Cancel
          </button>
          <button type="button" style={buttonDangerStyle} disabled={saving} onClick={() => void confirmDelete()}>
            Archive
          </button>
        </div>
      </Modal>
    </div>
  )
}
