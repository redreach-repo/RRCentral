import { useCallback, useEffect, useRef, useState } from 'react'
import { Download, HardDrive, Pencil, Plus, Trash2, Upload, Plug } from 'lucide-react'
import { db, currentAuthMode } from '../lib/db'
import type { AppUser, UserRole } from '../lib/types'
import { useAuth } from '../contexts/AuthContext'
import { useSettings } from '../contexts/SettingsContext'
import { useToast } from '../contexts/ToastContext'
import Modal from '../components/Modal'
import {
  importSheetsDumpFromFile,
  importSheetsDumpFromUrl,
  resetSheetsImportFlag,
} from '../lib/migrateFromSheets'
import { clearLocalData, DB_NAME, exportLocalDump } from '../lib/localDb'
import { testZohoConnection } from '../lib/zoho'
import {
  clearSupabaseRuntimeConfig,
  getSupabaseRuntimeConfig,
  saveSupabaseRuntimeConfig,
} from '../lib/supabaseConfig'
import {
  buttonDangerStyle,
  buttonPrimaryStyle,
  buttonSecondaryStyle,
  cardStyle,
  colors,
  downloadJson,
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

/** Editable per-division PDF title/closing — change anytime per customer standards. */
const DIVISION_FORMAT_KEYS = [
  { key: 'quoteFormat_01_documentTitle', label: 'Threads PDF title' },
  { key: 'quoteFormat_01_closingNote', label: 'Threads closing' },
  { key: 'quoteFormat_02_documentTitle', label: 'Wanders PDF title' },
  { key: 'quoteFormat_02_closingNote', label: 'Wanders closing' },
  { key: 'quoteFormat_03_documentTitle', label: 'Marketing PDF title' },
  { key: 'quoteFormat_03_scopeNotes', label: 'Marketing scope notes' },
  { key: 'quoteFormat_03_closingNote', label: 'Marketing closing' },
  { key: 'quoteFormat_04_documentTitle', label: 'Connect PDF title' },
  { key: 'quoteFormat_04_partnerName', label: 'Connect fulfilment partner' },
  { key: 'quoteFormat_04_scopeNotes', label: 'Connect scope notes' },
  { key: 'quoteFormat_04_closingNote', label: 'Connect closing' },
  { key: 'quoteFormat_06_documentTitle', label: 'Trading PDF title' },
  { key: 'quoteFormat_06_scopeNotes', label: 'Trading scope notes' },
  { key: 'quoteFormat_06_closingNote', label: 'Trading closing' },
] as const

const SYSTEM_KEYS = [
  { key: 'logoUrl', label: 'Logo URL' },
  { key: 'portalBaseUrl', label: 'Portal base URL' },
  { key: 'whatsappCountryCode', label: 'WhatsApp country code' },
  { key: 'followUpDaysAfterQuote', label: 'Follow-up days after quote' },
] as const

const WANDERS_KEYS = [
  { key: 'wandersTradingName', label: 'Trading / brand name' },
  { key: 'wandersLegalEntityName', label: 'Registered legal entity (TBC)' },
  { key: 'wandersRegisteredCountry', label: 'Registered country (TBC)' },
  { key: 'wandersRegisteredState', label: 'Registered state/province (TBC)' },
  { key: 'wandersRegistrationNumber', label: 'Registration / licence no. (TBC)' },
  { key: 'wandersRegisteredAddress', label: 'Registered address (TBC)' },
  { key: 'wandersTaxRegistration', label: 'Tax registration (TBC)' },
  { key: 'wandersTaxRules', label: 'Tax rules (TBC — do not assume UAE VAT)' },
  { key: 'wandersGoverningLaw', label: 'Governing law (TBC)' },
  { key: 'wandersDisputeJurisdiction', label: 'Courts / dispute jurisdiction (TBC)' },
  { key: 'wandersComplaintsContact', label: 'Complaints contact (TBC)' },
  { key: 'wandersPaymentAccountNames', label: 'Official payment-account names (TBC)' },
  { key: 'wandersBaseCurrency', label: 'Base / reporting currency (TBC)' },
  { key: 'wandersAccountingRevenueRule', label: 'Accounting revenue rule (TBC)' },
  { key: 'wandersDepositPercent', label: 'Default deposit %' },
  { key: 'wandersHoldBusinessDays', label: 'Default hold (business days)' },
  { key: 'wandersBalanceDaysBefore', label: 'Balance due (days before departure)' },
  { key: 'wandersTermsVersion', label: 'Current terms version' },
  { key: 'wandersPackageCodePrefix', label: 'Package code prefix' },
  { key: 'wandersApplyVat', label: 'Apply VAT on Wanders quotes (yes/no)' },
  { key: 'wandersVatRate', label: 'Wanders VAT rate (TBC)' },
] as const

const MESSAGE_KEYS = [
  { key: 'emailQuoteSubject', label: 'Quote email subject' },
  { key: 'emailQuoteBody', label: 'Quote email body' },
  { key: 'emailCrmSubject', label: 'CRM email subject' },
  { key: 'emailCrmBody', label: 'CRM email body' },
  { key: 'whatsappQuoteMessage', label: 'Quote WhatsApp message' },
  { key: 'whatsappCrmMessage', label: 'CRM WhatsApp message' },
  { key: 'whatsappFollowUpQuoteMessage', label: 'Follow-up WhatsApp (quotation)' },
  { key: 'whatsappFollowUpInvoiceMessage', label: 'Follow-up WhatsApp (invoice)' },
] as const

const ZOHO_KEYS = [
  { key: 'zohoClientId', label: 'Client ID' },
  { key: 'zohoClientSecret', label: 'Client Secret' },
  { key: 'zohoRefreshToken', label: 'Refresh Token' },
  { key: 'zohoAccountsDomain', label: 'Accounts domain' },
  { key: 'zohoCalendarDomain', label: 'Calendar domain' },
  { key: 'zohoMailDomain', label: 'Mail domain' },
  { key: 'zohoCalendarUid', label: 'Calendar UID (optional)' },
  { key: 'zohoMailAccountId', label: 'Mail account ID (optional)' },
  { key: 'zohoCalendarEnabled', label: 'Calendar sync (yes/no)' },
  { key: 'zohoMailEnabled', label: 'Mail send (yes/no)' },
] as const

type UserForm = { email: string; name: string; role: UserRole; active: boolean }

export default function SettingsPage() {
  const { userRole, isLocalMode } = useAuth()
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
  const [importing, setImporting] = useState(false)
  const [backingUp, setBackingUp] = useState(false)
  const [testingZoho, setTestingZoho] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const backupRef = useRef<HTMLInputElement>(null)
  const runtimeCfg = getSupabaseRuntimeConfig()
  const [supabaseUrl, setSupabaseUrl] = useState(runtimeCfg.source === 'runtime' ? runtimeCfg.url : '')
  const [supabaseKey, setSupabaseKey] = useState(
    runtimeCfg.source === 'runtime' ? runtimeCfg.anonKey : '',
  )
  const mode = currentAuthMode()

  useEffect(() => {
    setDraft({ ...settings })
  }, [settings])

  function connectSupabase() {
    if (!supabaseUrl.trim() || !supabaseKey.trim()) {
      showToast('Enter Supabase URL and anon key', 'error')
      return
    }
    if (!supabaseUrl.includes('supabase.co') && !supabaseUrl.startsWith('http')) {
      showToast('URL looks invalid', 'error')
      return
    }
    saveSupabaseRuntimeConfig(supabaseUrl, supabaseKey)
    showToast('Cloud credentials saved — reloading…', 'success')
    window.setTimeout(() => window.location.reload(), 600)
  }

  function disconnectSupabase() {
    clearSupabaseRuntimeConfig()
    showToast('Disconnected from Supabase — reloading…', 'success')
    window.setTimeout(() => window.location.reload(), 600)
  }

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

  async function handleImportFile(file: File | null) {
    if (!file) return
    setImporting(true)
    try {
      const counts = await importSheetsDumpFromFile(file)
      showToast(
        `Imported Sheets data: ${counts.crm || 0} CRM, ${counts.quotations || 0} quotes, ${counts.invoices || 0} invoices`,
        'success',
      )
      window.location.reload()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Import failed', 'error')
    } finally {
      setImporting(false)
    }
  }

  async function handleImportBundled() {
    setImporting(true)
    try {
      resetSheetsImportFlag()
      const url = `${import.meta.env.BASE_URL}migration-data.json`
      const counts = await importSheetsDumpFromUrl(url)
      showToast(
        `Imported Sheets data: ${counts.crm || 0} CRM, ${counts.quotations || 0} quotes, ${counts.invoices || 0} invoices`,
        'success',
      )
      window.location.reload()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Bundled dump not found — export from Apps Script first', 'error')
    } finally {
      setImporting(false)
    }
  }

  async function handleBackupDownload() {
    setBackingUp(true)
    try {
      const dump = await exportLocalDump()
      const stamp = new Date().toISOString().slice(0, 10)
      downloadJson(`rrcentral-backup-${stamp}.json`, dump)
      showToast('Backup downloaded', 'success')
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Backup failed', 'error')
    } finally {
      setBackingUp(false)
    }
  }

  async function handleRestoreBackup(file: File | null) {
    if (!file) return
    if (!window.confirm('Restore this backup? It replaces all CRM data in this browser.')) return
    setImporting(true)
    try {
      const counts = await importSheetsDumpFromFile(file)
      showToast(
        `Restored backup: ${counts.crm || 0} CRM, ${counts.quotations || 0} quotes, ${counts.invoices || 0} invoices`,
        'success',
      )
      window.location.reload()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Restore failed', 'error')
    } finally {
      setImporting(false)
    }
  }

  async function handleClearLocal() {
    if (
      !window.confirm(
        'Clear all local CRM data in this browser? Download a backup first. This cannot be undone.',
      )
    ) {
      return
    }
    setBusy(true)
    try {
      resetSheetsImportFlag()
      await clearLocalData()
      showToast('Local data cleared — defaults restored', 'success')
      window.location.reload()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Clear failed', 'error')
    } finally {
      setBusy(false)
    }
  }

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

  async function handleTestZoho() {
    setTestingZoho(true)
    try {
      // Persist draft Zoho keys first so test uses latest values
      for (const { key } of ZOHO_KEYS) {
        const value = draft[key] ?? settings[key] ?? ''
        if ((settings[key] ?? '') !== value) {
          await updateSetting(key, value)
        }
      }
      const result = await testZohoConnection({ ...settings, ...draft })
      showToast(result, 'success')
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Zoho test failed', 'error')
    } finally {
      setTestingZoho(false)
    }
  }

  return (
    <div style={pageStyle}>
      <h1 style={pageTitleStyle}>Settings</h1>
      <p style={pageSubtitleStyle}>Company details, data storage, and user access</p>

      <div style={{ ...cardStyle, marginBottom: 20 }}>
        <h2 style={{ ...sectionTitleStyle, display: 'flex', alignItems: 'center', gap: 8 }}>
          <HardDrive size={18} /> Data &amp; storage
        </h2>
        {isLocalMode || mode === 'local' ? (
          <>
            <p style={{ color: colors.muted, fontSize: 13, marginTop: 0, lineHeight: 1.55 }}>
              Mode: <strong style={{ color: colors.text }}>Local (this browser only)</strong>
              <br />
              Database: IndexedDB <code style={{ color: '#ff9f4a' }}>{DB_NAME}</code>
              <br />
              CRM, quotes, invoices, expenses, and settings stay on this device. They are{' '}
              <strong style={{ color: colors.text }}>not</strong> synced to the cloud. Clearing browser
              site data deletes everything — download a backup regularly.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
              <button
                type="button"
                style={buttonPrimaryStyle}
                disabled={backingUp}
                onClick={() => void handleBackupDownload()}
              >
                <Download size={14} />
                {backingUp ? 'Preparing…' : 'Download backup JSON'}
              </button>
              <button
                type="button"
                style={buttonSecondaryStyle}
                disabled={importing}
                onClick={() => backupRef.current?.click()}
              >
                <Upload size={14} />
                Restore backup…
              </button>
              <button
                type="button"
                style={buttonDangerStyle}
                disabled={busy}
                onClick={() => void handleClearLocal()}
              >
                <Trash2 size={14} />
                Clear local data
              </button>
              <input
                ref={backupRef}
                type="file"
                accept="application/json,.json"
                style={{ display: 'none' }}
                onChange={(e) => void handleRestoreBackup(e.target.files?.[0] || null)}
              />
            </div>

            <h3 style={{ margin: '8px 0 10px', fontSize: 14 }}>Connect Supabase (shared cloud)</h3>
            <p style={{ color: colors.muted2, fontSize: 12, margin: '0 0 10px', lineHeight: 1.45 }}>
              Create a Supabase project, run <code>app/supabase-schema.sql</code>, enable Google OAuth,
              then paste the project URL and anon key here. No redeploy needed.
            </p>
            <div style={{ display: 'grid', gap: 10, marginBottom: 12 }}>
              <div>
                <label style={labelStyle}>Supabase URL</label>
                <input
                  style={inputStyle}
                  value={supabaseUrl}
                  onChange={(e) => setSupabaseUrl(e.target.value)}
                  placeholder="https://xxxx.supabase.co"
                />
              </div>
              <div>
                <label style={labelStyle}>Anon key</label>
                <input
                  style={inputStyle}
                  value={supabaseKey}
                  onChange={(e) => setSupabaseKey(e.target.value)}
                  placeholder="eyJhbGciOi…"
                />
              </div>
            </div>
            <button type="button" style={buttonPrimaryStyle} onClick={connectSupabase}>
              <Plug size={14} /> Connect &amp; reload
            </button>
          </>
        ) : (
          <>
            <p style={{ color: colors.muted, fontSize: 13, marginTop: 0, lineHeight: 1.55 }}>
              Mode: <strong style={{ color: colors.text }}>Supabase cloud</strong>
              <br />
              Source:{' '}
              {runtimeCfg.source === 'env' ? 'build environment variables' : 'Settings credentials'}
              <br />
              Business data is stored in your Supabase Postgres project. Auth uses Google OAuth via
              Supabase.
            </p>
            {runtimeCfg.source === 'runtime' ? (
              <button type="button" style={buttonSecondaryStyle} onClick={disconnectSupabase}>
                Disconnect cloud (back to local)
              </button>
            ) : null}
          </>
        )}
      </div>

      {renderSection('Company info', 'Company', COMPANY_KEYS)}
      {renderSection('Bank details', 'Bank', BANK_KEYS)}
      {renderSection('Quote / Invoice settings', 'Quote settings', QUOTE_KEYS)}
      {renderSection(
        'Division quotation formats (editable titles, closings, Connect partner name)',
        'Division formats',
        DIVISION_FORMAT_KEYS,
      )}
      {renderSection(
        'RR Wanders (TBC legal / tax / currency — not for live customer docs until confirmed)',
        'Wanders',
        WANDERS_KEYS,
      )}
      {renderSection('System', 'System', SYSTEM_KEYS)}

      <div style={{ ...cardStyle, marginBottom: 20 }}>
        <h2 style={sectionTitleStyle}>Message templates</h2>
        <p style={{ color: colors.muted, fontSize: 13, marginTop: 0, lineHeight: 1.5 }}>
          Tokens: <code>{'{{ref}}'}</code>, <code>{'{{client}}'}</code>, <code>{'{{contact}}'}</code>,{' '}
          <code>{'{{amount}}'}</code>, <code>{'{{company}}'}</code>, <code>{'{{title}}'}</code>,{' '}
          <code>{'{{validUntil}}'}</code>, <code>{'{{contactGreeting}}'}</code>
        </p>
        <div style={{ display: 'grid', gap: 12, marginBottom: 12 }}>
          {MESSAGE_KEYS.map(({ key, label }) => (
            <div key={key} style={fieldStyle}>
              <label style={labelStyle}>{label}</label>
              {key.toLowerCase().includes('body') || key.toLowerCase().includes('message') ? (
                <textarea
                  style={{ ...inputStyle, minHeight: 90, resize: 'vertical' }}
                  value={draft[key] ?? ''}
                  onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                />
              ) : (
                <input
                  style={inputStyle}
                  value={draft[key] ?? ''}
                  onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                />
              )}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            style={buttonPrimaryStyle}
            disabled={savingSection === 'Messages' || settingsLoading}
            onClick={() => void saveSection(MESSAGE_KEYS, 'Messages')}
          >
            {savingSection === 'Messages' ? 'Saving…' : 'Save templates'}
          </button>
        </div>
      </div>

      <div style={{ ...cardStyle, marginBottom: 20 }}>
        <h2 style={{ ...sectionTitleStyle, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Plug size={18} /> Zoho Calendar &amp; Mail
        </h2>
        <p style={{ color: colors.muted, fontSize: 13, marginTop: 0, lineHeight: 1.55 }}>
          Connect Zoho so CRM follow-ups sync to Calendar and Email sends via Zoho Mail.
          Create a Self Client in the{' '}
          <a
            href="https://api-console.zoho.com/"
            target="_blank"
            rel="noreferrer"
            style={{ color: colors.accent }}
          >
            Zoho API Console
          </a>
          , generate a refresh token with scopes{' '}
          <code style={{ color: '#ff9f4a' }}>ZohoCalendar.event.ALL</code> and{' '}
          <code style={{ color: '#ff9f4a' }}>ZohoMail.messages.CREATE</code>
          (plus <code style={{ color: '#ff9f4a' }}>ZohoMail.accounts.READ</code>), then paste
          credentials below. Set Calendar sync / Mail send to <strong>yes</strong> to enable.
          Use regional domains if your org is on .eu / .in (e.g.{' '}
          <code>https://accounts.zoho.eu</code>).
        </p>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 12,
            marginBottom: 14,
          }}
        >
          {ZOHO_KEYS.map(({ key, label }) => (
            <div key={key} style={fieldStyle}>
              <label style={labelStyle}>{label}</label>
              <input
                style={inputStyle}
                type={
                  key.toLowerCase().includes('secret') || key.toLowerCase().includes('token')
                    ? 'password'
                    : 'text'
                }
                value={draft[key] ?? ''}
                placeholder={
                  key === 'zohoAccountsDomain'
                    ? 'https://accounts.zoho.com'
                    : key === 'zohoCalendarDomain'
                      ? 'https://calendar.zoho.com'
                      : key === 'zohoMailDomain'
                        ? 'https://mail.zoho.com'
                        : key.includes('Enabled')
                          ? 'yes / no'
                          : ''
                }
                onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
              />
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button
            type="button"
            style={buttonPrimaryStyle}
            disabled={savingSection === 'Zoho' || settingsLoading}
            onClick={() => void saveSection(ZOHO_KEYS, 'Zoho')}
          >
            {savingSection === 'Zoho' ? 'Saving…' : 'Save Zoho settings'}
          </button>
          <button
            type="button"
            style={buttonSecondaryStyle}
            disabled={testingZoho}
            onClick={() => void handleTestZoho()}
          >
            <Plug size={14} />
            {testingZoho ? 'Testing…' : 'Test connection'}
          </button>
        </div>
      </div>

      {currentAuthMode() === 'local' && (
        <div style={{ ...cardStyle, marginBottom: 20 }}>
          <h2 style={sectionTitleStyle}>Import Google Sheets data</h2>
          <p style={{ color: colors.muted, fontSize: 13, marginTop: 0, lineHeight: 1.5 }}>
            Pull your existing CRM, quotes, invoices, and catalog from the Apps Script spreadsheet
            into this browser. This replaces local data — download a backup first.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button
              type="button"
              style={buttonPrimaryStyle}
              disabled={importing}
              onClick={() => void handleImportBundled()}
            >
              <Upload size={14} style={{ marginRight: 6 }} />
              {importing ? 'Importing…' : 'Import bundled Sheets dump'}
            </button>
            <button
              type="button"
              style={buttonSecondaryStyle}
              disabled={importing}
              onClick={() => fileRef.current?.click()}
            >
              Upload migration JSON…
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              style={{ display: 'none' }}
              onChange={(e) => void handleImportFile(e.target.files?.[0] || null)}
            />
          </div>
        </div>
      )}

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
