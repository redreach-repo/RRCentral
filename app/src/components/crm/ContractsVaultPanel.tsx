import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Copy, ExternalLink, FileSignature, Plus, Send } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useSettings } from '../../contexts/SettingsContext'
import { useToast } from '../../contexts/ToastContext'
import { logActivity } from '../../lib/activity'
import { errorMessage } from '../../lib/errors'
import { parseVaultNdaForm } from '../../lib/schemas/vaultNda'
import {
  createLegalDocument,
  createLegalSignLink,
  listLegalDocuments,
  listSignLinks,
  revokeLegalSignLink,
  updateLegalDocumentMeta,
  voidLegalDocument,
} from '../../lib/legalDocumentStore'
import {
  LEGAL_SIGN_STATE_LABELS,
  legalDocLabel,
  legalSignLinkState,
  type LegalDocType,
} from '../../lib/legalDocuments'
import { buildNda, ndaFooter, templateInUse } from '../../lib/nda'
import { blobToBase64, ndaPdf } from '../../lib/ndaPdf'
import { listNdaTemplates } from '../../lib/ndaTemplateStore'
import { obligationIsOverdue, obligationOwnerLabel } from '../../lib/obligationBoard'
import {
  filterOpenObligations,
  listObligationsForCompany,
  saveContractObligation,
  setObligationStatus,
} from '../../lib/obligationBoardStore'
import { parseObligationForm } from '../../lib/schemas/obligation'
import { csvRowsToObjects, exportListCsv, parseCsv, parseListIoRows, type ColumnMap } from '../../lib/listIo'
import { btn, btnGhost, btnPrimary, colors, input } from '../../lib/pageStyles'
import type {
  ContractObligation,
  CrmContact,
  CrmEntry,
  LegalDocument,
  LegalSignLink,
  NdaTemplate,
} from '../../lib/types'

const CONTRACTS_VAULT_CSV_COLUMNS: ColumnMap[] = [
  { key: 'title', label: 'title' },
  { key: 'doc_type', label: 'doc_type' },
  { key: 'status', label: 'status' },
  { key: 'party_name', label: 'party_name', required: true },
  { key: 'party_email', label: 'party_email' },
  { key: 'created_at', label: 'created_at' },
  { key: 'sent_at', label: 'sent_at' },
  { key: 'signed_at', label: 'signed_at' },
  { key: 'drive_url', label: 'drive_url' },
]

const CONTRACTS_VAULT_CSV_HEADERS = CONTRACTS_VAULT_CSV_COLUMNS.map((c) => c.key)

const DOC_TYPES: LegalDocType[] = ['nda', 'service_agreement', 'other']

function appBaseUrl(): string {
  const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '')
  return `${window.location.origin}${base}`
}

function vaultMatchKey(title: string, partyName: string, partyEmail: string): string {
  const party = (partyEmail || partyName).trim().toLowerCase()
  return `${title.trim().toLowerCase()}|${party}`
}

function parseDocType(raw: string): LegalDocType {
  const v = raw.trim().toLowerCase().replace(/\s+/g, '_')
  if ((DOC_TYPES as string[]).includes(v)) return v as LegalDocType
  if (v === 'service' || v === 'agreement' || v === 'service-agreement') return 'service_agreement'
  return 'nda'
}

function wantsVoid(status: string): boolean {
  const v = status.trim().toLowerCase()
  return v === 'void' || v === 'voided' || v === 'cancelled' || v === 'canceled'
}

