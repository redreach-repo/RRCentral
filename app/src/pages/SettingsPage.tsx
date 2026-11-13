import { useCallback, useEffect, useRef, useState } from 'react'
import CtrmListsCard from '../components/ctrm/CtrmListsCard'
import GmailCalendarCard from '../components/GmailCalendarCard'
import GoogleDriveCard from '../components/GoogleDriveCard'
import M365MailCalendarCard from '../components/M365MailCalendarCard'
import HubSpotCard from '../components/HubSpotCard'
import PipelinesSettingsCard from '../components/settings/PipelinesSettingsCard'
import WorkflowRunsCard from '../components/settings/WorkflowRunsCard'
import WorkflowsSettingsCard from '../components/settings/WorkflowsSettingsCard'
import { Download, HardDrive, Plus, Trash2, Upload, Plug } from 'lucide-react'
import SimpleRowActions from '../components/SimpleRowActions'
import { db, currentAuthMode } from '../lib/db'
import type { AppUser, CompanyDocument, CompanyDocumentCategory, UserRole } from '../lib/types'
import TwoStepCard from '../components/security/TwoStepCard'
import { useAuth } from '../contexts/AuthContext'
import { useSettings } from '../contexts/SettingsContext'
import { useToast } from '../contexts/ToastContext'
import Modal from '../components/Modal'
import {
  importSheetsDumpFromFile,
  resetSheetsImportFlag,
} from '../lib/migrateFromSheets'
import { clearLocalData, DB_NAME } from '../lib/localDb'
import { downloadCentralBackup } from '../lib/centralBackup'
import { importCloudDumpFromFile } from '../lib/importCloudDump'
import {
  DEFAULT_MAIL_CALENDAR_PROVIDER,
  MAIL_CALENDAR_PROVIDER_SETTING_KEY,
  listMailCalendarProviderOptions,
  resolveMailCalendarProviderId,
} from '../lib/mailCalendar'
import { testZohoConnection } from '../lib/zoho'
import { authApi, MIN_PASSWORD_LENGTH } from '../lib/authApi'
import { parseAppUserForm } from '../lib/schemas/appUser'
import { parseChangePassword } from '../lib/schemas/changePassword'
import {
  COMPANY_DOC_CATEGORIES,
  companyDocCategoryLabel,
  deleteCompanyDocument,
  listCompanyDocuments,
  saveCompanyDocument,
} from '../lib/companyDocs'
import { can, ROLE_DESCRIPTIONS, ROLE_LABELS, USER_ROLES } from '../lib/permissions'
import {
  listNumberingSequences,
  previewNextReference,
  type NumberingSequence,
} from '../lib/numbering'
import {
  CUSTOM_FIELD_OBJECTS,
  CUSTOM_FIELD_TYPES,
  listAllCustomFieldDefinitions,
  parseSelectOptions,
  saveCustomFieldDefinition,
  setCustomFieldDefinitionActive,
  slugifyFieldKey,
  type CustomFieldDefinition,
  type CustomFieldType,
} from '../lib/customFields'
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
import { errorMessage } from '../lib/errors'

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
  { key: 'deliveryNotePrefix', label: 'Delivery note prefix' },
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
  { key: 'zohoMailEnabled', label: 'Mail send + inbox (yes/no)' },
] as const

const MAIL_CALENDAR_PROVIDER_KEYS = [
  { key: MAIL_CALENDAR_PROVIDER_SETTING_KEY, label: 'Mail & calendar provider' },
] as const

type UserForm = {
  email: string
  name: string
  role: UserRole
  active: boolean
  password: string
}

