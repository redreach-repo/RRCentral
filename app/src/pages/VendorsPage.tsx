import { useCallback, useEffect, useMemo, useState } from 'react'
import { Building2, Pencil, Plus, Trash2 } from 'lucide-react'
import { db } from '../lib/db'
import type { Vendor } from '../lib/types'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import Modal from '../components/Modal'
import EmptyState from '../components/EmptyState'
import { logActivity } from '../lib/activity'
import { errorMessage, isMissingRelationError } from '../lib/errors'
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
  pageStyle,
  pageSubtitleStyle,
  pageTitleStyle,
  tableStyle,
  tableWrapStyle,
  tdStyle,
  thStyle,
  toolbarStyle,
} from '../lib/uiStyles'

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

export default function VendorsPage() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Vendor | null>(null)
  const [form, setForm] = useState<VendorForm>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Vendor | null>(null)
  const [missingTable, setMissingTable] = useState(false)

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
    setOpen(true)
  }

  async function save() {
    if (!form.company_name.trim()) {
      showToast('Company name is required', 'error')
      return
    }
    setSaving(true)
    try {
      const payload = {
        company_name: form.company_name.trim(),
        primary_contact: form.primary_contact.trim(),
        email: form.email.trim(),
        mobile: form.mobile.trim(),
        office: form.office.trim(),
        address: form.address.trim(),
        trn: form.trn.trim(),
        website: form.website.trim(),
        payment_terms: form.payment_terms.trim(),
        notes: form.notes.trim(),
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
          'Vendors table is missing. Run supabase-vendors-upgrade.sql in Supabase first.',
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
    <div style={pageStyle}>
      <div style={toolbarStyle}>
        <div>
          <h1 style={pageTitleStyle}>Vendors</h1>
          <p style={pageSubtitleStyle}>
            Register suppliers you buy from (uniforms, goods). Pick them when saving a supplier
            invoice — you do not need a vendor number.
          </p>
        </div>
        <button type="button" style={buttonPrimaryStyle} onClick={openCreate} disabled={missingTable}>
          <Plus size={16} /> Register vendor
        </button>
      </div>

      {missingTable ? (
        <div style={{ ...cardStyle, color: colors.muted, lineHeight: 1.55 }}>
          The <code>vendors</code> table is not on this database yet. Run{' '}
          <code>app/supabase-vendors-upgrade.sql</code> in the Supabase SQL editor, then refresh.
        </div>
      ) : null}

      <div style={{ marginBottom: 16 }}>
        <input
          style={{ ...inputStyle, maxWidth: 360 }}
          placeholder="Search company, contact, TRN…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div style={{ ...cardStyle, color: colors.muted }}>Loading vendors…</div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Building2 size={22} />}
          title="No vendors yet"
          subtitle="Register the supplier company from your invoice (name, TRN, contact)."
          actionLabel="Register vendor"
          onAction={openCreate}
        />
      ) : (
        <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
          <div style={tableWrapStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Company</th>
                  <th style={thStyle}>Contact</th>
                  <th style={thStyle}>TRN</th>
                  <th style={thStyle}>Phone / email</th>
                  <th style={thStyle}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((v) => (
                  <tr key={v.id}>
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 600 }}>{v.company_name}</div>
                      {v.address ? (
                        <div style={{ fontSize: 11, color: colors.muted2 }}>{v.address}</div>
                      ) : null}
                    </td>
                    <td style={tdStyle}>{v.primary_contact || '—'}</td>
                    <td style={tdStyle}>{v.trn || '—'}</td>
                    <td style={tdStyle}>
                      {v.mobile || v.office || '—'}
                      {v.email ? (
                        <div style={{ fontSize: 11, color: colors.muted2 }}>{v.email}</div>
                      ) : null}
                    </td>
                    <td style={tdStyle}>
                      <button type="button" style={buttonSecondaryStyle} onClick={() => openEdit(v)}>
                        <Pencil size={14} />
                      </button>{' '}
                      <button
                        type="button"
                        style={buttonDangerStyle}
                        onClick={() => setDeleteTarget(v)}
                      >
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

      <Modal
        open={open}
        title={editing ? 'Edit vendor' : 'Register vendor'}
        onClose={() => setOpen(false)}
        width={640}
      >
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
          <div style={fieldStyle}>
            <label style={labelStyle}>TRN</label>
            <input
              style={inputStyle}
              value={form.trn}
              onChange={(e) => setForm((f) => ({ ...f, trn: e.target.value }))}
              placeholder="UAE tax registration number"
            />
          </div>
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
        <div style={fieldStyle}>
          <label style={labelStyle}>Notes</label>
          <textarea
            style={{ ...inputStyle, minHeight: 70, resize: 'vertical' }}
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
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
