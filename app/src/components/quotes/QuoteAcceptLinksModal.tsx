import { useCallback, useEffect, useRef, useState } from 'react'
import { format, parseISO } from 'date-fns'
import Modal from '../Modal'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { errorMessage } from '../../lib/errors'
import {
  ACCEPT_STATE_LABELS,
  acceptLinkState,
  canHaveAcceptLink,
  canSeeAcceptance,
  type AcceptLinkRow,
  type AcceptLinkState,
} from '../../lib/quoteAccept'
import {
  createAcceptLink,
  listAcceptances,
  listAcceptLinks,
  revokeAcceptLink,
  type QuoteAcceptance,
} from '../../lib/quoteAcceptStore'
import type { Quotation } from '../../lib/types'
import { csvRowsToObjects, exportListCsv, parseCsv } from '../../lib/listIo'
import { buttonPrimaryStyle, buttonSecondaryStyle, colors, inputStyle, labelStyle } from '../../lib/uiStyles'

const when = (iso: string | null) => (iso ? format(parseISO(iso), 'd MMM yyyy, HH:mm') : '')

const EXPORT_COLUMNS = [
  'state',
  'label',
  'created_by',
  'created_at',
  'expires_at',
  'revoked_at',
  'last_opened_at',
  'accepted_at',
  'accepted_name',
] as const

const STATE_BY_LABEL = new Map(
  (Object.entries(ACCEPT_STATE_LABELS) as [AcceptLinkState, string][]).map(([k, label]) => [
    label.toLowerCase(),
    k,
  ]),
)

function parseAcceptState(raw: string, revokedAt: string, acceptedAt: string): AcceptLinkState | null {
  if (acceptedAt.trim()) return 'accepted'
  if (revokedAt.trim()) return 'revoked'
  const v = raw.trim().toLowerCase()
  if (!v) return null
  if (v === 'working' || v === 'active') return 'active'
  if (v === 'turned off' || v === 'revoked' || v === 'off') return 'revoked'
  if (v === 'expired') return 'expired'
  if (v === 'accepted') return 'accepted'
  return STATE_BY_LABEL.get(v) ?? null
}

function labelKey(label: string): string {
  return label.trim().toLowerCase()
}

/**
 * Private links a client opens to see the quote PDF and accept it. Each link
 * carries the PDF as it is when the link is made, has an expiry date and can
 * be turned off. Admins see the full acceptance record.
 */
