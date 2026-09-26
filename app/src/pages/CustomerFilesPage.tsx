import { useCallback, useEffect, useMemo, useState } from 'react'
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
import { useSettings } from '../contexts/SettingsContext'
import { useToast } from '../contexts/ToastContext'
import EmptyState from '../components/EmptyState'
import StatusPill from '../components/StatusPill'
import LinkWorkDriveModal, { type LinkWorkDriveMode } from '../components/LinkWorkDriveModal'
import { logActivity } from '../lib/activity'
import { errorMessage, isMissingRelationError } from '../lib/errors'
import {
  buildFolderChecklist,
  CUSTOMER_FOLDER_SECTIONS,
  deleteCustomerDocument,
  filterFolderItems,
  loadCustomerFolder,
  relatedRefOptionsForSection,
  suggestedDriveFolderName,
  updateCrmDriveFolderUrl,
  type CustomerFolder,
  type CustomerFolderItem,
  type FolderSectionId,
} from '../lib/customerFiles'
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
  toolbarStyle,
} from '../lib/uiStyles'

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
  if (item.section === 'communication') return 'WorkDrive'
  if (item.section === 'purchasing') return 'Purchasing · WorkDrive'
  return 'Signed · WorkDrive'
}

function sectionToMode(section: FolderSection): LinkWorkDriveMode {
  if (section.mode === 'communication') return 'communication'
  if (section.mode === 'purchasing') return 'purchasing'
  return 'signed'
}

export default function CustomerFilesPage() {
  const { user } = useAuth()
  const { settings } = useSettings()
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

  function openUpload(section: FolderSection) {
    setAddSection(section)
    setAddOpen(true)
  }

  const rootDrive = (
    settings.customerWorkDriveRootUrl ||
    settings.customerDriveRootUrl ||
    ''
  ).trim()

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
        const next = await loadCustomerFolder(name)
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
    [searchParams, setSearchParams, showToast],
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

  const filteredCompanies = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return companies
    return companies.filter((c) =>
      `${c.company_name} ${c.primary_contact} ${c.owner}`.toLowerCase().includes(q),
    )
  }, [companies, search])

  async function saveDriveFolder() {
    if (!folder?.crm?.id) {
      showToast('Save this company in CRM first, then link its WorkDrive folder', 'error')
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
      showToast('WorkDrive folder linked', 'success')
      await openCompany(folder.company)
    } catch (e) {
      showToast(errorMessage(e, 'Could not save WorkDrive folder link'), 'error')
    } finally {
      setSavingFolder(false)
    }
  }

  async function removeDriveFile(item: CustomerFolderItem) {
    if (!item.documentId) return
    try {
      await deleteCustomerDocument(item.documentId)
      showToast('Link removed (file stays on WorkDrive)', 'success')
      if (selected) await openCompany(selected)
    } catch (e) {
      showToast(errorMessage(e, 'Could not remove link'), 'error')
    }
  }

  return (
    <div style={pageStyle}>
      <div style={toolbarStyle}>
        <div>
          <h1 style={pageTitleStyle}>Customer files</h1>
          <p style={pageSubtitleStyle}>
            One folder per customer — quotes, invoices, delivery notes, communications, purchasing,
            and signed WorkDrive copies
          </p>
        </div>
      </div>

      {missingTable ? (
        <div style={{ ...cardStyle, marginBottom: 16, borderColor: colors.warn }}>
          <strong style={{ color: colors.warn }}>SQL needed</strong>
          <p style={{ margin: '8px 0 0', color: colors.muted, fontSize: 14, lineHeight: 1.5 }}>
            Run <code style={{ color: colors.accent }}>supabase/migrations/20260924224316_customer_files.sql</code> in
            the Supabase SQL editor so customer folders and WorkDrive links can be saved.
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
                      background: active ? `${colors.accent}18` : 'transparent',
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
                      {c.drive_folder_url ? ' · WorkDrive linked' : ''}
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
              subtitle="Pick a company to see quotations, invoices, delivery notes, communications, and purchasing — and attach Zoho WorkDrive share links."
            />
          ) : loadingFolder ? (
            <div style={{ ...cardStyle, color: colors.muted }}>Opening folder…</div>
          ) : folder ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <header
                style={{
                  ...cardStyle,
                  background: 'linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(232,93,4,0.12) 100%)',
                  borderColor: `${colors.accent}55`,
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
                      WorkDrive folder name:{' '}
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
                    {driveFolderUrl ? (
                      <a
                        href={driveFolderUrl}
                        target="_blank"
                        rel="noreferrer"
                        style={{ ...buttonSecondaryStyle, textDecoration: 'none' }}
                      >
                        <ExternalLink size={14} /> Open in WorkDrive
                      </a>
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
                    Zoho WorkDrive folder URL
                  </label>
                  <div className={resp.toolbar} style={{ marginBottom: 0, gap: 8 }}>
                    <input
                      style={{ ...inputStyle, flex: 1 }}
                      placeholder="https://workdrive.zoho.com/… or share link"
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
                    Keep signed docs, emails, WhatsApp chats, supplier invoices, and notes in Zoho
                    WorkDrive, then paste share links below. Set a shared Customers root in Settings →
                    Customer WorkDrive.
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
                                  <ExternalLink size={14} /> WorkDrive
                                </a>
                              ) : null}
                              {item.documentId ? (
                                <button
                                  type="button"
                                  style={buttonDangerStyle}
                                  title="Remove link only"
                                  onClick={() => void removeDriveFile(item)}
                                >
                                  <Trash2 size={14} />
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

      <LinkWorkDriveModal
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