export default function SettingsPage() {
  const { user, userRole, isLocalMode, changePassword } = useAuth()
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
    password: '',
  })
  const [deleteUser, setDeleteUser] = useState<AppUser | null>(null)
  const [busy, setBusy] = useState(false)
  const [importing, setImporting] = useState(false)
  const [backingUp, setBackingUp] = useState(false)
  const [testingZoho, setTestingZoho] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)
  const [companyDocs, setCompanyDocs] = useState<CompanyDocument[]>([])
  const [companyDocsMissing, setCompanyDocsMissing] = useState(false)
  const [companyDocOpen, setCompanyDocOpen] = useState(false)
  const [editingCompanyDoc, setEditingCompanyDoc] = useState<CompanyDocument | null>(null)
  const [companyDocForm, setCompanyDocForm] = useState({
    category: 'trade_license' as CompanyDocumentCategory,
    title: '',
    file_name: '',
    drive_url: '',
    notes: '',
    expires_on: '',
  })
  const [deleteCompanyDoc, setDeleteCompanyDoc] = useState<CompanyDocument | null>(null)
  const [userActionsId, setUserActionsId] = useState<string | null>(null)
  const [docActionsId, setDocActionsId] = useState<string | null>(null)
  const [numberingRows, setNumberingRows] = useState<NumberingSequence[]>([])
  const [numberingLoading, setNumberingLoading] = useState(false)
  const [customFields, setCustomFields] = useState<CustomFieldDefinition[]>([])
  const [customFieldsLoading, setCustomFieldsLoading] = useState(false)
  const [customFieldOpen, setCustomFieldOpen] = useState(false)
  const [editingCustomField, setEditingCustomField] = useState<CustomFieldDefinition | null>(null)
  const [customFieldForm, setCustomFieldForm] = useState({
    object_type: 'account',
    label: '',
    field_type: 'text' as CustomFieldType,
    optionsText: '',
    required: false,
    sort_order: 0,
    active: true,
  })
  const [customFieldActionsId, setCustomFieldActionsId] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const backupRef = useRef<HTMLInputElement>(null)
  const cloudBackupRef = useRef<HTMLInputElement>(null)
  const runtimeCfg = getSupabaseRuntimeConfig()
  const [supabaseUrl, setSupabaseUrl] = useState(
    runtimeCfg.source === 'runtime'
      ? runtimeCfg.url
      : runtimeCfg.url || 'https://pszjylxrpvlumldtptrr.supabase.co',
  )
  const [supabaseKey, setSupabaseKey] = useState(
    runtimeCfg.source === 'runtime' ? runtimeCfg.anonKey : '',
  )
  const mode = currentAuthMode()

  useEffect(() => {
    setDraft({ ...settings })
  }, [settings])

  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, '')
    if (!hash) return
    const el = document.getElementById(hash)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  function connectSupabase() {
    const url = supabaseUrl.trim().replace(/\/+$/, '')
    const key = supabaseKey.trim()
    if (!url || !key) {
      showToast('Enter Supabase URL and anon key', 'error')
      return
    }
    // Must be the API host (https://xxxx.supabase.co), never the dashboard URL.
    const apiHostOk = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url)
    if (!apiHostOk || url.includes('supabase.com/dashboard')) {
      showToast(
        'Use Project URL like https://xxxx.supabase.co (not the dashboard link)',
        'error',
      )
      return
    }
    if (!key.startsWith('eyJ') && !key.startsWith('sb_publishable_')) {
      showToast('Anon key looks wrong — paste the anon/public key', 'error')
      return
    }
    saveSupabaseRuntimeConfig(url, key)
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

  const loadCompanyDocs = useCallback(async () => {
    try {
      const { rows, missingTable } = await listCompanyDocuments()
      setCompanyDocs(rows)
      setCompanyDocsMissing(missingTable)
    } catch (e) {
      showToast(errorMessage(e, 'Could not load company documents'), 'error')
    }
  }, [showToast])

  const loadNumbering = useCallback(async () => {
    setNumberingLoading(true)
    try {
      setNumberingRows(await listNumberingSequences())
    } catch {
      setNumberingRows([])
    } finally {
      setNumberingLoading(false)
    }
  }, [])

  const loadCustomFields = useCallback(async () => {
    setCustomFieldsLoading(true)
    try {
      setCustomFields(await listAllCustomFieldDefinitions())
    } catch {
      setCustomFields([])
    } finally {
      setCustomFieldsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (can(userRole, 'users.manage')) void loadUsers()
  }, [userRole, loadUsers])

  useEffect(() => {
    void loadNumbering()
  }, [loadNumbering])

  useEffect(() => {
    if (can(userRole, 'settings.manage') || can(userRole, 'users.manage')) void loadCustomFields()
  }, [userRole, loadCustomFields])

  useEffect(() => {
    if (can(userRole, 'settings.manage')) void loadCompanyDocs()
  }, [userRole, loadCompanyDocs])

  function openCompanyDocCreate() {
    setEditingCompanyDoc(null)
    setCompanyDocForm({
      category: 'trade_license',
      title: '',
      file_name: '',
      drive_url: '',
      notes: '',
      expires_on: '',
    })
    setCompanyDocOpen(true)
  }

  function openCompanyDocEdit(doc: CompanyDocument) {
    setEditingCompanyDoc(doc)
    setCompanyDocForm({
      category: doc.category,
      title: doc.title || '',
      file_name: doc.file_name || '',
      drive_url: doc.drive_url || '',
      notes: doc.notes || '',
      expires_on: doc.expires_on ? String(doc.expires_on).slice(0, 10) : '',
    })
    setCompanyDocOpen(true)
  }

  async function saveCompanyDoc() {
    setBusy(true)
    try {
      await saveCompanyDocument(
        {
          category: companyDocForm.category,
          title: companyDocForm.title,
          file_name: companyDocForm.file_name,
          drive_url: companyDocForm.drive_url,
          notes: companyDocForm.notes,
          expires_on: companyDocForm.expires_on || null,
          uploaded_by: user?.email || '',
        },
        editingCompanyDoc?.id,
      )
      showToast(editingCompanyDoc ? 'Document updated' : 'Document added', 'success')
      setCompanyDocOpen(false)
      await loadCompanyDocs()
    } catch (e) {
      showToast(errorMessage(e, 'Save failed'), 'error')
    } finally {
      setBusy(false)
    }
  }

  function openCustomFieldCreate() {
    setEditingCustomField(null)
    setCustomFieldForm({
      object_type: 'account',
      label: '',
      field_type: 'text',
      optionsText: '',
      required: false,
      sort_order: customFields.length,
      active: true,
    })
    setCustomFieldOpen(true)
  }

  function openCustomFieldEdit(row: CustomFieldDefinition) {
    setEditingCustomField(row)
    setCustomFieldForm({
      object_type: row.object_type,
      label: row.label,
      field_type: row.field_type,
      optionsText: parseSelectOptions(row.options).join('\n'),
      required: row.required,
      sort_order: row.sort_order,
      active: row.active,
    })
    setCustomFieldOpen(true)
  }

  async function saveCustomField() {
    if (!customFieldForm.label.trim()) {
      showToast('Label is required', 'error')
      return
    }
    setBusy(true)
    try {
      await saveCustomFieldDefinition(
        {
          object_type: customFieldForm.object_type,
          field_key: editingCustomField?.field_key || slugifyFieldKey(customFieldForm.label),
          label: customFieldForm.label,
          field_type: customFieldForm.field_type,
          options: parseSelectOptions(customFieldForm.optionsText),
          required: customFieldForm.required,
          sort_order: customFieldForm.sort_order,
          active: customFieldForm.active,
        },
        editingCustomField?.id,
      )
      showToast(editingCustomField ? 'Field updated' : 'Field added', 'success')
      setCustomFieldOpen(false)
      await loadCustomFields()
    } catch (e) {
      showToast(errorMessage(e, 'Could not save custom field'), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function toggleCustomFieldActive(row: CustomFieldDefinition) {
    setBusy(true)
    try {
      await setCustomFieldDefinitionActive(row.id, !row.active)
      showToast(row.active ? 'Field deactivated' : 'Field activated', 'success')
      await loadCustomFields()
    } catch (e) {
      showToast(errorMessage(e, 'Could not update field'), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function confirmDeleteCompanyDoc() {
    if (!deleteCompanyDoc) return
    setBusy(true)
    try {
      await deleteCompanyDocument(deleteCompanyDoc.id)
      showToast('Document removed', 'success')
      setDeleteCompanyDoc(null)
      await loadCompanyDocs()
    } catch (e) {
      showToast(errorMessage(e, 'Delete failed'), 'error')
    } finally {
      setBusy(false)
    }
  }

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
      showToast(errorMessage(e, 'Import failed'), 'error')
    } finally {
      setImporting(false)
    }
  }

  async function handleBackupDownload() {
    setBackingUp(true)
    try {
      const result = await downloadCentralBackup()
      showToast(
        result.mode === 'supabase'
          ? `Cloud backup downloaded (${result.rows} rows)`
          : `Local backup downloaded (${result.rows} rows)`,
        'success',
      )
    } catch (e) {
      showToast(errorMessage(e, 'Backup failed'), 'error')
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
      showToast(errorMessage(e, 'Restore failed'), 'error')
    } finally {
      setImporting(false)
    }
  }

  async function handleCloudBackupUpload(file: File | null) {
    if (!file) return
    if (
      !window.confirm(
        'Upload this backup into Supabase? Existing matching rows are updated; new rows are inserted.',
      )
    ) {
      return
    }
    setImporting(true)
    try {
      const counts = await importCloudDumpFromFile(file)
      showToast(
        `Uploaded to cloud: ${counts.crm || 0} CRM, ${counts.quotations || 0} quotes, ${counts.invoices || 0} invoices`,
        'success',
      )
      window.setTimeout(() => window.location.reload(), 700)
    } catch (e) {
      showToast(errorMessage(e, 'Cloud upload failed'), 'error')
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
      showToast(errorMessage(e, 'Clear failed'), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function handleChangeMyPassword() {
    const parsed = parseChangePassword({ newPassword, confirmPassword })
    if (!parsed.ok) {
      showToast(parsed.error, 'error')
      return
    }
    setChangingPassword(true)
    try {
      await changePassword(parsed.data.newPassword)
      setNewPassword('')
      setConfirmPassword('')
      showToast('Password updated', 'success')
    } catch (e) {
      showToast(errorMessage(e, 'Could not change password'), 'error')
    } finally {
      setChangingPassword(false)
    }
  }

  if (!can(userRole, 'settings.manage')) {
    return (
      <div style={pageStyle} id="account">
        <h1 style={pageTitleStyle}>Account</h1>
        <p style={pageSubtitleStyle}>Change the password you use to sign in.</p>
        <TwoStepCard />
        <div style={cardStyle}>
          <h2 style={sectionTitleStyle}>My password</h2>
          <p style={{ color: colors.muted, fontSize: 13, marginTop: 0, lineHeight: 1.5 }}>
            Minimum {MIN_PASSWORD_LENGTH} characters.
          </p>
          <div style={{ display: 'grid', gap: 10, maxWidth: 360, marginBottom: 12 }}>
            <div>
              <label style={labelStyle}>New password</label>
              <input
                style={inputStyle}
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <div>
              <label style={labelStyle}>Confirm password</label>
              <input
                style={inputStyle}
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
          </div>
          <button
            type="button"
            style={buttonPrimaryStyle}
            disabled={changingPassword || isLocalMode}
            onClick={() => void handleChangeMyPassword()}
          >
            {changingPassword ? 'Updating…' : 'Update my password'}
          </button>
        </div>
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
      showToast(errorMessage(e, 'Save failed'), 'error')
    } finally {
      setSavingSection('')
    }
  }


  const sectionDomId: Record<string, string> = {
    Company: 'company',
    Bank: 'bank',
    'Quote settings': 'quote-settings',
    'Division formats': 'division-formats',
    Wanders: 'wanders',
    System: 'system',
  }

  function renderSection(
    title: string,
    sectionId: string,
    keys: readonly { key: string; label: string }[],
  ) {
    return (
      <div id={sectionDomId[sectionId]} style={{ ...cardStyle, marginBottom: 20, scrollMarginTop: 72 }}>
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
    setUserForm({ email: '', name: '', role: 'sales', active: true, password: '' })
    setUserOpen(true)
  }

  function openUserEdit(u: AppUser) {
    setEditingUser(u)
    setUserForm({
      email: u.email,
      name: u.name || '',
      role: u.role,
      active: u.active,
      password: '',
    })
    setUserOpen(true)
  }

  async function saveUser() {
    const parsed = parseAppUserForm({
      ...userForm,
      editing: Boolean(editingUser),
      localMode: isLocalMode,
    })
    if (!parsed.ok) {
      showToast(parsed.error, 'error')
      return
    }
    const { email, name, role, active, password } = parsed.data
    setBusy(true)
    try {
      const payload = { email, name, role, active }
      if (editingUser) {
        const { error } = await db.from('app_users').update(payload).eq('id', editingUser.id)
        if (error) throw error
      } else {
        const { error } = await db.from('app_users').insert(payload)
        if (error) throw error
      }
      if (password && authApi.adminSetPassword) {
        const { error: pwdError } = await authApi.adminSetPassword(email, password, name)
        if (pwdError) throw new Error(pwdError.message)
      }
      showToast(password ? 'User saved and password set' : 'User saved', 'success')
      setUserOpen(false)
      await loadUsers()
    } catch (e) {
      showToast(errorMessage(e, 'Save failed'), 'error')
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
      showToast(errorMessage(e, 'Delete failed'), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function handleTestZoho() {
    setTestingZoho(true)
    try {
      // Persist draft provider + Zoho keys first so test uses latest values
      for (const { key } of [...MAIL_CALENDAR_PROVIDER_KEYS, ...ZOHO_KEYS]) {
        const value = draft[key] ?? settings[key] ?? ''
        if ((settings[key] ?? '') !== value) {
          await updateSetting(key, value)
        }
      }
      const result = await testZohoConnection({ ...settings, ...draft })
      showToast(result, 'success')
    } catch (e) {
      showToast(errorMessage(e, 'Zoho test failed'), 'error')
    } finally {
      setTestingZoho(false)
    }
  }

  const tocItems = [
    { id: 'connect-supabase', label: 'Data & storage' },
    { id: 'company', label: 'Company' },
    { id: 'company-documents', label: 'Documents' },
    { id: 'bank', label: 'Bank' },
    { id: 'quote-settings', label: 'Quotes' },
    { id: 'numbering', label: 'Numbering' },
    { id: 'custom-fields', label: 'Custom fields' },
    { id: 'pipelines', label: 'Pipelines' },
    { id: 'workflows', label: 'Workflows' },
    { id: 'workflow-runs', label: 'Workflow runs' },
    { id: 'division-formats', label: 'Division formats' },
    { id: 'wanders', label: 'Wanders' },
    { id: 'system', label: 'System' },
    { id: 'ctrm-lists', label: 'CTRM lists' },
    { id: 'google-drive', label: 'Google Drive' },
    { id: 'hubspot', label: 'HubSpot' },
    { id: 'messages', label: 'Messages' },
    { id: 'zoho', label: 'Zoho' },
    ...(currentAuthMode() === 'local' ? [{ id: 'sheets-import', label: 'Sheets import' }] : []),
    { id: 'two-step', label: 'Two-step' },
    { id: 'account', label: 'Password' },
    { id: 'users', label: 'Users' },
  ]

  function jumpToSection(id: string) {
    const el = document.getElementById(id)
    if (!el) return
    window.history.replaceState(null, '', `#${id}`)
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div style={pageStyle}>
      <h1 style={pageTitleStyle}>Settings</h1>
      <p style={pageSubtitleStyle}>Company details, data storage, and user access</p>

      <nav
        aria-label="Settings sections"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 6,
          padding: '10px 0 16px',
          marginBottom: 8,
          position: 'sticky',
          top: 56,
          zIndex: 5,
          background: 'linear-gradient(180deg, #0f1216 70%, rgba(15,18,22,0))',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        {tocItems.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => jumpToSection(item.id)}
            style={{
              appearance: 'none',
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'rgba(255,255,255,0.04)',
              color: 'rgba(242,244,247,0.78)',
              fontSize: 12,
              fontWeight: 600,
              padding: '6px 10px',
              borderRadius: 999,
              cursor: 'pointer',
              fontFamily: 'inherit',
              whiteSpace: 'nowrap',
            }}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <div id="connect-supabase" style={{ ...cardStyle, marginBottom: 20, scrollMarginTop: 72 }}>
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

            <h3 style={{ margin: '8px 0 10px', fontSize: 14 }}>Connect Supabase (share with colleagues)</h3>
            <ol style={{ color: colors.muted2, fontSize: 12, margin: '0 0 12px', paddingLeft: 18, lineHeight: 1.55 }}>
              <li>
                In Supabase: open your project → <strong style={{ color: colors.text }}>SQL Editor</strong> → paste
                and apply the SQL files in <code>supabase/migrations/</code> (oldest first).
              </li>
              <li>
                In Supabase: <strong style={{ color: colors.text }}>Authentication → Providers → Email</strong> →
                enable Email (password sign-in). Add redirect URL{' '}
                <code>https://redreach-repo.github.io/RRCentral/login</code>.
              </li>
              <li>
                Deploy the <code>manage-auth-user</code> edge function so admins can set teammate passwords
                from User management (no magic-link email required).
              </li>
              <li>
                In Supabase: <strong style={{ color: colors.text }}>Project Settings → API</strong> → copy Project
                URL and anon public key into the fields below.
              </li>
              <li>
                Click <strong style={{ color: colors.text }}>Connect &amp; reload</strong>. The orange “local mode”
                banner should disappear. Colleagues use the same URL + key (or add them as GitHub Actions secrets
                <code> VITE_SUPABASE_URL</code> / <code>VITE_SUPABASE_ANON_KEY</code> so everyone gets cloud
                automatically).
              </li>
            </ol>
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
              Business data is stored in your Supabase Postgres project. Auth uses @redreach.ae
              email + password (admins set passwords in User management).
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
              <button
                type="button"
                style={buttonPrimaryStyle}
                disabled={backingUp}
                onClick={() => void handleBackupDownload()}
              >
                <Download size={14} />
                {backingUp ? 'Preparing…' : 'Download cloud backup JSON'}
              </button>
              <button
                type="button"
                style={buttonSecondaryStyle}
                disabled={importing}
                onClick={() => cloudBackupRef.current?.click()}
              >
                <Upload size={14} />
                {importing ? 'Uploading…' : 'Upload backup JSON to cloud'}
              </button>
              <input
                ref={cloudBackupRef}
                type="file"
                accept="application/json,.json"
                style={{ display: 'none' }}
                onChange={(e) => void handleCloudBackupUpload(e.target.files?.[0] || null)}
              />
            </div>
            <p style={{ color: colors.muted2, fontSize: 12, marginTop: 0, lineHeight: 1.5 }}>
              Download exports every table from Supabase (CRM, quotes, invoices, company documents, and
              more). Upload restores a previously downloaded backup into the cloud.
            </p>
            <p style={{ color: colors.muted2, fontSize: 12, marginTop: 8, lineHeight: 1.5 }}>
              To make cloud automatic on every phone, add GitHub Actions secrets{' '}
              <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>, then redeploy. After
              that, teammates can stop using local mode.
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

      <div id="company-documents" style={{ ...cardStyle, marginBottom: 20, scrollMarginTop: 72 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 12,
            flexWrap: 'wrap',
            marginBottom: 12,
          }}
        >
          <div>
            <h2 style={{ ...sectionTitleStyle, margin: 0 }}>Company documents</h2>
            <p style={{ color: colors.muted2, fontSize: 12, margin: '6px 0 0', maxWidth: 560, lineHeight: 1.5 }}>
              Trade license, VAT certificate, and other company papers. Upload files to Google Drive,
              then paste the share link here. Central stores links only — not the files.
            </p>
          </div>
          <button type="button" style={buttonPrimaryStyle} onClick={openCompanyDocCreate}>
            <Plus size={16} /> Add document
          </button>
        </div>
        {companyDocsMissing ? (
          <p style={{ color: colors.muted, fontSize: 13, lineHeight: 1.5 }}>
            Table not created yet. Run{' '}
            <code>supabase/migrations/20261006180000_company_documents.sql</code> in the Supabase SQL
            Editor, then refresh.
          </p>
        ) : companyDocs.length === 0 ? (
          <p style={{ color: colors.muted, fontSize: 13, lineHeight: 1.5 }}>
            No company documents yet. Add your trade license and VAT certificate to get started.
          </p>
        ) : (
          <div style={tableWrapStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Type</th>
                  <th style={thStyle}>Title</th>
                  <th style={thStyle}>Expires</th>
                  <th style={thStyle}>Link</th>
                  <th style={thStyle}></th>
                </tr>
              </thead>
              <tbody>
                {companyDocs.map((doc) => (
                  <tr key={doc.id}>
                    <td style={tdStyle}>{companyDocCategoryLabel(doc.category)}</td>
                    <td style={tdStyle}>{doc.title || '—'}</td>
                    <td style={tdStyle}>
                      {doc.expires_on ? String(doc.expires_on).slice(0, 10) : '—'}
                    </td>
                    <td style={tdStyle}>
                      {doc.drive_url ? (
                        <a
                          href={doc.drive_url}
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: colors.accent }}
                        >
                          Open
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td style={tdStyle}>
                      <SimpleRowActions
                        expanded={docActionsId === doc.id}
                        onToggle={() => setDocActionsId((id) => (id === doc.id ? null : doc.id))}
                        onEdit={() => openCompanyDocEdit(doc)}
                        onDelete={() => setDeleteCompanyDoc(doc)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {renderSection('Bank details', 'Bank', BANK_KEYS)}
      {renderSection('Quote / Invoice settings', 'Quote settings', QUOTE_KEYS)}

      <div id="numbering" style={{ ...cardStyle, marginBottom: 20, scrollMarginTop: 72 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <h2 style={{ ...sectionTitleStyle, margin: 0 }}>Document numbering</h2>
          <button
            type="button"
            style={buttonSecondaryStyle}
            disabled={numberingLoading}
            onClick={() => void loadNumbering()}
          >
            {numberingLoading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
        <p style={{ margin: '8px 0 14px', fontSize: 13, color: colors.muted, lineHeight: 1.45 }}>
          Counters live in the database (M2). Quotes and invoices share one RR sequence per division.
          Next finalize/save allocates atomically when cloud is connected.
        </p>
        {numberingRows.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: colors.muted }}>
            {numberingLoading
              ? 'Loading sequences…'
              : 'No sequences yet — apply the M2 migration, or finalize a document to create one.'}
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  {['Type', 'Division', 'Prefix', 'Year', 'Last', 'Next'].map((h) => (
                    <th
                      key={h}
                      style={{
                        textAlign: 'left',
                        padding: '8px 10px',
                        borderBottom: `1px solid ${colors.border}`,
                        color: colors.muted,
                        fontWeight: 600,
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {numberingRows.map((row) => (
                  <tr key={row.id}>
                    <td style={{ padding: '8px 10px', borderBottom: `1px solid ${colors.border}` }}>
                      {row.doc_type}
                    </td>
                    <td style={{ padding: '8px 10px', borderBottom: `1px solid ${colors.border}` }}>
                      {row.division_code}
                    </td>
                    <td style={{ padding: '8px 10px', borderBottom: `1px solid ${colors.border}` }}>
                      {row.prefix}
                    </td>
                    <td style={{ padding: '8px 10px', borderBottom: `1px solid ${colors.border}` }}>
                      {row.year_yy}
                    </td>
                    <td style={{ padding: '8px 10px', borderBottom: `1px solid ${colors.border}` }}>
                      {row.last_seq}
                    </td>
                    <td
                      style={{
                        padding: '8px 10px',
                        borderBottom: `1px solid ${colors.border}`,
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                      }}
                    >
                      {previewNextReference(row)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div id="custom-fields" style={{ ...cardStyle, marginBottom: 20, scrollMarginTop: 72 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <h2 style={{ ...sectionTitleStyle, margin: 0 }}>Custom fields</h2>
          {can(userRole, 'settings.manage') ? (
            <button type="button" style={buttonPrimaryStyle} onClick={openCustomFieldCreate}>
              <Plus size={16} style={{ marginRight: 6 }} />
              Add field
            </button>
          ) : null}
        </div>
        <p style={{ margin: '8px 0 14px', fontSize: 13, color: colors.muted, lineHeight: 1.45 }}>
          Tenant-defined fields on accounts, CRM leads, and quotations. Values are stored separately
          from core columns.
        </p>
        {customFieldsLoading ? (
          <p style={{ margin: 0, fontSize: 13, color: colors.muted }}>Loading…</p>
        ) : customFields.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: colors.muted }}>
            No custom fields yet. Add one for Accounts to see it on account pages.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={thStyle}>Object</th>
                  <th style={thStyle}>Label</th>
                  <th style={thStyle}>Key</th>
                  <th style={thStyle}>Type</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}></th>
                </tr>
              </thead>
              <tbody>
                {customFields.map((row) => (
                  <tr key={row.id}>
                    <td style={tdStyle}>
                      {CUSTOM_FIELD_OBJECTS.find((o) => o.value === row.object_type)?.label ||
                        row.object_type}
                    </td>
                    <td style={tdStyle}>
                      {row.label}
                      {row.required ? ' *' : ''}
                    </td>
                    <td style={{ ...tdStyle, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                      {row.field_key}
                    </td>
                    <td style={tdStyle}>{row.field_type}</td>
                    <td style={tdStyle}>{row.active ? 'Active' : 'Off'}</td>
                    <td style={tdStyle}>
                      {can(userRole, 'settings.manage') ? (
                        <SimpleRowActions
                          expanded={customFieldActionsId === row.id}
                          onToggle={() =>
                            setCustomFieldActionsId((id) => (id === row.id ? null : row.id))
                          }
                          onEdit={() => openCustomFieldEdit(row)}
                          onDelete={() => void toggleCustomFieldActive(row)}
                          deleteLabel={row.active ? 'Deactivate' : 'Activate'}
                        />
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <PipelinesSettingsCard />
      <WorkflowsSettingsCard />
      <WorkflowRunsCard />

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
      <div id="ctrm-lists" style={{ scrollMarginTop: 72 }}>
        <CtrmListsCard />
      </div>
      <div id="google-drive" style={{ scrollMarginTop: 72 }}>
        <GoogleDriveCard />
      </div>
      <div id="hubspot" style={{ scrollMarginTop: 72 }}>
        <HubSpotCard />
      </div>

      <div id="messages" style={{ ...cardStyle, marginBottom: 20, scrollMarginTop: 72 }}>
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

      <div id="zoho" style={{ ...cardStyle, marginBottom: 20, scrollMarginTop: 72 }}>
        <h2 style={{ ...sectionTitleStyle, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Plug size={18} /> Mail &amp; calendar
        </h2>
        <div style={{ ...fieldStyle, maxWidth: 360, marginBottom: 14 }}>
          <label style={labelStyle} htmlFor="mailCalendarProvider">
            Provider
          </label>
          <select
            id="mailCalendarProvider"
            style={inputStyle}
            value={resolveMailCalendarProviderId({
              ...settings,
              ...draft,
              [MAIL_CALENDAR_PROVIDER_SETTING_KEY]:
                draft[MAIL_CALENDAR_PROVIDER_SETTING_KEY] ??
                settings[MAIL_CALENDAR_PROVIDER_SETTING_KEY] ??
                DEFAULT_MAIL_CALENDAR_PROVIDER,
            })}
            onChange={(e) =>
              setDraft((d) => ({ ...d, [MAIL_CALENDAR_PROVIDER_SETTING_KEY]: e.target.value }))
            }
          >
            {listMailCalendarProviderOptions().map((opt) => (
              <option key={opt.id} value={opt.id} disabled={!opt.available}>
                {opt.available
                  ? opt.label
                  : `${opt.label} — ${opt.unavailableReason || 'Coming later'}`}
              </option>
            ))}
          </select>
          <p style={{ margin: '6px 0 0', fontSize: 12, color: colors.muted2, lineHeight: 1.45 }}>
            Zoho, Gmail, or Microsoft 365 (Phase A: send + calendar). Connect the provider below
            before selecting it. Inbox on Gmail/M365 is Phase B. IMAP later.
          </p>
        </div>
        {can(userRole, 'settings.manage') &&
        (draft.zohoPostHardeningRotationAck ?? settings.zohoPostHardeningRotationAck ?? 'no') !==
          'yes' &&
        ((draft.zohoClientSecret ?? settings.zohoClientSecret)?.trim() ||
          (draft.zohoRefreshToken ?? settings.zohoRefreshToken)?.trim()) ? (
          <div
            style={{
              marginBottom: 14,
              padding: 12,
              borderRadius: 8,
              border: '1px solid rgba(245, 158, 11, 0.45)',
              background: 'rgba(245, 158, 11, 0.08)',
              fontSize: 13,
              lineHeight: 1.5,
              color: colors.muted,
            }}
          >
            <strong style={{ color: colors.warn }}>Rotate Zoho credentials</strong> — before RLS
            hardening, any signed-in user could read client secret and refresh token. Regenerate them
            in the Zoho API Console, paste the new values below, save, then confirm here.
            <div style={{ marginTop: 10 }}>
              <button
                type="button"
                style={buttonSecondaryStyle}
                onClick={() =>
                  void (async () => {
                    try {
                      await updateSetting('zohoPostHardeningRotationAck', 'yes')
                      setDraft((d) => ({ ...d, zohoPostHardeningRotationAck: 'yes' }))
                      showToast('Marked Zoho credentials as rotated', 'success')
                    } catch (e) {
                      showToast(errorMessage(e, 'Could not save'), 'error')
                    }
                  })()
                }
              >
                Mark Zoho credentials rotated
              </button>
            </div>
          </div>
        ) : null}
        <h3 style={{ ...sectionTitleStyle, fontSize: 15, margin: '4px 0 8px' }}>Zoho credentials</h3>
        <p style={{ color: colors.muted, fontSize: 13, marginTop: 0, lineHeight: 1.55 }}>
          Connect Zoho so CRM follow-ups sync to Calendar, you can send mail from CRM, and your{' '}
          <strong>Zoho mail</strong> (Inbox + Sent) appears on the Dashboard matched to CRM companies.
          Create a
          Self Client in the{' '}
          <a
            href="https://api-console.zoho.com/"
            target="_blank"
            rel="noreferrer"
            style={{ color: colors.accent }}
          >
            Zoho API Console
          </a>
          , generate a refresh token with scopes{' '}
          <code style={{ color: '#ff9f4a' }}>ZohoCalendar.calendar.ALL</code>,{' '}
          <code style={{ color: '#ff9f4a' }}>ZohoCalendar.event.ALL</code>,{' '}
          <code style={{ color: '#ff9f4a' }}>ZohoMail.messages.READ</code>,{' '}
          <code style={{ color: '#ff9f4a' }}>ZohoMail.messages.CREATE</code>,{' '}
          <code style={{ color: '#ff9f4a' }}>ZohoMail.folders.READ</code>, and{' '}
          <code style={{ color: '#ff9f4a' }}>ZohoMail.accounts.READ</code>, then paste credentials
          below. Set Calendar sync / Mail to <strong>yes</strong> to enable. Use regional domains if
          your org is on .eu / .in (e.g. <code>https://accounts.zoho.eu</code>). Calendar needs both
          calendar + event scopes — event alone returns 401 when listing calendars.
        </p>
        <p style={{ color: colors.muted, fontSize: 13, marginTop: 0, lineHeight: 1.55 }}>
          <strong style={{ color: colors.text }}>Safari tip:</strong> Zoho blocks direct browser
          calls (error 405). Keep Supabase connected, then deploy the repo edge function once:
          <br />
          <code style={{ color: '#ff9f4a' }}>
            npx supabase functions deploy zoho-proxy --project-ref YOUR_PROJECT_REF
          </code>
          <br />
          Or in Supabase Dashboard → Edge Functions → Create: function name{' '}
          <code>zoho-proxy</code>, file name <code>index.ts</code> (required — not the
          function name), paste the full repo file{' '}
          <code>supabase/functions/zoho-proxy/index.ts</code>. If you already deployed as{' '}
          <code>bright-function</code>, that also works. Also confirm{' '}
          <strong>Client ID</strong> is the full value (not truncated in the field).
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
            disabled={savingSection === 'Mail & calendar' || settingsLoading}
            onClick={() =>
              void saveSection([...MAIL_CALENDAR_PROVIDER_KEYS, ...ZOHO_KEYS], 'Mail & calendar')
            }
          >
            {savingSection === 'Mail & calendar' ? 'Saving…' : 'Save mail & calendar'}
          </button>
          <button
            type="button"
            style={buttonSecondaryStyle}
            disabled={testingZoho}
            onClick={() => void handleTestZoho()}
          >
            <Plug size={14} />
            {testingZoho ? 'Testing…' : 'Test Zoho connection'}
          </button>
        </div>
      </div>

      <GmailCalendarCard />
      <M365MailCalendarCard />

      {currentAuthMode() === 'local' && (
        <div id="sheets-import" style={{ ...cardStyle, marginBottom: 20, scrollMarginTop: 72 }}>
          <h2 style={sectionTitleStyle}>Import Google Sheets data</h2>
          <p style={{ color: colors.muted, fontSize: 13, marginTop: 0, lineHeight: 1.5 }}>
            Pull your existing CRM, quotes, invoices, and catalog from an Apps Script migration
            export into this browser. This replaces local data — download a backup first. Never
            put export files in <code>app/public</code>: everything there is published online.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button
              type="button"
              style={buttonPrimaryStyle}
              disabled={importing}
              onClick={() => fileRef.current?.click()}
            >
              <Upload size={14} style={{ marginRight: 6 }} />
              {importing ? 'Importing…' : 'Upload migration JSON…'}
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

      <div id="two-step" style={{ scrollMarginTop: 72 }}>
        <TwoStepCard />
      </div>

      <div style={{ ...cardStyle, marginBottom: 20, scrollMarginTop: 72 }} id="account">
        <h2 style={sectionTitleStyle}>My password</h2>
        <p style={{ color: colors.muted, fontSize: 13, marginTop: 0, lineHeight: 1.5 }}>
          Change the password you use to sign in to Central. Minimum {MIN_PASSWORD_LENGTH} characters.
          {isLocalMode
            ? ' Local mode does not store passwords — this only applies after you connect Supabase.'
            : ''}
        </p>
        <div style={{ display: 'grid', gap: 10, maxWidth: 360, marginBottom: 12 }}>
          <div>
            <label style={labelStyle}>New password</label>
            <input
              style={inputStyle}
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
          <div>
            <label style={labelStyle}>Confirm password</label>
            <input
              style={inputStyle}
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>
        </div>
        <button
          type="button"
          style={buttonPrimaryStyle}
          disabled={changingPassword || isLocalMode}
          onClick={() => void handleChangeMyPassword()}
        >
          {changingPassword ? 'Updating…' : 'Update my password'}
        </button>
      </div>

      <div id="users" style={{ ...cardStyle, scrollMarginTop: 72 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h2 style={{ ...sectionTitleStyle, margin: 0 }}>User management</h2>
            <p style={{ color: colors.muted2, fontSize: 12, margin: '6px 0 0', maxWidth: 560, lineHeight: 1.5 }}>
              Add teammates with an <strong style={{ color: colors.text }}>@redreach.ae</strong> email,
              role, and an initial password. They sign in with email + password, then can change their
              password under <strong style={{ color: colors.text }}>My password</strong>.
            </p>
          </div>
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
                    <SimpleRowActions
                      expanded={userActionsId === u.id}
                      onToggle={() => setUserActionsId((id) => (id === u.id ? null : u.id))}
                      onEdit={() => openUserEdit(u)}
                      onDelete={() => setDeleteUser(u)}
                    />
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
            {USER_ROLES.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]} — {ROLE_DESCRIPTIONS[role]}
              </option>
            ))}
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
        <div style={fieldStyle}>
          <label style={labelStyle}>
            {editingUser ? 'New password (optional)' : 'Initial password *'}
          </label>
          <input
            style={inputStyle}
            type="password"
            autoComplete="new-password"
            value={userForm.password}
            placeholder={`Min ${MIN_PASSWORD_LENGTH} characters`}
            onChange={(e) => setUserForm((f) => ({ ...f, password: e.target.value }))}
          />
          <p style={{ color: colors.muted2, fontSize: 11, margin: '6px 0 0', lineHeight: 1.4 }}>
            {editingUser
              ? 'Leave blank to keep the current password. Fill in to reset it.'
              : 'Share this once with the teammate; they can change it after login.'}
          </p>
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

      <Modal
        open={companyDocOpen}
        title={editingCompanyDoc ? 'Edit company document' : 'Add company document'}
        onClose={() => setCompanyDocOpen(false)}
        width={480}
      >
        <div style={fieldStyle}>
          <label style={labelStyle}>Type *</label>
          <select
            style={selectStyle}
            value={companyDocForm.category}
            onChange={(e) =>
              setCompanyDocForm((f) => ({
                ...f,
                category: e.target.value as CompanyDocumentCategory,
              }))
            }
          >
            {COMPANY_DOC_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>Title</label>
          <input
            style={inputStyle}
            value={companyDocForm.title}
            placeholder="e.g. Trade license 2026"
            onChange={(e) => setCompanyDocForm((f) => ({ ...f, title: e.target.value }))}
          />
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>Google Drive share link *</label>
          <input
            style={inputStyle}
            value={companyDocForm.drive_url}
            placeholder="https://drive.google.com/…"
            onChange={(e) => setCompanyDocForm((f) => ({ ...f, drive_url: e.target.value }))}
          />
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>File name (optional)</label>
          <input
            style={inputStyle}
            value={companyDocForm.file_name}
            onChange={(e) => setCompanyDocForm((f) => ({ ...f, file_name: e.target.value }))}
          />
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>Expires on (optional)</label>
          <input
            style={inputStyle}
            type="date"
            value={companyDocForm.expires_on}
            onChange={(e) => setCompanyDocForm((f) => ({ ...f, expires_on: e.target.value }))}
          />
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>Notes</label>
          <textarea
            style={{ ...inputStyle, minHeight: 70, resize: 'vertical' }}
            value={companyDocForm.notes}
            onChange={(e) => setCompanyDocForm((f) => ({ ...f, notes: e.target.value }))}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" style={buttonSecondaryStyle} onClick={() => setCompanyDocOpen(false)}>
            Cancel
          </button>
          <button
            type="button"
            style={buttonPrimaryStyle}
            disabled={busy}
            onClick={() => void saveCompanyDoc()}
          >
            Save
          </button>
        </div>
      </Modal>

      <Modal
        open={!!deleteCompanyDoc}
        title="Remove document?"
        onClose={() => setDeleteCompanyDoc(null)}
        width={400}
      >
        <p style={{ color: colors.muted, fontSize: 14 }}>
          Remove <strong style={{ color: colors.text }}>{deleteCompanyDoc?.title || 'this document'}</strong>{' '}
          from Central? The file on Google Drive is not deleted.
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button type="button" style={buttonSecondaryStyle} onClick={() => setDeleteCompanyDoc(null)}>
            Cancel
          </button>
          <button
            type="button"
            style={buttonDangerStyle}
            disabled={busy}
            onClick={() => void confirmDeleteCompanyDoc()}
          >
            Remove
          </button>
        </div>
      </Modal>

      <Modal
        open={customFieldOpen}
        title={editingCustomField ? 'Edit custom field' : 'Add custom field'}
        onClose={() => setCustomFieldOpen(false)}
        width={480}
      >
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={fieldStyle}>
            <label style={labelStyle}>Object</label>
            <select
              style={selectStyle}
              value={customFieldForm.object_type}
              disabled={Boolean(editingCustomField)}
              onChange={(e) =>
                setCustomFieldForm((f) => ({ ...f, object_type: e.target.value }))
              }
            >
              {CUSTOM_FIELD_OBJECTS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Label</label>
            <input
              style={inputStyle}
              value={customFieldForm.label}
              onChange={(e) => setCustomFieldForm((f) => ({ ...f, label: e.target.value }))}
              placeholder="Preferred carrier"
            />
            {!editingCustomField ? (
              <p style={{ margin: '6px 0 0', fontSize: 12, color: colors.muted }}>
                Key will be <code>{slugifyFieldKey(customFieldForm.label) || 'field'}</code>
              </p>
            ) : (
              <p style={{ margin: '6px 0 0', fontSize: 12, color: colors.muted }}>
                Key <code>{editingCustomField.field_key}</code> stays fixed
              </p>
            )}
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Type</label>
            <select
              style={selectStyle}
              value={customFieldForm.field_type}
              onChange={(e) =>
                setCustomFieldForm((f) => ({
                  ...f,
                  field_type: e.target.value as CustomFieldType,
                }))
              }
            >
              {CUSTOM_FIELD_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          {customFieldForm.field_type === 'select' ||
          customFieldForm.field_type === 'multiselect' ? (
            <div style={fieldStyle}>
              <label style={labelStyle}>Options (one per line)</label>
              <textarea
                style={{ ...inputStyle, minHeight: 96, resize: 'vertical' }}
                value={customFieldForm.optionsText}
                onChange={(e) =>
                  setCustomFieldForm((f) => ({ ...f, optionsText: e.target.value }))
                }
              />
            </div>
          ) : null}
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <input
              type="checkbox"
              checked={customFieldForm.required}
              onChange={(e) =>
                setCustomFieldForm((f) => ({ ...f, required: e.target.checked }))
              }
            />
            Required
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <input
              type="checkbox"
              checked={customFieldForm.active}
              onChange={(e) =>
                setCustomFieldForm((f) => ({ ...f, active: e.target.checked }))
              }
            />
            Active
          </label>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button type="button" style={buttonSecondaryStyle} onClick={() => setCustomFieldOpen(false)}>
            Cancel
          </button>
          <button
            type="button"
            style={buttonPrimaryStyle}
            disabled={busy}
            onClick={() => void saveCustomField()}
          >
            {busy ? 'Saving…' : 'Save field'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