export default function QuoteAcceptLinksModal({
  open,
  onClose,
  quote,
  makePdfBase64,
}: {
  open: boolean
  onClose: () => void
  quote: Quotation
  makePdfBase64: () => Promise<string>
}) {
  const { user, userRole } = useAuth()
  const { showToast } = useToast()
  const [rows, setRows] = useState<AcceptLinkRow[]>([])
  const [missing, setMissing] = useState(false)
  const [acceptances, setAcceptances] = useState<QuoteAcceptance[]>([])
  const [label, setLabel] = useState('')
  const [newLink, setNewLink] = useState('')
  const [busy, setBusy] = useState(false)
  const [importing, setImporting] = useState(false)
  const [csvFiltered, setCsvFiltered] = useState(false)
  const [importedRows, setImportedRows] = useState<AcceptLinkRow[] | null>(null)
  const importInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    const r = await listAcceptLinks(quote.id)
    setRows(r.rows)
    setMissing(r.missingTable)
    setCsvFiltered(false)
    setImportedRows(null)
    if (canSeeAcceptance(userRole)) setAcceptances(await listAcceptances(quote.id))
  }, [quote.id, userRole])

  useEffect(() => {
    if (open) void load().catch((e) => showToast(errorMessage(e, 'Could not load the links'), 'error'))
  }, [open, load, showToast])

  const shown = csvFiltered && importedRows ? importedRows : rows

  async function create() {
    setBusy(true)
    try {
      const pdf = await makePdfBase64()
      const link = await createAcceptLink(quote, pdf, label, user?.email || '')
      setNewLink(link)
      setLabel('')
      await load()
      try {
        await navigator.clipboard.writeText(link)
        showToast('Link made and copied. Send it to the client.', 'success')
      } catch {
        showToast('Link made. Copy it below and send it to the client.', 'success')
      }
    } catch (e) {
      showToast(errorMessage(e, 'Could not make the link'), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function turnOff(id: string) {
    try {
      await revokeAcceptLink(id)
      await load()
      showToast('Link turned off', 'success')
    } catch (e) {
      showToast(errorMessage(e, 'Could not turn the link off'), 'error')
    }
  }

  async function importLinksCsv(file: File) {
    if (missing) return
    setImporting(true)
    try {
      const text = await file.text()
      const { headers, rows: csvRows } = parseCsv(text)
      if (!headers.length) {
        showToast('CSV has no header row', 'error')
        return
      }
      const objects = csvRowsToObjects(headers, csvRows)
      const byLabel = new Map<string, AcceptLinkRow[]>()
      for (const link of rows) {
        const key = labelKey(link.label || '')
        if (!key) continue
        const list = byLabel.get(key) || []
        list.push(link)
        byLabel.set(key, list)
      }

      const next: AcceptLinkRow[] = []
      const seen = new Set<string>()
      let matched = 0
      let softLoaded = 0
      let revoked = 0
      let skipped = 0

      for (const csvRow of objects) {
        const rowLabel = String(csvRow.label || '').trim()
        const desired = parseAcceptState(
          String(csvRow.state || ''),
          String(csvRow.revoked_at || ''),
          String(csvRow.accepted_at || ''),
        )
        if (!rowLabel && !desired) {
          skipped += 1
          continue
        }
        const key = labelKey(rowLabel || `(${desired || 'row'})`)
        if (seen.has(key + String(csvRow.created_at || ''))) {
          skipped += 1
          continue
        }
        seen.add(key + String(csvRow.created_at || ''))

        const existingList = byLabel.get(labelKey(rowLabel)) || []
        const existing =
          existingList.find((l) => !csvRow.created_at || l.created_at === String(csvRow.created_at || '').trim()) ||
          existingList[0]

        if (desired === 'revoked' && existing && acceptLinkState(existing) === 'active') {
          await revokeAcceptLink(existing.id)
          next.push({ ...existing, revoked_at: new Date().toISOString() })
          revoked += 1
          matched += 1
          continue
        }

        if (existing) {
          next.push(existing)
          matched += 1
          continue
        }

        // Cannot recreate accept links without a PDF — soft-load for display only.
        const expiresRaw = String(csvRow.expires_at || '').trim()
        next.push({
          id: `csv-${softLoaded}-${key}`,
          quotation_id: quote.id,
          label: rowLabel,
          created_by: String(csvRow.created_by || '').trim(),
          created_at: String(csvRow.created_at || '').trim() || new Date().toISOString(),
          expires_at:
            desired === 'expired'
              ? expiresRaw || new Date(Date.now() - 1000).toISOString()
              : expiresRaw || null,
          revoked_at:
            desired === 'revoked'
              ? String(csvRow.revoked_at || '').trim() || new Date().toISOString()
              : null,
          last_opened_at: String(csvRow.last_opened_at || '').trim() || null,
          accepted_at:
            desired === 'accepted'
              ? String(csvRow.accepted_at || '').trim() || new Date().toISOString()
              : null,
          accepted_name: String(csvRow.accepted_name || '').trim(),
        })
        softLoaded += 1
      }

      if (!next.length) {
        showToast('No matching accept link rows in CSV', 'error')
        return
      }

      if (revoked) await load()
      setImportedRows(next)
      setCsvFiltered(true)
      const parts = [
        matched ? `${matched} matched` : '',
        softLoaded ? `${softLoaded} soft-loaded` : '',
        revoked ? `${revoked} turned off` : '',
      ]
        .filter(Boolean)
        .join(', ')
      const skipNote = skipped ? ` · ${skipped} row(s) skipped` : ''
      showToast(`Imported ${next.length} accept link row(s) (${parts})${skipNote}`, 'success')
    } catch (e) {
      showToast(errorMessage(e, 'Accept links CSV import failed'), 'error')
    } finally {
      setImporting(false)
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

  const accepted = shown.find((r) => r.accepted_at)

  return (
    <Modal open={open} title={`Accept link for ${quote.reference_number}`} onClose={onClose} width={560}>
      {missing ? (
        <p style={{ fontSize: 14 }}>Run the "Quote accept link" SQL first (SQL copy page), then try again.</p>
      ) : (
        <>
          <p style={{ color: colors.muted, fontSize: 13, marginTop: 0 }}>
            The client opens the link, sees this quote's PDF and accepts it with their name and the date. The quote
            then shows Accepted. The AI CRM deal with this quote moves to Signed with a draft contract. Nothing is
            invoiced: mark the quote Awarded and activate the contract yourself.
          </p>

          {accepted ? (
            <div style={{ borderLeft: `3px solid ${colors.success}`, paddingLeft: 10, marginBottom: 12, fontSize: 14 }}>
              Accepted by <strong>{accepted.accepted_name}</strong> on {when(accepted.accepted_at)}.
              {acceptances.map((a) => (
                <div key={a.id} style={{ color: colors.muted, fontSize: 13 }}>
                  Signed for {a.accepted_date}, from address {a.ip || 'unknown'}.
                  {a.contract_id ? ' A draft contract was made.' : ''}
                  {a.crm_id ? ' The CRM lead moved to Won.' : ''}
                </div>
              ))}
            </div>
          ) : null}

          {canHaveAcceptLink(quote) ? (
            <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
              <label style={labelStyle} htmlFor="accept-label">
                Who it is for (optional)
              </label>
              <input id="accept-label" style={inputStyle} value={label} onChange={(e) => setLabel(e.target.value)} />
              <button type="button" style={buttonPrimaryStyle} disabled={busy} onClick={() => void create()}>
                {busy ? 'Making the PDF…' : 'Make a new link'}
              </button>
              {newLink ? (
                <input style={inputStyle} readOnly value={newLink} onFocus={(e) => e.currentTarget.select()} aria-label="New link" />
              ) : null}
            </div>
          ) : !accepted ? (
            <p style={{ fontSize: 14 }}>Finalise the quote before making a link.</p>
          ) : null}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            <input
              ref={importInputRef}
              type="file"
              accept=".csv,text/csv"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void importLinksCsv(file)
              }}
            />
            <button
              type="button"
              style={buttonSecondaryStyle}
              disabled={importing}
              onClick={() => importInputRef.current?.click()}
            >
              {importing ? 'Importing…' : 'Import CSV'}
            </button>
            {shown.length ? (
              <button
                type="button"
                style={buttonSecondaryStyle}
                onClick={() => {
                  exportListCsv(
                    `quote-accept-links-${quote.reference_number}.csv`,
                    [...EXPORT_COLUMNS],
                    shown.map((r) => ({
                      state: ACCEPT_STATE_LABELS[acceptLinkState(r)],
                      label: r.label,
                      created_by: r.created_by,
                      created_at: r.created_at,
                      expires_at: r.expires_at || '',
                      revoked_at: r.revoked_at || '',
                      last_opened_at: r.last_opened_at || '',
                      accepted_at: r.accepted_at || '',
                      accepted_name: r.accepted_name || '',
                    })),
                  )
                  showToast('Accept links CSV downloaded', 'success')
                }}
              >
                Export CSV
              </button>
            ) : null}
            {csvFiltered ? (
              <button
                type="button"
                style={buttonSecondaryStyle}
                onClick={() => {
                  setCsvFiltered(false)
                  setImportedRows(null)
                }}
              >
                Clear CSV filter
              </button>
            ) : null}
          </div>

          {csvFiltered ? (
            <p style={{ color: colors.muted, fontSize: 13, margin: '0 0 8px', lineHeight: 1.45 }}>
              Showing {shown.length} accept link{shown.length === 1 ? '' : 's'} from CSV (session only — Clear CSV
              filter resets). Soft-loaded rows cannot turn off until matched to a live link.
            </p>
          ) : null}

          {shown.length ? (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
              {shown.map((r) => {
                const state = acceptLinkState(r)
                const soft = String(r.id).startsWith('csv-')
                return (
                  <li key={r.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13, alignItems: 'center' }}>
                    <span>
                      <strong>{ACCEPT_STATE_LABELS[state]}</strong>
                      {r.label ? `, ${r.label}` : ''}
                      {soft ? ' (CSV)' : ''}, made {when(r.created_at)}
                      {state === 'active' && r.expires_at ? `, works until ${when(r.expires_at)}` : ''}
                      {r.last_opened_at ? `, last opened ${when(r.last_opened_at)}` : soft ? '' : ', not opened yet'}
                    </span>
                    {state === 'active' && !soft ? (
                      <button type="button" style={buttonSecondaryStyle} onClick={() => void turnOff(r.id)}>
                        Turn off
                      </button>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          ) : null}
        </>
      )}
    </Modal>
  )
}
