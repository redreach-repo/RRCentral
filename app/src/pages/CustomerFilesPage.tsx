import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import {
  ExternalLink,
  FileText,
  FileUp,
  FolderOpen,
  Link2,
  Plus,
  Receipt,
  Trash2,
  Truck,
  Wallet,
} from 'lucide-react'
import { db } from '../lib/db'
import type { CrmEntry, CustomerDocumentCategory } from '../lib/types'
import { useAuth } from '../contexts/AuthContext'
import { useSettings } from '../contexts/SettingsContext'
import { useToast } from '../contexts/ToastContext'
import Modal from '../components/Modal'
import EmptyState from '../components/EmptyState'
import StatusPill from '../components/StatusPill'
import { logActivity } from '../lib/activity'
import { errorMessage, isMissingRelationError } from '../lib/errors'
import {
  CUSTOMER_DOCUMENT_CATEGORIES,
  deleteCustomerDocument,
  isWorkDriveShareUrl,
  loadCustomerFolder,
  saveCustomerDriveLink,
  suggestedDriveFolderName,
  updateCrmDriveFolderUrl,
  type CustomerFolder,
  type CustomerFolderItem,
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
  selectStyle,
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

function categoryIcon(category: CustomerDocumentCategory) {
  switch (category) {
    case 'quotation':
      return <FileText size={16} />
    case 'invoice':
      return <Receipt size={16} />
    case 'delivery_note':
      return <Truck size={16} />
    case 'payment_slip':
      return <Wallet size={16} />
    case 'supplier_invoice':
      return <FileUp size={16} />
    default:
      return <FolderOpen size={16} />
  }
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
  const [selected, setSelected] = useState('')
  const [folder, setFolder] = useState<CustomerFolder | null>(null)
  const [loadingList, setLoadingList] = useState(true)
  const [loadingFolder, setLoadingFolder] = useState(false)
  const [missingTable, setMissingTable] = useState(false)
  const [driveFolderUrl, setDriveFolderUrl] = useState('')
  const [savingFolder, setSavingFolder] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [savingDoc, setSavingDoc] = useState(false)
  const [addForm, setAddForm] = useState({
    category: 'payment_slip' as CustomerDocumentCategory,
    title: '',
    driveUrl: '',
    relatedRef: '',
    notes: '',
  })

  const rootDrive = (
    settings.customerWorkDriveRootUrl ||
    settings.customerDriveRootUrl ||
    ''
  ).trim()

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
      )
      showToast('WorkDrive folder linked', 'success')
      await openCompany(folder.company)
    } catch (e) {
      showToast(errorMessage(e, 'Could not save WorkDrive folder link'), 'error')
    } finally {
      setSavingFolder(false)
    }
  }

  async function addDriveFile() {
    if (!selected) return
    if (!isWorkDriveShareUrl(addForm.driveUrl) && addForm.driveUrl.trim()) {
      showToast('Use a Zoho WorkDrive share link', 'error')
      return
    }
    setSavingDoc(true)
    try {
      await saveCustomerDriveLink({
        company: selected,
        crmId: folder?.crm?.id || null,
        category: addForm.category,
        title: addForm.title,
        driveUrl: addForm.driveUrl,
        relatedRef: addForm.relatedRef,
        notes: addForm.notes,
        uploadedBy: who,
      })
      await logActivity(
        'add_customer_drive_file',
        'customer_document',
        selected,
        `${addForm.category}: ${addForm.title}`,
        who,
      )
      showToast('WorkDrive file linked', 'success')
      setAddOpen(false)
      setAddForm({
        category: 'payment_slip',
        title: '',
        driveUrl: '',
        relatedRef: '',
        notes: '',
      })
      await openCompany(selected)
    } catch (e) {
      if (isMissingRelationError(e)) {
        setMissingTable(true)
        showToast('Run supabase-customer-files-upgrade.sql in Supabase first', 'error')
      } else {
        showToast(errorMessage(e, 'Could not save WorkDrive link'), 'error')
      }
    } finally {
      setSavingDoc(false)
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
            One folder per customer — quotes, invoices, delivery notes, and WorkDrive uploads
          </p>
        </div>
        {selected ? (
          <button
            type="button"
            style={buttonPrimaryStyle}
            onClick={() => setAddOpen(true)}
            title={
              missingTable
                ? 'Run supabase-customer-files-upgrade.sql to enable WorkDrive links'
                : undefined
            }
          >
            <Plus size={16} /> Add WorkDrive link
          </button>
        ) : null}
      </div>

      {missingTable ? (
        <div style={{ ...cardStyle, marginBottom: 16, borderColor: colors.warn }}>
          <strong style={{ color: colors.warn }}>SQL needed</strong>
          <p style={{ margin: '8px 0 0', color: colors.muted, fontSize: 14, lineHeight: 1.5 }}>
            Run <code style={{ color: colors.accent }}>supabase-customer-files-upgrade.sql</code> in
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
              subtitle="Pick a company to see quotations, invoices, delivery notes, and WorkDrive-linked payment slips — files stay on Zoho WorkDrive so Supabase stays light."
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
                    Upload payment slips and signed copies in Zoho WorkDrive (keeps Supabase / hosting
                    light), then paste share links below. Set a shared Customers root folder in
                    Settings → Customer WorkDrive.
                  </p>
                </div>
              </header>

              {CUSTOMER_DOCUMENT_CATEGORIES.map((cat) => {
                const rows = folder.byCategory[cat.id]
                return (
                  <section key={cat.id} style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '14px 16px',
                        borderBottom: `1px solid ${colors.border}`,
                      }}
                    >
                      <span style={{ color: colors.accent }}>{categoryIcon(cat.id)}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{cat.label}</div>
                        <div style={{ fontSize: 12, color: colors.muted2 }}>{cat.hint}</div>
                      </div>
                      <span style={{ fontSize: 12, color: colors.muted }}>{rows.length}</span>
                    </div>
                    {rows.length === 0 ? (
                      <p style={{ margin: 0, padding: '14px 16px', color: colors.muted, fontSize: 13 }}>
                        Nothing here yet
                        {cat.id === 'payment_slip' ? (
                          <>
                            {' '}
                            —{' '}
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
                              onClick={() => {
                                setAddForm((f) => ({ ...f, category: 'payment_slip' }))
                                setAddOpen(true)
                              }}
                            >
                              add a WorkDrive link
                            </button>
                            .
                          </>
                        ) : (
                          '.'
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
                                {item.kind === 'crm' ? 'In CRM' : 'On WorkDrive'}
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

      <Modal open={addOpen} title="Link a WorkDrive file" onClose={() => setAddOpen(false)} width={520}>
        <p style={{ color: colors.muted, fontSize: 14, marginTop: 0, lineHeight: 1.5 }}>
          Upload the file to this customer’s Zoho WorkDrive folder, copy the share link, and paste it
          here. The CRM only stores the link — not the file bytes.
        </p>
        <div style={fieldStyle}>
          <label style={labelStyle}>Category</label>
          <select
            style={selectStyle}
            value={addForm.category}
            onChange={(e) =>
              setAddForm((f) => ({ ...f, category: e.target.value as CustomerDocumentCategory }))
            }
          >
            {CUSTOMER_DOCUMENT_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>Title *</label>
          <input
            style={inputStyle}
            value={addForm.title}
            onChange={(e) => setAddForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="e.g. Payment slip 12 Sep"
          />
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>Zoho WorkDrive share link *</label>
          <input
            style={inputStyle}
            value={addForm.driveUrl}
            onChange={(e) => setAddForm((f) => ({ ...f, driveUrl: e.target.value }))}
            placeholder="https://workdrive.zoho.com/… or workdrive.zohoexternal.com/…"
          />
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>Related ref (optional)</label>
          <input
            style={inputStyle}
            value={addForm.relatedRef}
            onChange={(e) => setAddForm((f) => ({ ...f, relatedRef: e.target.value }))}
            placeholder="Invoice or quote number"
          />
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>Notes</label>
          <textarea
            style={{ ...inputStyle, minHeight: 64, resize: 'vertical' }}
            value={addForm.notes}
            onChange={(e) => setAddForm((f) => ({ ...f, notes: e.target.value }))}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" style={buttonSecondaryStyle} onClick={() => setAddOpen(false)}>
            Cancel
          </button>
          <button
            type="button"
            style={buttonPrimaryStyle}
            disabled={savingDoc}
            onClick={() => void addDriveFile()}
          >
            {savingDoc ? 'Saving…' : 'Save link'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
