import { useCallback, useEffect, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { db } from '../lib/db'
import type { AppUser, UserRole } from '../lib/types'
import { useAuth } from '../contexts/AuthContext'
import { useSettings } from '../contexts/SettingsContext'
import { useToast } from '../contexts/ToastContext'
import Modal from '../components/Modal'
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
  sectionTitleStyle,
  selectStyle,
  tableStyle,
  tableWrapStyle,
  tdStyle,
  thStyle,
} from '../lib/uiStyles'

const COMPANY_KEYS = [
  { key: 'companyName', label: 'Company name' },
  { key: 'brand', label: 'Brand' },
  { key: 'tagline', label: 'Tagline' },
  { key: 'address', label: 'Address' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'website', label: 'Website' },
  { key: 'trn', label: 'TRN' },
] as const

const BANK_KEYS = [
  { key: 'accountName', label: 'Account name' },
  { key: 'bankName', label: 'Bank name' },
  { key: 'bankAccount', label: 'Account number' },
  { key: 'iban', label: 'IBAN' },
  { key: 'swift', label: 'SWIFT' },
] as const

const QUOTE_KEYS = [
  { key: 'paymentTerms', label: 'Default payment terms' },
  { key: 'paymentMethod', label: 'Default payment method' },
  { key: 'deliveryTerms', label: 'Default delivery terms' },
  { key: 'quoteClosing', label: 'Quote closing' },
  { key: 'quoteTerms', label: 'Quote terms' },
  { key: 'moqTerms', label: 'MOQ terms' },
  { key: 'moqDefault', label: 'Default MOQ' },
  { key: 'quoteValidityDays', label: 'Quote validity (days)' },
  { key: 'vatRate', label: 'VAT rate' },
  { key: 'currency', label: 'Currency' },
  { key: 'quotePrefix', label: 'Quote prefix' },
  { key: 'invoicePrefix', label: 'Invoice prefix' },
] as const

const SYSTEM_KEYS = [
  { key: 'logoUrl', label: 'Logo URL' },
  { key: 'portalBaseUrl', label: 'Portal base URL' },
  { key: 'whatsappCountryCode', label: 'WhatsApp country code' },
  { key: 'followUpDaysAfterQuote', label: 'Follow-up days after quote' },
] as const

type UserForm = { email: string; name: string; role: UserRole; active: boolean }

