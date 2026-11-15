import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import {
  ExternalLink,
  FileText,
  FolderOpen,
  Link2,
  MessageCircle,
  Package,
  Plus,
  Receipt,
  Trash2,
  Truck,
} from 'lucide-react'
import { db } from '../lib/db'
import type { CrmEntry } from '../lib/types'
import { useAuth } from '../contexts/AuthContext'
import { useI18n } from '../contexts/I18nContext'
import { useToast } from '../contexts/ToastContext'
import EmptyState from '../components/EmptyState'
import SavedViewsBar from '../components/SavedViewsBar'
import StatusPill from '../components/StatusPill'
import { csvRowsToObjects, exportListCsv, parseCsv } from '../lib/listIo'
import LinkDriveFileModal, { type LinkDriveFileMode } from '../components/LinkDriveFileModal'
import { logActivity } from '../lib/activity'
import { errorMessage, isMissingRelationError } from '../lib/errors'
import { PRODUCT } from '../lib/product'
import {
  buildFolderChecklist,
  CUSTOMER_FOLDER_SECTIONS,
  deleteCustomerDocument,
  filterFolderItems,
  loadCustomerFolder,
  restoreCustomerDocument,
  relatedRefOptionsForSection,
  suggestedDriveFolderName,
  updateCrmDriveFolderUrl,
  type CustomerFolder,
  type CustomerFolderItem,
  type FolderSectionId,
} from '../lib/customerFiles'
import { useCompactCrm } from '../hooks/useMediaQuery'
import { useDriveStatus } from '../hooks/useDriveStatus'
import { driveFolderId, ensureClientDriveFolder } from '../lib/googleDrive'
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
} from '../lib/uiStyles'
import docsStyles from '../styles/docsList.module.css'

const COMPANY_CSV_COLUMNS = ['company_name', 'primary_contact', 'owner', 'drive_folder_url'] as const

function companyKey(name: string): string {
  return name.trim().toLowerCase()
}

function formatWhen(value?: string | null): string {
  if (!value) return ''
  try {
    const raw = value.length > 10 ? value : `${value}T00:00:00`
    return format(parseISO(raw), 'dd MMM yyyy')
  } catch {
    return value.slice(0, 10)
  }
}

function sectionIcon(sectionId: FolderSectionId) {
  switch (sectionId) {
    case 'quotation':
      return <FileText size={16} />
    case 'invoice':
      return <Receipt size={16} />
    case 'delivery_note':
      return <Truck size={16} />
    case 'communication':
      return <MessageCircle size={16} />
    case 'purchasing':
      return <Package size={16} />
  }
}

type FolderSection = (typeof CUSTOMER_FOLDER_SECTIONS)[number]

function itemKindLabel(item: CustomerFolderItem): string {
  if (item.kind === 'crm') return 'In CRM'
  if (item.section === 'communication') return 'Google Drive'
  if (item.section === 'purchasing') return 'Purchasing · Google Drive'
  return 'Signed · Google Drive'
}

function sectionToMode(section: FolderSection): LinkDriveFileMode {
  if (section.mode === 'communication') return 'communication'
  if (section.mode === 'purchasing') return 'purchasing'
  return 'signed'
}