export default function ContractsVaultPanel({
  entry,
  contacts,
}: {
  entry: CrmEntry
  contacts: CrmContact[]
}) {
  const { user } = useAuth()
  const { settings } = useSettings()
  const { showToast } = useToast()
  const [rows, setRows] = useState<LegalDocument[]>([])
  const [missingTable, setMissingTable] = useState(false)
  const [templates, setTemplates] = useState<NdaTemplate[]>([])
  const [busy, setBusy] = useState(false)
  const [partyName, setPartyName] = useState('')
  const [partyEmail, setPartyEmail] = useState('')
  const [lastLinkUrl, setLastLinkUrl] = useState('')
  const [linksByDoc, setLinksByDoc] = useState<Record<string, LegalSignLink[]>>({})
  const [obligations, setObligations] = useState<ContractObligation[]>([])
  const [missingObligations, setMissingObligations] = useState(false)
  const [newDuty, setNewDuty] = useState('')
  const [newDue, setNewDue] = useState('')
  const [importing, setImporting] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)

  const approved = useMemo(() => templateInUse(templates), [templates])
  const openDuties = useMemo(() => filterOpenObligations(obligations), [obligations])

  const load = useCallback(async () => {
    const [{ rows: docs, missingTable: missing }, tpl, obl] = await Promise.all([
      listLegalDocuments(entry.company_name),
      listNdaTemplates(),
      listObligationsForCompany({ companyName: entry.company_name, crmId: entry.id }),
    ])
    setRows(docs)
    setMissingTable(missing || tpl.missingTable)
    setTemplates(tpl.rows)
    setObligations(obl.rows)
    setMissingObligations(obl.missingTable)
    const map: Record<string, LegalSignLink[]> = {}
    await Promise.all(
      docs.slice(0, 20).map(async (d) => {
        map[d.id] = await listSignLinks(d.id)
      }),
    )
    setLinksByDoc(map)
  }, [entry.company_name, entry.id])

  useEffect(() => {
    void load().catch((e) => showToast(errorMessage(e, 'Could not load contracts.'), 'error'))
  }, [load, showToast])

  useEffect(() => {
    const primary = contacts.find((c) => /primary/i.test(c.role || '')) || contacts[0]
    if (primary) {
      setPartyName(primary.name || '')
      setPartyEmail(primary.email || '')
    }
  }, [contacts])

  async function createNda() {
    const parsed = parseVaultNdaForm({ partyName, partyEmail })
    if (!parsed.ok) {
      showToast(parsed.error, 'error')
      return
    }
    setBusy(true)
    try {
      const doc = await createLegalDocument({
        companyName: entry.company_name,
        crmId: entry.id,
        docType: 'nda',
        title: approved?.title || 'Non-disclosure agreement',
        partyName: parsed.data.partyName,
        partyEmail: parsed.data.partyEmail,
        partyCompany: entry.company_name,
        templateId: approved?.id || null,
        templateVersion: approved?.version ?? null,
        createdBy: user?.email || '',
      })
      await logActivity('create_nda', 'legal_document', doc.id.slice(0, 8), entry.company_name, user?.email || '')
      showToast('NDA draft created in the vault.', 'success')
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Could not create the NDA.'), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function importContractsCsv(file: File) {
    setImporting(true)
    try {
      const text = await file.text()
      const { headers, rows: csvRows } = parseCsv(text)
      if (!headers.length) {
        showToast('CSV has no header row', 'error')
        return
      }
      const objects = csvRowsToObjects(headers, csvRows).map((row) => {
        const normalized: Record<string, string> = {}
        for (const c of CONTRACTS_VAULT_CSV_COLUMNS) {
          normalized[c.key] = String(row[c.label] ?? row[c.key] ?? '').trim()
        }
        return normalized
      })
      const { ok, errors } = parseListIoRows(objects, CONTRACTS_VAULT_CSV_COLUMNS)
      if (!ok.length && errors.length) {
        showToast(errors[0] || 'No valid contract rows', 'error')
        return
      }

      const working = [...rows]
      const byKey = new Map<string, LegalDocument>()
      for (const doc of working) {
        byKey.set(vaultMatchKey(doc.title, doc.party_name, doc.party_email), doc)
      }

      let saved = 0
      let skipped = errors.length
      for (const row of ok) {
        const partyName = row.party_name.trim()
        const partyEmail = (row.party_email || '').trim()
        const title = (row.title || '').trim() || 'Non-disclosure agreement'
        const docType = parseDocType(row.doc_type || 'nda')
        const driveUrl = (row.drive_url || '').trim()
        const key = vaultMatchKey(title, partyName, partyEmail)
        const existing = byKey.get(key)

        if (existing) {
          if (existing.status === 'signed') {
            skipped += 1
            continue
          }
          if (wantsVoid(row.status || '')) {
            if (existing.status === 'void') {
              skipped += 1
              continue
            }
            await voidLegalDocument(existing.id)
            byKey.set(key, { ...existing, status: 'void' })
            saved += 1
            continue
          }
          if (existing.status === 'void') {
            skipped += 1
            continue
          }
          await updateLegalDocumentMeta(existing.id, {
            title,
            docType,
            partyName,
            partyEmail,
            driveUrl,
          })
          byKey.set(key, {
            ...existing,
            title,
            doc_type: docType,
            party_name: partyName,
            party_email: partyEmail,
            drive_url: driveUrl,
          })
          saved += 1
          continue
        }

        if (wantsVoid(row.status || '')) {
          skipped += 1
          continue
        }

        const created = await createLegalDocument({
          companyName: entry.company_name,
          crmId: entry.id,
          docType,
          title,
          partyName,
          partyEmail,
          partyCompany: entry.company_name,
          templateId: approved?.id || null,
          templateVersion: approved?.version ?? null,
          createdBy: user?.email || '',
        })
        if (driveUrl) {
          await updateLegalDocumentMeta(created.id, { driveUrl })
          created.drive_url = driveUrl
        }
        byKey.set(key, created)
        working.push(created)
        saved += 1
      }

      if (!saved && skipped) {
        showToast('No matching contract rows to import in CSV', 'error')
        return
      }
      const skipNote = skipped ? ` · ${skipped} row(s) skipped` : ''
      showToast(`Imported ${saved} contract row(s)${skipNote}`, 'success')
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Contracts CSV import failed'), 'error')
    } finally {
      setImporting(false)
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

  async function sendForSignature(doc: LegalDocument) {
    setBusy(true)
    setLastLinkUrl('')
    try {
      const body = approved?.body || templates.find((t) => t.id === doc.template_id)?.body || ''
      const { blocks } = buildNda(body, {
        effectiveDate: new Date().toISOString().slice(0, 10),
        providerName: settings.companyName || 'Red Reach Middle East FZE',
        providerAddress: settings.address || 'Umm Al Quwain, UAE',
        partyCompany: doc.party_company || entry.company_name,
        partyName: doc.party_name,
        partyEmail: doc.party_email,
      })
      const tplMeta = approved || templates.find((t) => t.id === doc.template_id) || null
      const blob = ndaPdf(blocks, {
        footer: ndaFooter(tplMeta),
        draft: !tplMeta || tplMeta.status !== 'approved',
        providerName: settings.companyName || 'Red Reach Middle East FZE',
        partyCompany: doc.party_company || entry.company_name,
        partyName: doc.party_name,
      })
      const pdfBase64 = await blobToBase64(blob)
      const fileName = `NDA-${entry.company_name.replace(/[^\w.-]+/g, '_').slice(0, 40)}.pdf`
      const { url } = await createLegalSignLink({
        document: doc,
        pdfBase64,
        fileName,
        createdBy: user?.email || '',
        appUrl: appBaseUrl(),
        label: doc.party_name,
      })
      setLastLinkUrl(url)
      await logActivity('send_nda', 'legal_document', doc.id.slice(0, 8), `${entry.company_name} · sent for signature`, user?.email || '')
      showToast('Sign link ready — copy and send it to the client.', 'success')
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Could not create the sign link.'), 'error')
    } finally {
      setBusy(false)
    }
  }

  if (missingTable) {
    return (
      <p style={{ fontSize: 13, color: colors.muted, margin: '12px 0' }}>
        Run <code>supabase/migrations/20261206120000_legal_documents.sql</code> in the Supabase SQL editor to enable
        the contracts vault and NDA signing links (assent capture — not UAE QES).
      </p>
    )
  }

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end', marginBottom: 12 }}>
        <label style={{ display: 'grid', gap: 4, fontSize: 12, color: colors.muted, flex: '1 1 160px' }}>
          Signatory
          <input
            style={input}
            list="nda-contacts"
            value={partyName}
            onChange={(e) => setPartyName(e.target.value)}
            placeholder="Contact name"
          />
          <datalist id="nda-contacts">
            {contacts.map((c) => (
              <option key={c.id || c.name} value={c.name}>
                {c.email}
              </option>
            ))}
          </datalist>
        </label>
        <label style={{ display: 'grid', gap: 4, fontSize: 12, color: colors.muted, flex: '1 1 180px' }}>
          Email
          <input
            style={input}
            value={partyEmail}
            onChange={(e) => setPartyEmail(e.target.value)}
            placeholder="optional"
          />
        </label>
        <input
          ref={importInputRef}
          type="file"
          accept=".csv,text/csv"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void importContractsCsv(file)
          }}
        />
        <button
          type="button"
          style={btn}
          disabled={importing || busy}
          onClick={() => importInputRef.current?.click()}
        >
          {importing ? 'Importing…' : 'Import CSV'}
        </button>
        <button
          type="button"
          style={btn}
          disabled={!rows.length}
          onClick={() => {
            exportListCsv(
              `contracts-${entry.company_name || 'vault'}.csv`,
              CONTRACTS_VAULT_CSV_HEADERS,
              rows.map((d) => ({
                title: d.title,
                doc_type: d.doc_type,
                status: d.status,
                party_name: d.party_name,
                party_email: d.party_email,
                created_at: d.created_at,
                sent_at: d.sent_at || '',
                signed_at: d.signed_at || '',
                drive_url: d.drive_url || '',
              })),
            )
            showToast('Contracts CSV downloaded', 'success')
          }}
        >
          Export CSV
        </button>
        <button type="button" style={btnPrimary} disabled={busy} onClick={() => void createNda()}>
          <Plus size={14} /> New NDA
        </button>
      </div>

      {!approved ? (
        <p style={{ fontSize: 12, color: colors.muted, margin: '0 0 10px' }}>
          No lawyer-approved NDA template yet — PDFs will say DRAFT. Approve one under{' '}
          <strong>NDA template</strong> in the menu.
        </p>
      ) : null}

      {lastLinkUrl ? (
        <div
          style={{
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            alignItems: 'center',
            marginBottom: 12,
            padding: 10,
            border: `1px solid ${colors.border}`,
            borderRadius: 8,
            background: colors.card,
          }}
        >
          <FileSignature size={16} />
          <code style={{ flex: 1, fontSize: 12, wordBreak: 'break-all' }}>{lastLinkUrl}</code>
          <button
            type="button"
            style={btn}
            onClick={() => {
              void navigator.clipboard.writeText(lastLinkUrl)
              showToast('Sign link copied.', 'success')
            }}
          >
            <Copy size={14} /> Copy link
          </button>
        </div>
      ) : null}

      {!missingObligations ? (
        <div
          style={{
            marginBottom: 14,
            padding: 10,
            border: `1px solid ${colors.border}`,
            borderRadius: 8,
            background: colors.card,
            display: 'grid',
            gap: 8,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <strong style={{ fontSize: 13 }}>Open obligations</strong>
            <Link to="/obligations" style={{ fontSize: 12, color: colors.accent }}>
              Full board
            </Link>
          </div>
          {openDuties.length ? (
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, display: 'grid', gap: 4 }}>
              {openDuties.slice(0, 8).map((o) => (
                <li key={o.id}>
                  {o.title}
                  <span style={{ color: colors.muted }}>
                    {' '}
                    · {obligationOwnerLabel(o.owner_party)}
                    {o.due_date ? ` · due ${o.due_date}` : ''}
                    {obligationIsOverdue(o) ? ' · overdue' : ''}
                  </span>{' '}
                  <button
                    type="button"
                    style={{ ...btnGhost, padding: '1px 6px', fontSize: 11 }}
                    disabled={busy}
                    onClick={() =>
                      void setObligationStatus(o.id, 'done')
                        .then(load)
                        .then(() => showToast('Obligation marked done', 'success'))
                        .catch((e) => showToast(errorMessage(e), 'error'))
                    }
                  >
                    Done
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ margin: 0, fontSize: 12, color: colors.muted }}>No open obligations for this company.</p>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            <input
              style={{ ...input, flex: '1 1 160px' }}
              placeholder="New obligation title"
              value={newDuty}
              onChange={(e) => setNewDuty(e.target.value)}
            />
            <input style={{ ...input, width: 140 }} type="date" value={newDue} onChange={(e) => setNewDue(e.target.value)} />
            <button
              type="button"
              style={btn}
              disabled={busy || !newDuty.trim()}
              onClick={() => {
                const parsed = parseObligationForm({
                  company_name: entry.company_name,
                  crm_id: entry.id,
                  legal_document_id: null,
                  title: newDuty,
                  description: '',
                  owner_party: 'red_reach',
                  due_date: newDue || null,
                  status: 'open',
                })
                if (!parsed.ok) {
                  showToast(parsed.error, 'error')
                  return
                }
                setBusy(true)
                void saveContractObligation(parsed.data, user?.email || '')
                  .then(() => {
                    setNewDuty('')
                    setNewDue('')
                    showToast('Obligation added', 'success')
                    return load()
                  })
                  .catch((e) => showToast(errorMessage(e, 'Could not add obligation'), 'error'))
                  .finally(() => setBusy(false))
              }}
            >
              Add
            </button>
          </div>
        </div>
      ) : null}

      {!rows.length ? (
        <p style={{ fontSize: 13, color: colors.muted, margin: 0 }}>No contracts or NDAs stored for this company yet.</p>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {rows.map((doc) => {
            const links = linksByDoc[doc.id] || []
            const active = links.find((l) => legalSignLinkState(l) === 'active')
            return (
              <div
                key={doc.id}
                style={{
                  border: `1px solid ${colors.border}`,
                  borderRadius: 8,
                  padding: 10,
                  display: 'grid',
                  gap: 6,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <div>
                    <strong style={{ fontSize: 14 }}>
                      {legalDocLabel(doc.doc_type)} · {doc.title}
                    </strong>
                    <div style={{ fontSize: 12, color: colors.muted }}>
                      {doc.party_name}
                      {doc.party_email ? ` · ${doc.party_email}` : ''} · {doc.status}
                      {doc.signed_at ? ` · signed ${String(doc.signed_at).slice(0, 10)}` : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {doc.status === 'draft' || doc.status === 'sent' || doc.status === 'expired' ? (
                      <button type="button" style={btnPrimary} disabled={busy} onClick={() => void sendForSignature(doc)}>
                        <Send size={14} /> {doc.status === 'draft' ? 'Send for signature' : 'Resend link'}
                      </button>
                    ) : null}
                    {doc.drive_url ? (
                      <a href={doc.drive_url} target="_blank" rel="noreferrer" style={{ ...btn, textDecoration: 'none' }}>
                        <ExternalLink size={14} /> Drive
                      </a>
                    ) : null}
                    {doc.status !== 'signed' && doc.status !== 'void' ? (
                      <button
                        type="button"
                        style={btnGhost}
                        disabled={busy}
                        onClick={() =>
                          void voidLegalDocument(doc.id)
                            .then(load)
                            .then(() => showToast('Document voided.', 'success'))
                            .catch((e) => showToast(errorMessage(e), 'error'))
                        }
                      >
                        Void
                      </button>
                    ) : null}
                  </div>
                </div>
                {links.length ? (
                  <div style={{ fontSize: 12, color: colors.muted }}>
                    Links:{' '}
                    {links.map((l) => {
                      const st = legalSignLinkState(l)
                      return (
                        <span key={l.id} style={{ marginRight: 10 }}>
                          {LEGAL_SIGN_STATE_LABELS[st]}
                          {st === 'active' ? (
                            <>
                              {' '}
                              <button
                                type="button"
                                style={{ ...btnGhost, padding: '2px 6px', fontSize: 11 }}
                                onClick={() =>
                                  void revokeLegalSignLink(l.id)
                                    .then(load)
                                    .then(() => showToast('Link turned off.', 'success'))
                                }
                              >
                                Turn off
                              </button>
                            </>
                          ) : null}
                        </span>
                      )
                    })}
                    {active ? null : null}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