export default function SettingsPage() {
  const { userRole } = useAuth()
  const { settings, updateSetting, loading: settingsLoading } = useSettings()
  const { showToast } = useToast()
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [savingSection, setSavingSection] = useState('')
  const [users, setUsers] = useState<AppUser[]>([])
  const [userOpen, setUserOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<AppUser | null>(null)
  const [userForm, setUserForm] = useState<UserForm>({
    email: '',
    name: '',
    role: 'sales',
    active: true,
  })
  const [deleteUser, setDeleteUser] = useState<AppUser | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setDraft({ ...settings })
  }, [settings])

  const loadUsers = useCallback(async () => {
    const { data, error } = await db.from('app_users').select('*').order('name')
    if (error) {
      showToast(error.message, 'error')
      return
    }
    setUsers((data || []) as AppUser[])
  }, [showToast])

  useEffect(() => {
    if (userRole === 'admin') void loadUsers()
  }, [userRole, loadUsers])

  if (userRole !== 'admin') {
    return (
      <div style={pageStyle}>
        <h1 style={pageTitleStyle}>Settings</h1>
        <div style={{ ...cardStyle, color: colors.danger }}>Access denied — admin only.</div>
      </div>
    )
  }

  async function saveSection(keys: readonly { key: string; label: string }[], section: string) {
    setSavingSection(section)
    try {
      for (const { key } of keys) {
        await updateSetting(key, draft[key] ?? '')
      }
      showToast(`${section} saved`, 'success')
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Save failed', 'error')
    } finally {
      setSavingSection('')
    }
  }

  function renderSection(
    title: string,
    sectionId: string,
    keys: readonly { key: string; label: string }[],
  ) {
    return (
      <div style={{ ...cardStyle, marginBottom: 20 }}>
        <h2 style={sectionTitleStyle}>{title}</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          {keys.map(({ key, label }) => (
            <div key={key} style={fieldStyle}>
              <label style={labelStyle}>{label}</label>
              <input
                style={inputStyle}
                value={draft[key] ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
              />
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
          <button
            type="button"
            style={buttonPrimaryStyle}
            disabled={savingSection === sectionId || settingsLoading}
            onClick={() => void saveSection(keys, sectionId)}
          >
            {savingSection === sectionId ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    )
  }

  function openUserCreate() {
    setEditingUser(null)
    setUserForm({ email: '', name: '', role: 'sales', active: true })
    setUserOpen(true)
  }

  function openUserEdit(u: AppUser) {
    setEditingUser(u)
    setUserForm({
      email: u.email,
      name: u.name || '',
      role: u.role,
      active: u.active,
    })
    setUserOpen(true)
  }

  async function saveUser() {
    if (!userForm.email.trim()) {
      showToast('Email is required', 'error')
      return
    }
    setBusy(true)
    try {
      const payload = {
        email: userForm.email.trim().toLowerCase(),
        name: userForm.name.trim(),
        role: userForm.role,
        active: userForm.active,
      }
      if (editingUser) {
        const { error } = await db.from('app_users').update(payload).eq('id', editingUser.id)
        if (error) throw error
      } else {
        const { error } = await db.from('app_users').insert(payload)
        if (error) throw error
      }
      showToast('User saved', 'success')
      setUserOpen(false)
      await loadUsers()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Save failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function confirmDeleteUser() {
    if (!deleteUser) return
    setBusy(true)
    try {
      const { error } = await db.from('app_users').delete().eq('id', deleteUser.id)
      if (error) throw error
      showToast('User deleted', 'success')
      setDeleteUser(null)
      await loadUsers()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Delete failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={pageStyle}>
      <h1 style={pageTitleStyle}>Settings</h1>
      <p style={pageSubtitleStyle}>Company details, defaults, and user access</p>

      {renderSection('Company info', 'Company', COMPANY_KEYS)}
      {renderSection('Bank details', 'Bank', BANK_KEYS)}
      {renderSection('Quote / Invoice settings', 'Quote settings', QUOTE_KEYS)}
      {renderSection('System', 'System', SYSTEM_KEYS)}

      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ ...sectionTitleStyle, margin: 0 }}>User management</h2>
          <button type="button" style={buttonPrimaryStyle} onClick={openUserCreate}>
            <Plus size={16} /> Add user
          </button>
        </div>
        <div style={tableWrapStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Name</th>
                <th style={thStyle}>Email</th>
                <th style={thStyle}>Role</th>
                <th style={thStyle}>Active</th>
                <th style={thStyle}></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td style={tdStyle}>{u.name || '—'}</td>
                  <td style={tdStyle}>{u.email}</td>
                  <td style={tdStyle}>{u.role}</td>
                  <td style={tdStyle}>{u.active ? 'Yes' : 'No'}</td>
                  <td style={tdStyle}>
                    <button type="button" style={buttonSecondaryStyle} onClick={() => openUserEdit(u)}>
                      <Pencil size={14} />
                    </button>{' '}
                    <button type="button" style={buttonDangerStyle} onClick={() => setDeleteUser(u)}>
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={userOpen} title={editingUser ? 'Edit user' : 'Add user'} onClose={() => setUserOpen(false)} width={440}>
        <div style={fieldStyle}>
          <label style={labelStyle}>Email *</label>
          <input
            style={inputStyle}
            value={userForm.email}
            disabled={!!editingUser}
            onChange={(e) => setUserForm((f) => ({ ...f, email: e.target.value }))}
          />
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>Name</label>
          <input
            style={inputStyle}
            value={userForm.name}
            onChange={(e) => setUserForm((f) => ({ ...f, name: e.target.value }))}
          />
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>Role</label>
          <select
            style={selectStyle}
            value={userForm.role}
            onChange={(e) => setUserForm((f) => ({ ...f, role: e.target.value as UserRole }))}
          >
            <option value="sales">sales</option>
            <option value="admin">admin</option>
          </select>
        </div>
        <div style={{ ...fieldStyle, display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            id="user-active"
            checked={userForm.active}
            onChange={(e) => setUserForm((f) => ({ ...f, active: e.target.checked }))}
          />
          <label htmlFor="user-active" style={{ fontSize: 13 }}>Active</label>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" style={buttonSecondaryStyle} onClick={() => setUserOpen(false)}>Cancel</button>
          <button type="button" style={buttonPrimaryStyle} disabled={busy} onClick={() => void saveUser()}>Save</button>
        </div>
      </Modal>

      <Modal open={!!deleteUser} title="Delete user?" onClose={() => setDeleteUser(null)} width={400}>
        <p style={{ color: colors.muted, fontSize: 14 }}>
          Delete <strong style={{ color: colors.text }}>{deleteUser?.email}</strong>?
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button type="button" style={buttonSecondaryStyle} onClick={() => setDeleteUser(null)}>Cancel</button>
          <button type="button" style={buttonDangerStyle} disabled={busy} onClick={() => void confirmDeleteUser()}>
            Delete
          </button>
        </div>
      </Modal>
    </div>
  )
}
