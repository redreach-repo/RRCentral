import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { DraftingCompass } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import EmptyState from '../components/EmptyState'
import SavedViewsBar from '../components/SavedViewsBar'
import { errorMessage } from '../lib/errors'
import { engClaimLabel, engDocLabel } from '../lib/engFoundation'
import { ENG_FOUNDATION_CSV_COLUMNS } from '../lib/engFoundationCsv'
import {
  createEngClaim,
  createEngDocument,
  listEngClaims,
  listEngDocuments,
  restoreEngClaim,
  restoreEngDocument,
  softDeleteEngClaim,
  softDeleteEngDocument,
  type EngClaim,
  type EngDocument,
} from '../lib/engFoundationStore'
import { csvRowsToObjects, exportListCsv, parseCsv, parseListIoRows } from '../lib/listIo'
import {
  buttonPrimaryStyle,
  buttonSecondaryStyle,
  cardStyle,
  colors,
  inputStyle,
  labelStyle,
  selectStyle,
} from '../lib/uiStyles'
import docsStyles from '../styles/docsList.module.css'

/** M12a engineering pack: document register + claims stubs. */
export default function EngFoundationPage() {
  const { appUserId } = useAuth()
  const { showToast } = useToast()
  const [docs, setDocs] = useState<EngDocument[]>([])
  const [claims, setClaims] = useState<EngClaim[]>([])
  const [docNo, setDocNo] = useState('')
  const [docTitle, setDocTitle] = useState('')
  const [discipline, setDiscipline] = useState('')
  const [claimNo, setClaimNo] = useState('')
  const [claimTitle, setClaimTitle] = useState('')
  const [claimAmount, setClaimAmount] = useState('')
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)
  const [kindFilter, setKindFilter] = useState<'all' | 'document' | 'claim'>('all')
  const [showArchived, setShowArchived] = useState(false)
  const engViewFilters = useMemo(
    () => ({ kind: kindFilter, archived: showArchived ? '1' : '0' }),
    [kindFilter, showArchived],
  )

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [d, c] = await Promise.all([
        listEngDocuments({ includeDeleted: showArchived }),
        listEngClaims({ includeDeleted: showArchived }),
      ])
      setDocs(d)
      setClaims(c)
    } catch (e) {
      showToast(errorMessage(e, 'Could not load engineering register'), 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast, showArchived])

  useEffect(() => {
    void load()
  }, [load])

  async function onDoc(e: FormEvent) {
    e.preventDefault()
    try {
      await createEngDocument({ docNo, title: docTitle, discipline })
      showToast('Document logged', 'success')
      setDocNo('')
      setDocTitle('')
      setDiscipline('')
      await load()
    } catch (err) {
      showToast(errorMessage(err, 'Could not save document'), 'error')
    }
  }

  async function onClaim(e: FormEvent) {
    e.preventDefault()
    try {
      await createEngClaim({
        claimNo,
        title: claimTitle,
        amountAed: Number(claimAmount) || 0,
      })
      showToast('Claim logged', 'success')
      setClaimNo('')
      setClaimTitle('')
      setClaimAmount('')
      await load()
    } catch (err) {
      showToast(errorMessage(err, 'Could not save claim'), 'error')
    }
  }

  async function importEngCsv(file: File) {
    setImporting(true)
    try {
      const text = await file.text()
      const { headers, rows: csvRows } = parseCsv(text)
      const objects = csvRowsToObjects(headers, csvRows).map((row) => {
        const normalized: Record<string, string> = {}
        for (const c of ENG_FOUNDATION_CSV_COLUMNS) {
          normalized[c.key] = String(row[c.label] ?? row[c.key] ?? '').trim()
        }
        return normalized
      })
      const { ok, errors } = parseListIoRows(objects, ENG_FOUNDATION_CSV_COLUMNS)
      if (!ok.length && errors.length) {
        showToast(errors[0] || 'No valid engineering rows', 'error')
        return
      }
      let saved = 0
      let skipped = errors.length
      for (const row of ok) {
        const kind = row.kind.toLowerCase()
        if (kind === 'claim') {
          await createEngClaim({
            claimNo: row.number || '',
            title: row.title,
            amountAed: Number(row.amount_aed) || 0,
          })
          saved += 1
        } else if (kind === 'document' || kind === 'doc') {
          await createEngDocument({
            docNo: row.number || '',
            title: row.title,
            discipline: row.discipline || '',
          })
          saved += 1
        } else {
          skipped += 1
        }
      }
      const skipNote = skipped ? ` · ${skipped} row(s) skipped` : ''
      showToast(`Imported ${saved} engineering row(s)${skipNote}`, 'success')
      await load()
    } catch (err) {
      showToast(errorMessage(err, 'Engineering CSV import failed'), 'error')
    } finally {
      setImporting(false)
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

  return (
    <div className={docsStyles.page}>
      <header className={docsStyles.hero}>
        <div>
          <p className={docsStyles.kicker}>Engineering · M12a</p>
          <h1 className={docsStyles.title}>
            <DraftingCompass size={22} style={{ verticalAlign: 'middle', marginRight: 8 }} />
            Document register
          </h1>
          <p className={docsStyles.subtitle}>
            Starter document register and claims log for the engineering pack. Not contractual advice.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            ref={importInputRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void importEngCsv(f)
            }}
          />
          <button
            type="button"
            className={docsStyles.newBtn}
            style={{ background: 'transparent', color: 'inherit', border: '1px solid var(--border)' }}
            disabled={importing}
            onClick={() => importInputRef.current?.click()}
          >
            {importing ? 'Importing…' : 'Import CSV'}
          </button>
          <button
            type="button"
            className={docsStyles.newBtn}
            style={{ background: 'transparent', color: 'inherit', border: '1px solid var(--border)' }}
            disabled={!docs.length && !claims.length}
            onClick={() => {
              exportListCsv(
                'eng-register.csv',
                ['kind', 'number', 'title', 'discipline', 'status', 'amount_aed'],
                [
                  ...docs.map((d) => ({
                    kind: 'document',
                    number: d.doc_no,
                    title: d.title,
                    discipline: d.discipline,
                    status: d.status,
                    amount_aed: '',
                  })),
                  ...claims.map((c) => ({
                    kind: 'claim',
                    number: c.claim_no,
                    title: c.title,
                    discipline: '',
                    status: c.status,
                    amount_aed: c.amount_aed,
                  })),
                ],
              )
              showToast('Engineering CSV downloaded', 'success')
            }}
          >
            Export CSV
          </button>
          <button
            type="button"
            className={docsStyles.newBtn}
            style={{ background: 'transparent', color: 'inherit', border: '1px solid var(--border)' }}
            onClick={() => setShowArchived((v) => !v)}
          >
            {showArchived ? 'Hide archived' : 'Show archived'}
          </button>
        </div>
      </header>

      <SavedViewsBar
        moduleId="eng_foundation"
        filters={engViewFilters}
        ownerUserId={appUserId}
        canWrite
        applyDefaultOnLoad={false}
        onApply={(f) => {
          const kind = String(f.kind || 'all')
          if (kind === 'all' || kind === 'document' || kind === 'claim') setKindFilter(kind)
          setShowArchived(String(f.archived || '0') === '1')
        }}
        onToast={showToast}
        filtersEqual={(a, b) =>
          String(a.kind || 'all') === String(b.kind || 'all') &&
          String(a.archived || '0') === String(b.archived || '0')
        }
      />

      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>
          Show
          <select
            style={selectStyle}
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value as typeof kindFilter)}
          >
            <option value="all">Documents + claims</option>
            <option value="document">Documents only</option>
            <option value="claim">Claims only</option>
          </select>
        </label>
      </div>

      {loading ? (
        <p>Loading…</p>
      ) : (
        <div style={{ display: 'grid', gap: 16 }}>
          {kindFilter !== 'claim' ? (
            <form style={cardStyle} onSubmit={(e) => void onDoc(e)}>
              <h2 style={{ marginTop: 0, fontSize: 16 }}>New document</h2>
              <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 2fr 1fr' }}>
                <label style={labelStyle}>
                  Doc no
                  <input style={inputStyle} value={docNo} onChange={(e) => setDocNo(e.target.value)} />
                </label>
                <label style={labelStyle}>
                  Title
                  <input style={inputStyle} value={docTitle} onChange={(e) => setDocTitle(e.target.value)} required />
                </label>
                <label style={labelStyle}>
                  Discipline
                  <input style={inputStyle} value={discipline} onChange={(e) => setDiscipline(e.target.value)} />
                </label>
              </div>
              <button type="submit" style={{ ...buttonPrimaryStyle, marginTop: 10 }}>
                Add document
              </button>
            </form>
          ) : null}

          {kindFilter !== 'document' ? (
            <form style={cardStyle} onSubmit={(e) => void onClaim(e)}>
              <h2 style={{ marginTop: 0, fontSize: 16 }}>New claim</h2>
              <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 2fr 1fr' }}>
                <label style={labelStyle}>
                  Claim no
                  <input style={inputStyle} value={claimNo} onChange={(e) => setClaimNo(e.target.value)} />
                </label>
                <label style={labelStyle}>
                  Title
                  <input style={inputStyle} value={claimTitle} onChange={(e) => setClaimTitle(e.target.value)} required />
                </label>
                <label style={labelStyle}>
                  Amount (AED)
                  <input
                    style={inputStyle}
                    type="number"
                    min={0}
                    step="0.01"
                    value={claimAmount}
                    onChange={(e) => setClaimAmount(e.target.value)}
                  />
                </label>
              </div>
              <button type="submit" style={{ ...buttonPrimaryStyle, marginTop: 10 }}>
                Add claim
              </button>
            </form>
          ) : null}

          {kindFilter !== 'claim' ? (
            <section style={cardStyle}>
              <h2 style={{ marginTop: 0, fontSize: 16 }}>Documents</h2>
              {docs.length === 0 ? (
                <EmptyState title="No documents" subtitle="Add a register entry above." />
              ) : (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
                  {docs.map((d) => {
                    const archived = Boolean(d.deleted_at)
                    return (
                      <li
                        key={d.id}
                        style={{
                          fontSize: 13,
                          borderTop: `1px solid ${colors.border}`,
                          paddingTop: 6,
                          display: 'flex',
                          gap: 8,
                          flexWrap: 'wrap',
                          alignItems: 'center',
                        }}
                      >
                        <span>
                          {engDocLabel(d.doc_no, d.title)} · {d.status}
                          {d.discipline ? ` · ${d.discipline}` : ''} · rev {d.revision}
                          {archived ? ' · archived' : ''}
                        </span>
                        <button
                          type="button"
                          style={buttonSecondaryStyle}
                          onClick={() => {
                            if (
                              !window.confirm(
                                archived
                                  ? `Restore ${d.doc_no || d.title}?`
                                  : `Archive ${d.doc_no || d.title}?`,
                              )
                            ) {
                              return
                            }
                            void (archived
                              ? restoreEngDocument(d.id)
                              : softDeleteEngDocument(d.id))
                              .then(() => {
                                showToast(
                                  archived ? 'Document restored' : 'Document archived',
                                  'success',
                                )
                                return load()
                              })
                              .catch((err) =>
                                showToast(errorMessage(err, 'Archive failed'), 'error'),
                              )
                          }}
                        >
                          {archived ? 'Restore' : 'Archive'}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          ) : null}

          {kindFilter !== 'document' ? (
            <section style={cardStyle}>
              <h2 style={{ marginTop: 0, fontSize: 16 }}>Claims</h2>
              {claims.length === 0 ? (
                <EmptyState title="No claims" subtitle="Log a claim above." />
              ) : (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
                  {claims.map((c) => {
                    const archived = Boolean(c.deleted_at)
                    return (
                      <li
                        key={c.id}
                        style={{
                          fontSize: 13,
                          borderTop: `1px solid ${colors.border}`,
                          paddingTop: 6,
                          display: 'flex',
                          gap: 8,
                          flexWrap: 'wrap',
                          alignItems: 'center',
                        }}
                      >
                        <span>
                          {engClaimLabel(c.claim_no, c.title, c.amount_aed)} · {c.status}
                          {archived ? ' · archived' : ''}
                        </span>
                        <button
                          type="button"
                          style={buttonSecondaryStyle}
                          onClick={() => {
                            if (
                              !window.confirm(
                                archived
                                  ? `Restore ${c.claim_no || c.title}?`
                                  : `Archive ${c.claim_no || c.title}?`,
                              )
                            ) {
                              return
                            }
                            void (archived ? restoreEngClaim(c.id) : softDeleteEngClaim(c.id))
                              .then(() => {
                                showToast(
                                  archived ? 'Claim restored' : 'Claim archived',
                                  'success',
                                )
                                return load()
                              })
                              .catch((err) =>
                                showToast(errorMessage(err, 'Archive failed'), 'error'),
                              )
                          }}
                        >
                          {archived ? 'Restore' : 'Archive'}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          ) : null}
        </div>
      )}
    </div>
  )
}