export default function CustomerFilesPage() {
  const { t } = useI18n()
  const { user, isLocalMode, appUserId } = useAuth()
  const { showToast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const compact = useCompactCrm()
  const who = user?.email || ''

  const [companies, setCompanies] = useState<CrmEntry[]>([])
  const [search, setSearch] = useState('')
  const [fileQuery, setFileQuery] = useState('')
  const [selected, setSelected] = useState('')
  const [folder, setFolder] = useState<CustomerFolder | null>(null)
  const [loadingList, setLoadingList] = useState(true)
  const [loadingFolder, setLoadingFolder] = useState(false)
  const [missingTable, setMissingTable] = useState(false)
  const [driveFolderUrl, setDriveFolderUrl] = useState('')
  const [savingFolder, setSavingFolder] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [addSection, setAddSection] = useState<FolderSection>(CUSTOMER_FOLDER_SECTIONS[0])
  const [showArchivedDocs, setShowArchivedDocs] = useState(false)
  const [importing, setImporting] = useState(false)
  const [csvFiltered, setCsvFiltered] = useState(false)
  const [csvCompanyKeys, setCsvCompanyKeys] = useState<Set<string> | null>(null)
  const importInputRef = useRef<HTMLInputElement>(null)
  const filesViewFilters = useMemo(
    () => ({ q: search, archived: showArchivedDocs ? '1' : '0' }),
    [search, showArchivedDocs],
  )

  function openUpload(section: FolderSection) {
    setAddSection(section)
    setAddOpen(true)
  }

  const { status: drive } = useDriveStatus()
  const rootDrive = drive.customers_url
  const [makingFolder, setMakingFolder] = useState(false)

  async function createDriveFolder() {
    if (!folder?.crm?.id) {
      showToast('Save this company in CRM first, then make its Google Drive folder', 'error')
      return
    }
    setMakingFolder(true)
    try {
      const made = await ensureClientDriveFolder(folder.crm.id)
      setDriveFolderUrl(made.url)
      await logActivity('set_customer_drive_folder', 'crm', folder.company, made.url, who, folder.crm.id)
      showToast('Google Drive folder ready', 'success')
      await openCompany(folder.company)
    } catch (e) {
      showToast(errorMessage(e, 'Could not make the Google Drive folder'), 'error')
    } finally {
      setMakingFolder(false)
    }
  }

  const checklist = useMemo(
    () => (folder ? buildFolderChecklist({ ...folder, crm: folder.crm ? { ...folder.crm, drive_folder_url: driveFolderUrl } : null }) : []),
    [folder, driveFolderUrl],
  )

  const loadCompanies = useCallback(async () => {
    setLoadingList(true)
    try {
      const { data, error } = await db
        .from('crm')
        .select('*')
        .order('company_name', { ascending: true })
      if (error) throw error
      setCompanies((data || []) as CrmEntry[])
    } catch (e) {
      showToast(errorMessage(e, 'Failed to load companies'), 'error')
    } finally {
      setLoadingList(false)
    }
  }, [showToast])

  const openCompany = useCallback(
    async (company: string) => {
      const name = company.trim()
      setSelected(name)
      const current = (searchParams.get('company') || '').trim()
      if (name !== current) {
        setSearchParams(name ? { company: name } : {}, { replace: true })
      }
      if (!name) {
        setFolder(null)
        setDriveFolderUrl('')
        return
      }
      setLoadingFolder(true)
      try {
        const next = await loadCustomerFolder(name, { includeDeletedDocs: showArchivedDocs })
        setFolder(next)
        setDriveFolderUrl(next.crm?.drive_folder_url || '')
        setMissingTable(Boolean(next.missingDocumentsTable))
        setFileQuery('')
      } catch (e) {
        if (isMissingRelationError(e)) {
          setMissingTable(true)
          setFolder(null)
        } else {
          showToast(errorMessage(e, 'Failed to open customer folder'), 'error')
        }
      } finally {
        setLoadingFolder(false)
      }
    },
    [searchParams, setSearchParams, showToast, showArchivedDocs],
  )

  useEffect(() => {
    void loadCompanies()
  }, [loadCompanies])

  useEffect(() => {
    const fromUrl = (searchParams.get('company') || '').trim()
    if (!fromUrl) return
    if (fromUrl === selected) return
    void openCompany(fromUrl)
  }, [searchParams, selected, openCompany])

  useEffect(() => {
    if (!selected) return
    void openCompany(selected)
  }, [showArchivedDocs]) // eslint-disable-line react-hooks/exhaustive-deps -- reload folder when archive filter flips

  const filteredCompanies = useMemo(() => {
    let list = companies
    if (csvFiltered && csvCompanyKeys) {
      list = list.filter((c) => csvCompanyKeys.has(companyKey(c.company_name)))
    }
    const q = search.trim().toLowerCase()
    if (!q) return list
    return list.filter((c) =>
      `${c.company_name} ${c.primary_contact} ${c.owner}`.toLowerCase().includes(q),
    )
  }, [companies, search, csvFiltered, csvCompanyKeys])

  async function importCompaniesCsv(file: File) {
    setImporting(true)
    try {
      const text = await file.text()
      const { headers, rows: csvRows } = parseCsv(text)
      if (!headers.length) {
        showToast('CSV has no header row', 'error')
        return
      }
      const objects = csvRowsToObjects(headers, csvRows)
      const byName = new Map(companies.map((c) => [companyKey(c.company_name), c] as const))
      const matchedKeys = new Set<string>()
      let updated = 0
      let matched = 0
      let skipped = 0

      for (const row of objects) {
        const name = String(row.company_name || row.company || row.name || '').trim()
        if (!name) {
          skipped += 1
          continue
        }
        const key = companyKey(name)
        const existing = byName.get(key)
        if (!existing) {
          skipped += 1
          continue
        }
        matchedKeys.add(key)
        matched += 1
        const nextUrl = String(row.drive_folder_url || row.drive_url || '').trim()
        if (nextUrl && nextUrl !== (existing.drive_folder_url || '').trim()) {
          await updateCrmDriveFolderUrl(existing.id, nextUrl)
          await logActivity(
            'set_customer_drive_folder',
            'crm',
            existing.company_name,
            nextUrl,
            who,
            existing.id,
          )
          updated += 1
        }
      }

      if (!matched) {
        showToast('No matching customer companies in CSV', 'error')
        return
      }

      setCsvCompanyKeys(matchedKeys)
      setCsvFiltered(true)
      if (updated) await loadCompanies()
      const updateNote = updated ? ` · ${updated} Drive folder link(s) updated` : ''
      const skipNote = skipped ? ` · ${skipped} row(s) skipped` : ''
      showToast(`Matched ${matched} compan${matched === 1 ? 'y' : 'ies'}${updateNote}${skipNote}`, 'success')
    } catch (e) {
      showToast(errorMessage(e, 'Customer companies CSV import failed'), 'error')
    } finally {
      setImporting(false)
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

  function clearCsvFilter() {
    setCsvFiltered(false)
    setCsvCompanyKeys(null)
  }

  async function saveDriveFolder() {
    if (!folder?.crm?.id) {
      showToast('Save this company in CRM first, then link its Google Drive folder', 'error')
      return
    }
    setSavingFolder(true)
    try {
      await updateCrmDriveFolderUrl(folder.crm.id, driveFolderUrl)
      await logActivity(
        'set_customer_drive_folder',
        'crm',
        folder.company,
        driveFolderUrl || '(cleared)',
        who,
        folder.crm.id,
      )
      showToast('Google Drive folder linked', 'success')
      await openCompany(folder.company)
    } catch (e) {
      showToast(errorMessage(e, 'Could not save Google Drive folder link'), 'error')
    } finally {
      setSavingFolder(false)
    }
  }

  async function removeDriveFile(item: CustomerFolderItem) {
    if (!item.documentId) return
    try {
      if (item.archived) {
        await restoreCustomerDocument(item.documentId)
        showToast('Link restored', 'success')
      } else {
        await deleteCustomerDocument(item.documentId)
        showToast('Link archived (file stays on Google Drive). Use Show archived to restore.', 'success')
      }
      if (selected) await openCompany(selected)
    } catch (e) {
      showToast(errorMessage(e, item.archived ? 'Could not restore link' : 'Could not remove link'), 'error')
    }
  }

  return (
    <div className={docsStyles.page}>
      <header className={docsStyles.hero}>
        <div>
          <p className={docsStyles.kicker}>{t('page.docs.kicker')}</p>
          <h1 className={docsStyles.title}>{t('page.customerFiles.title')}</h1>
          <p className={docsStyles.subtitle}>{t('page.customerFiles.subtitle')}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            ref={importInputRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void importCompaniesCsv(file)
            }}
          />
          <button
            type="button"
            className={docsStyles.newBtn}
            style={{ background: 'transparent', color: 'inherit', border: '1px solid var(--border)' }}
            disabled={importing || !companies.length}
            onClick={() => importInputRef.current?.click()}
          >
            {importing ? 'Importing…' : 'Import CSV'}
          </button>
          {csvFiltered ? (
            <button
              type="button"
              className={docsStyles.newBtn}
              style={{ background: 'transparent', color: 'inherit', border: '1px solid var(--border)' }}
              onClick={clearCsvFilter}
            >
              Clear CSV filter
            </button>
          ) : null}
          <button
            type="button"
            className={docsStyles.newBtn}
            style={{ background: 'transparent', color: 'inherit', border: '1px solid var(--border)' }}
            disabled={!companies.length}
            onClick={() => {
              exportListCsv(
                'customer-files-companies.csv',
                [...COMPANY_CSV_COLUMNS],
                companies.map((c) => ({
                  company_name: c.company_name,
                  primary_contact: c.primary_contact || '',
                  owner: c.owner || '',
                  drive_folder_url: c.drive_folder_url || '',
                })),
              )
              showToast('Customer companies CSV downloaded', 'success')
            }}
          >
            Export CSV
          </button>
          {drive.connected && drive.customers_url ? (
            <a
              href={drive.customers_url}
              target="_blank"
              rel="noreferrer"
              className={docsStyles.newBtn}
              style={{ textDecoration: 'none', background: 'rgba(255,255,255,0.08)' }}
            >
              <ExternalLink size={16} /> {t('page.customerFiles.openDrive')}
            </a>
          ) : null}
        </div>
      </header>

      <SavedViewsBar
        moduleId="customer_files"
        filters={filesViewFilters}
        ownerUserId={appUserId}
        canWrite
        applyDefaultOnLoad={false}
        onApply={(f) => {
          setSearch(String(f.q || ''))
          setShowArchivedDocs(String(f.archived || '0') === '1')
        }}
        onToast={showToast}
        filtersEqual={(a, b) =>
          String(a.q || '') === String(b.q || '') && String(a.archived || '0') === String(b.archived || '0')
        }
      />

      {isLocalMode ? (
        <div style={{ ...cardStyle, marginBottom: 16, borderColor: colors.warn }}>
          <strong style={{ color: colors.warn }}>Connect Supabase first</strong>
          <p style={{ margin: '8px 0 0', color: colors.muted, fontSize: 14, lineHeight: 1.5 }}>
            Google Drive needs cloud mode.{' '}
            <Link to="/settings#connect-supabase" style={{ color: colors.accent }}>
              Settings → Connect Supabase
            </Link>
            , then connect Google Drive.
          </p>
        </div>
      ) : !drive.connected ? (
        <div style={{ ...cardStyle, marginBottom: 16, borderColor: colors.warn }}>
          <strong style={{ color: colors.warn }}>Connect Google Drive</strong>
          <p style={{ margin: '8px 0 0', color: colors.muted, fontSize: 14, lineHeight: 1.5 }}>
            An admin connects Google Drive once in{' '}
            <Link to="/settings#google-drive" style={{ color: colors.accent }}>
              Settings → Google Drive
            </Link>
            . Then {PRODUCT.name} makes a folder per client under <strong>RR Central / Customers</strong>, and Save to
            Drive on quotes and invoices files the PDF there.
          </p>
        </div>
      ) : null}

      {missingTable ? (
        <div style={{ ...cardStyle, marginBottom: 16, borderColor: colors.warn }}>
          <strong style={{ color: colors.warn }}>SQL needed</strong>
          <p style={{ margin: '8px 0 0', color: colors.muted, fontSize: 14, lineHeight: 1.5 }}>
            Run <code style={{ color: colors.accent }}>supabase/migrations/20260924224316_customer_files.sql</code> in
            the Supabase SQL editor so customer folders and Google Drive links can be saved.
          </p>
        </div>
      ) : null}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: compact ? '1fr' : 'minmax(240px, 300px) 1fr',
          gap: 16,
          alignItems: 'start',
        }}
      >
        <aside style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '12px 14px', borderBottom: `1px solid ${colors.border}` }}>
            <input
              style={inputStyle}
              placeholder="Find customer…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div style={{ maxHeight: compact ? 220 : 'calc(100vh - 220px)', overflow: 'auto' }}>
            {loadingList ? (
              <p style={{ padding: 16, color: colors.muted, fontSize: 13 }}>Loading…</p>
            ) : filteredCompanies.length === 0 ? (
              <p style={{ padding: 16, color: colors.muted, fontSize: 13 }}>No companies in CRM.</p>
            ) : (
              filteredCompanies.map((c) => {
                const active = c.company_name === selected
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => void openCompany(c.company_name)}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      appearance: 'none',
                      border: 0,
                      borderBottom: `1px solid ${colors.border}`,
                      background: active ? 'color-mix(in srgb, var(--primary) 12%, transparent)' : 'transparent',
                      color: colors.text,
                      padding: '12px 14px',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ fontWeight: active ? 700 : 600, fontSize: 13 }}>
                      {c.company_name}
                    </div>
                    <div style={{ fontSize: 11, color: colors.muted2, marginTop: 2 }}>
                      {c.pipeline_stage || 'Lead'}
                      {c.drive_folder_url ? ' · Google Drive linked' : ''}
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </aside>

        <section>
          {!selected ? (
            <EmptyState
              icon={<FolderOpen size={22} />}
              title="Open a customer folder"
              subtitle="Pick a company to see quotations, invoices, delivery notes, communications, and purchasing — and attach Google Drive share links."
            />
          ) : loadingFolder ? (
            <div style={{ ...cardStyle, color: colors.muted }}>Opening folder…</div>
          ) : folder ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <header
                style={{
                  ...cardStyle,
                  background: 'linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(232,93,4,0.12) 100%)',
                  borderColor: 'color-mix(in srgb, var(--primary) 40%, transparent)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 12,
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 11,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        color: colors.muted2,
                        marginBottom: 6,
                      }}
                    >
                      Customer folder
                    </div>
                    <h2
                      style={{
                        margin: 0,
                        fontSize: compact ? 22 : 28,
                        fontWeight: 750,
                        letterSpacing: '-0.02em',
                        wordBreak: 'break-word',
                      }}
                    >
                      {folder.company}
                    </h2>
                    <p style={{ margin: '8px 0 0', color: colors.muted, fontSize: 13 }}>
                      {folder.items.length} item{folder.items.length === 1 ? '' : 's'} · suggested
                      Google Drive folder name:{' '}
                      <strong style={{ color: colors.text }}>
                        {suggestedDriveFolderName(folder.company)}
                      </strong>
                      <button
                        type="button"
                        style={{
                          appearance: 'none',
                          border: 0,
                          background: 'transparent',
                          color: colors.accent,
                          cursor: 'pointer',
                          marginLeft: 6,
                          fontSize: 12,
                          textDecoration: 'underline',
                          padding: 0,
                        }}
                        onClick={() => {
                          void navigator.clipboard?.writeText(
                            suggestedDriveFolderName(folder.company),
                          )
                          showToast('Folder name copied', 'success')
                        }}
                      >
                        Copy
                      </button>
                    </p>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    <button
                      type="button"
                      style={buttonSecondaryStyle}
                      onClick={() => setShowArchivedDocs((v) => !v)}
                    >
                      {showArchivedDocs ? 'Hide archived links' : 'Show archived links'}
                    </button>
                    {driveFolderUrl ? (
                      <a
                        href={driveFolderUrl}
                        target="_blank"
                        rel="noreferrer"
                        style={{ ...buttonSecondaryStyle, textDecoration: 'none' }}
                      >
                        <ExternalLink size={14} /> Open in Google Drive
                      </a>
                    ) : null}
                    {drive.connected && folder.crm?.id && !driveFolderId(driveFolderUrl) ? (
                      <button
                        type="button"
                        style={buttonPrimaryStyle}
                        disabled={makingFolder}
                        onClick={() => void createDriveFolder()}
                      >
                        <FolderOpen size={14} /> {makingFolder ? 'Making folder…' : 'Create folder in Google Drive'}
                      </button>
                    ) : null}
                    {rootDrive ? (
                      <a
                        href={rootDrive}
                        target="_blank"
                        rel="noreferrer"
                        style={{ ...buttonSecondaryStyle, textDecoration: 'none' }}
                      >
                        <FolderOpen size={14} /> Customers root
                      </a>
                    ) : null}
                    <Link
                      to={
                        folder.crm?.id
                          ? `/crm?edit=${encodeURIComponent(folder.crm.id)}`
                          : `/crm`
                      }
                      style={{ ...buttonSecondaryStyle, textDecoration: 'none' }}
                    >
                      CRM record
                    </Link>
                  </div>
                </div>

                <div style={{ ...fieldStyle, marginTop: 16, marginBottom: 0 }}>
                  <label style={labelStyle}>
                    <Link2 size={12} style={{ marginRight: 4 }} />
                    Google Drive folder URL
                  </label>
                  <div className={resp.toolbar} style={{ marginBottom: 0, gap: 8 }}>
                    <input
                      style={{ ...inputStyle, flex: 1 }}
                      placeholder="https://drive.google.com/drive/folders/…"
                      value={driveFolderUrl}
                      onChange={(e) => setDriveFolderUrl(e.target.value)}
                    />
                    <button
                      type="button"
                      style={buttonPrimaryStyle}
                      disabled={savingFolder || !folder.crm?.id}
                      onClick={() => void saveDriveFolder()}
                    >
                      {savingFolder ? 'Saving…' : 'Save link'}
                    </button>
                  </div>
                  <p style={{ margin: '8px 0 0', fontSize: 12, color: colors.muted, lineHeight: 1.45 }}>
                    Keep signed docs, emails, WhatsApp chats, supplier invoices, and notes in the
                    client's Google Drive folder, then paste share links below. Use Create folder so RR
                    Central can also file emails and portal uploads into it.
                  </p>
                </div>

                {checklist.length > 0 ? (
                  <ul
                    style={{
                      listStyle: 'none',
                      margin: '14px 0 0',
                      padding: 0,
                      display: 'grid',
                      gap: 8,
                    }}
                  >
                    {checklist.map((c) => (
                      <li
                        key={c.id}
                        style={{
                          fontSize: 13,
                          lineHeight: 1.45,
                          padding: '10px 12px',
                          borderRadius: 8,
                          border: `1px solid ${c.level === 'warn' ? colors.warn : colors.border}`,
                          background:
                            c.level === 'warn' ? `${colors.warn}18` : 'rgba(255,255,255,0.03)',
                          color: colors.text,
                        }}
                      >
                        {c.message}
                      </li>
                    ))}
                  </ul>
                ) : null}

                <div style={{ ...fieldStyle, marginTop: 14, marginBottom: 0 }}>
                  <label style={labelStyle}>Search in this folder</label>
                  <input
                    style={inputStyle}
                    placeholder="Filter by title, ref, WhatsApp, signed…"
                    value={fileQuery}
                    onChange={(e) => setFileQuery(e.target.value)}
                  />
                </div>
              </header>

              {CUSTOMER_FOLDER_SECTIONS.map((cat) => {
                const rows = filterFolderItems(folder.bySection[cat.id], fileQuery)
                return (
                  <section key={cat.id} style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '14px 16px',
                        borderBottom: `1px solid ${colors.border}`,
                        flexWrap: 'wrap',
                      }}
                    >
                      <span style={{ color: colors.accent }}>{sectionIcon(cat.id)}</span>
                      <div style={{ flex: 1, minWidth: 140 }}>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{cat.label}</div>
                        <div style={{ fontSize: 12, color: colors.muted2 }}>{cat.hint}</div>
                      </div>
                      <span style={{ fontSize: 12, color: colors.muted }}>{rows.length}</span>
                      <button
                        type="button"
                        style={buttonSecondaryStyle}
                        disabled={missingTable}
                        onClick={() => openUpload(cat)}
                      >
                        <Plus size={14} /> {cat.uploadButton}
                      </button>
                    </div>
                    {rows.length === 0 ? (
                      <p style={{ margin: 0, padding: '14px 16px', color: colors.muted, fontSize: 13 }}>
                        {fileQuery.trim()
                          ? 'No matches in this section.'
                          : (
                            <>
                              Nothing here yet —{' '}
                              <button
                                type="button"
                                style={{
                                  appearance: 'none',
                                  border: 0,
                                  background: 'transparent',
                                  color: colors.accent,
                                  cursor: 'pointer',
                                  padding: 0,
                                  fontSize: 13,
                                  textDecoration: 'underline',
                                }}
                                onClick={() => openUpload(cat)}
                              >
                                {cat.uploadButton.toLowerCase()}
                              </button>
                              .
                            </>
                          )}
                      </p>
                    ) : (
                      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                        {rows.map((item) => (
                          <li
                            key={item.key}
                            style={{
                              display: 'flex',
                              flexWrap: 'wrap',
                              gap: 10,
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '12px 16px',
                              borderBottom: `1px solid ${colors.border}`,
                            }}
                          >
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div style={{ fontWeight: 600, fontSize: 13 }}>{item.title}</div>
                              <div style={{ fontSize: 12, color: colors.muted2, marginTop: 2 }}>
                                {itemKindLabel(item)}
                                {item.subtitle ? ` · ${item.subtitle}` : ''}
                                {item.date ? ` · ${formatWhen(item.date)}` : ''}
                              </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              {item.status ? <StatusPill status={item.status} /> : null}
                              {item.href ? (
                                <Link
                                  to={item.href}
                                  style={{ ...buttonSecondaryStyle, textDecoration: 'none' }}
                                >
                                  Open
                                </Link>
                              ) : null}
                              {item.driveUrl ? (
                                <a
                                  href={item.driveUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  style={{ ...buttonSecondaryStyle, textDecoration: 'none' }}
                                >
                                  <ExternalLink size={14} /> Google Drive
                                </a>
                              ) : null}
                              {item.documentId ? (
                                <button
                                  type="button"
                                  style={item.archived ? buttonSecondaryStyle : buttonDangerStyle}
                                  title={item.archived ? 'Restore link' : 'Archive link only'}
                                  onClick={() => void removeDriveFile(item)}
                                >
                                  <Trash2 size={14} /> {item.archived ? 'Restore' : 'Unlink'}
                                </button>
                              ) : null}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                )
              })}
            </div>
          ) : null}
        </section>
      </div>

      <LinkDriveFileModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSaved={() => (selected ? openCompany(selected) : undefined)}
        company={selected}
        crmId={folder?.crm?.id || null}
        uploadedBy={who}
        mode={sectionToMode(addSection)}
        category={addSection.signedCategory}
        title={addSection.uploadTitle}
        hint={addSection.uploadHint}
        relatedRefOptions={relatedRefOptionsForSection(folder, addSection.id)}
      />
    </div>
  )
}
