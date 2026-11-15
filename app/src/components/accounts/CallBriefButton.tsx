import { useRef, useState, type CSSProperties } from 'react'
import { PhoneCall, Sparkles } from 'lucide-react'
import Modal from '../Modal'
import { useToast } from '../../contexts/ToastContext'
import { addActivity } from '../../lib/accountsStore'
import { runAi } from '../../lib/aiAssistStore'
import { briefFacts, briefNote, type Brief } from '../../lib/callBrief'
import { loadBrief } from '../../lib/callBriefStore'
import { errorMessage } from '../../lib/errors'
import { csvRowsToObjects, exportListCsv, parseCsv } from '../../lib/listIo'
import { formatAED } from '../../lib/money'
import type { Account } from '../../lib/types'
import { buttonPrimaryStyle, buttonSecondaryStyle, colors } from '../../lib/uiStyles'

const h3: CSSProperties = { fontSize: 13, margin: '14px 0 4px', color: colors.muted, fontWeight: 600 }
const line: CSSProperties = { fontSize: 13, margin: '2px 0', lineHeight: 1.5 }
const muted: CSSProperties = { ...line, color: colors.muted }

const EXPORT_COLUMNS = ['section', 'detail'] as const

type BriefCsvRow = { section: string; detail: string }

const SECTION_ORDER = ['last_contact', 'ticket', 'invoice', 'deal', 'overdue', 'question'] as const
const SECTION_LABEL: Record<(typeof SECTION_ORDER)[number], string> = {
  last_contact: 'Last contact',
  ticket: 'Open tickets',
  invoice: 'Open invoices',
  deal: 'Deal status',
  overdue: 'Overdue',
  question: 'Three questions to ask',
}

function briefCsvRows(brief: Brief, questions: string[]): BriefCsvRow[] {
  const rows: BriefCsvRow[] = []
  if (brief.lastContact) {
    rows.push({
      section: 'last_contact',
      detail: `${brief.lastContact.kind}, ${brief.lastContact.when}, ${brief.lastContact.by || ''}: ${brief.lastContact.summary}`,
    })
  }
  for (const t of brief.openTickets) {
    rows.push({
      section: 'ticket',
      detail: `${t.subject}: ${t.status}, opened ${t.opened}${t.late ? ', reply overdue' : ''}`,
    })
  }
  for (const i of brief.openInvoices) {
    rows.push({
      section: 'invoice',
      detail: `${i.reference}: ${i.balance}${i.due ? `, due ${i.due}` : ''}${i.daysLate ? `, ${i.daysLate} days late` : ''}`,
    })
  }
  for (const d of brief.deals) {
    rows.push({
      section: 'deal',
      detail: `${d.pipeline}: ${d.stage}${d.nextAction ? `. Next: ${d.nextAction}` : ''}${d.nextDate ? ` (${d.nextDate})` : ''}`,
    })
  }
  for (const o of brief.overdue) {
    rows.push({ section: 'overdue', detail: o })
  }
  for (const q of questions) {
    rows.push({ section: 'question', detail: q })
  }
  return rows
}

function normaliseSection(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, '_')
}

/**
 * Before the call: the last contact, open tickets and invoices, deal status
 * and what is overdue on one screen, with three questions from AI help.
 * Reading it changes nothing; Save as a note puts it on the timeline only
 * when the person chooses to.
 */
export default function CallBriefButton({
  account,
  accountKind,
  editable,
  author,
  onSaved,
}: {
  account: Account
  accountKind: string
  editable: boolean
  author: { appUserId: string | null; email: string }
  onSaved: () => void
}) {
  const { showToast } = useToast()
  const [open, setOpen] = useState(false)
  const [brief, setBrief] = useState<Brief | null>(null)
  const [questions, setQuestions] = useState<string[]>([])
  const [aiBusy, setAiBusy] = useState(false)
  const [aiNote, setAiNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const [csvFiltered, setCsvFiltered] = useState(false)
  const [importedRows, setImportedRows] = useState<BriefCsvRow[] | null>(null)
  const importInputRef = useRef<HTMLInputElement>(null)

  async function ask(b: Brief) {
    setAiBusy(true)
    setAiNote('')
    try {
      const r = await runAi(account.id, { feature: 'call_brief', accountName: account.name, accountKind, facts: briefFacts(b) })
      setQuestions(r.questions)
      if (r.costUsd) setAiNote(`AI cost $${r.costUsd.toFixed(4)}, logged on this account.`)
    } catch (e) {
      setAiNote(errorMessage(e, 'AI help is not available right now.'))
    } finally {
      setAiBusy(false)
    }
  }

  async function show() {
    setOpen(true)
    setBrief(null)
    setQuestions([])
    setAiNote('')
    setCsvFiltered(false)
    setImportedRows(null)
    try {
      const b = await loadBrief(account.id)
      setBrief(b)
      if (editable) void ask(b)
    } catch (e) {
      showToast(errorMessage(e, 'Could not build the brief'), 'error')
      setOpen(false)
    }
  }

  async function save() {
    if (!brief) return
    setSaving(true)
    try {
      await addActivity(account.id, 'note', briefNote(brief, questions), author)
      showToast('Brief saved on the timeline', 'success')
      onSaved()
      setOpen(false)
    } catch (e) {
      showToast(errorMessage(e, 'Could not save the brief'), 'error')
    } finally {
      setSaving(false)
    }
  }

  async function importBriefCsv(file: File) {
    setImporting(true)
    try {
      const text = await file.text()
      const { headers, rows: csvRows } = parseCsv(text)
      if (!headers.length) {
        showToast('CSV has no header row', 'error')
        return
      }
      const headerKeys = headers.map((h) => h.trim().toLowerCase())
      const sectionIdx = headerKeys.indexOf('section')
      const detailIdx = headerKeys.indexOf('detail')
      if (sectionIdx < 0 || detailIdx < 0) {
        showToast('CSV needs section and detail columns', 'error')
        return
      }
      const objects = csvRowsToObjects(headers, csvRows)
      const sectionKey = headers[sectionIdx]
      const detailKey = headers[detailIdx]
      const next: BriefCsvRow[] = []
      const importedQuestions: string[] = []
      let skipped = 0

      for (const row of objects) {
        const sectionNorm = normaliseSection(String(row[sectionKey] ?? row.section ?? ''))
        const detailRaw = String(row[detailKey] ?? row.detail ?? '').trim()
        if (!sectionNorm || !detailRaw) {
          skipped += 1
          continue
        }
        next.push({ section: sectionNorm, detail: detailRaw })
        if (sectionNorm === 'question') importedQuestions.push(detailRaw)
      }

      if (!next.length) {
        showToast('No call-brief rows in CSV', 'error')
        return
      }

      setImportedRows(next)
      setCsvFiltered(true)
      if (importedQuestions.length) {
        setQuestions(importedQuestions)
        setAiNote('Questions loaded from CSV (session only until you save as a note).')
      }
      const skipNote = skipped ? ` · ${skipped} row(s) skipped` : ''
      const qNote = importedQuestions.length ? ` · ${importedQuestions.length} question(s)` : ''
      showToast(`Imported ${next.length} call-brief row(s)${qNote}${skipNote}`, 'success')
    } catch (e) {
      showToast(errorMessage(e, 'Call brief CSV import failed'), 'error')
    } finally {
      setImporting(false)
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

  function clearCsvFilter() {
    setCsvFiltered(false)
    setImportedRows(null)
  }

  const exportRows = brief ? briefCsvRows(brief, questions) : []
  const shownRows = csvFiltered && importedRows ? importedRows : exportRows

  return (
    <>
      <button type="button" style={buttonSecondaryStyle} onClick={() => void show()}>
        <PhoneCall size={14} /> Before the call
      </button>
      <Modal open={open} title={`Before the call: ${account.name}`} onClose={() => setOpen(false)}>
        {!brief ? (
          <p style={muted}>Gathering the brief…</p>
        ) : (
          <div>
            {csvFiltered ? (
              <p style={{ ...muted, marginTop: 0 }}>
                Showing {shownRows.length} row{shownRows.length === 1 ? '' : 's'} from CSV (session only — Clear CSV
                filter resets). Live account facts stay unchanged until you save as a note.
              </p>
            ) : null}

            {csvFiltered && importedRows ? (
              <>
                {SECTION_ORDER.map((section) => {
                  const rows = importedRows.filter((r) => r.section === section)
                  if (!rows.length) return null
                  return (
                    <div key={section}>
                      <h3 style={{ ...h3, ...(section === 'last_contact' ? { marginTop: 0 } : {}) }}>
                        {SECTION_LABEL[section]}
                        {section !== 'last_contact' && section !== 'question' && section !== 'overdue'
                          ? ` (${rows.length})`
                          : ''}
                      </h3>
                      {section === 'question' ? (
                        <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.6 }}>
                          {rows.map((r) => (
                            <li key={`${r.section}-${r.detail}`}>{r.detail}</li>
                          ))}
                        </ol>
                      ) : (
                        rows.map((r) => (
                          <p
                            key={`${r.section}-${r.detail}`}
                            style={{
                              ...line,
                              color: section === 'overdue' ? colors.warn : colors.text,
                            }}
                          >
                            {r.detail}
                          </p>
                        ))
                      )}
                    </div>
                  )
                })}
                {importedRows.some((r) => !SECTION_ORDER.includes(r.section as (typeof SECTION_ORDER)[number])) ? (
                  <>
                    <h3 style={h3}>Other</h3>
                    {importedRows
                      .filter((r) => !SECTION_ORDER.includes(r.section as (typeof SECTION_ORDER)[number]))
                      .map((r) => (
                        <p key={`${r.section}-${r.detail}`} style={line}>
                          [{r.section}] {r.detail}
                        </p>
                      ))}
                  </>
                ) : null}
              </>
            ) : (
              <>
                <h3 style={{ ...h3, marginTop: 0 }}>Last contact</h3>
                {brief.lastContact ? (
                  <>
                    <p style={line}>
                      {brief.lastContact.kind}, {brief.lastContact.when} (
                      {brief.lastContact.daysAgo === 0 ? 'today' : `${brief.lastContact.daysAgo} days ago`}) by{' '}
                      {brief.lastContact.by || 'someone'}
                    </p>
                    <p style={muted}>{brief.lastContact.summary}</p>
                  </>
                ) : (
                  <p style={muted}>Nothing logged yet.</p>
                )}

                <h3 style={h3}>Open tickets ({brief.openTickets.length})</h3>
                {brief.openTickets.length ? (
                  brief.openTickets.map((t, i) => (
                    <p key={`${t.subject}-${i}`} style={{ ...line, color: t.late ? colors.warn : colors.text }}>
                      {t.subject}: {t.status}, opened {t.opened}
                      {t.late ? ', reply overdue' : ''}
                    </p>
                  ))
                ) : (
                  <p style={muted}>None.</p>
                )}

                <h3 style={h3}>Open invoices{brief.openInvoices.length ? `, ${formatAED(brief.owed)} owed` : ''}</h3>
                {brief.openInvoices.length ? (
                  brief.openInvoices.map((i) => (
                    <p key={i.reference} style={{ ...line, color: i.daysLate ? colors.warn : colors.text }}>
                      {i.reference}: {formatAED(i.balance)}
                      {i.due ? `, due ${i.due}` : ''}
                      {i.daysLate ? `, ${i.daysLate} days late` : ''}
                    </p>
                  ))
                ) : (
                  <p style={muted}>None you can see.</p>
                )}

                <h3 style={h3}>Deal status</h3>
                {brief.deals.length ? (
                  brief.deals.map((d, i) => (
                    <p key={`${d.pipeline}-${i}`} style={{ ...line, color: d.late ? colors.warn : colors.text }}>
                      {d.pipeline}: {d.stage}
                      {d.nextAction ? `. Next: ${d.nextAction}` : ''}
                      {d.nextDate ? ` (${d.nextDate})` : ''}
                    </p>
                  ))
                ) : (
                  <p style={muted}>No open deal.</p>
                )}

                <h3 style={h3}>Overdue</h3>
                {brief.overdue.length ? (
                  brief.overdue.map((o) => (
                    <p key={o} style={{ ...line, color: colors.warn }}>
                      {o}
                    </p>
                  ))
                ) : (
                  <p style={muted}>Nothing overdue.</p>
                )}

                <h3 style={h3}>Three questions to ask</h3>
                {!editable ? (
                  <p style={muted}>Suggested questions need edit rights on this account.</p>
                ) : aiBusy ? (
                  <p style={muted}>Thinking of questions…</p>
                ) : questions.length ? (
                  <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.6 }}>
                    {questions.map((q) => (
                      <li key={q}>{q}</li>
                    ))}
                  </ol>
                ) : null}
                {aiNote ? <p style={{ ...muted, fontSize: 12 }}>{aiNote}</p> : null}
                <p style={{ ...muted, fontSize: 12, marginTop: 8 }}>
                  Suggested by AI from the facts above. Check them before you use them.
                </p>
              </>
            )}

            {csvFiltered && aiNote ? <p style={{ ...muted, fontSize: 12, marginTop: 8 }}>{aiNote}</p> : null}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
              <input
                ref={importInputRef}
                type="file"
                accept=".csv,text/csv"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void importBriefCsv(file)
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
              <button
                type="button"
                style={buttonSecondaryStyle}
                onClick={() => {
                  exportListCsv(
                    `call-brief-${account.reference || account.id}.csv`,
                    [...EXPORT_COLUMNS],
                    shownRows,
                  )
                  showToast('Call brief CSV downloaded', 'success')
                }}
              >
                Export CSV
              </button>
              {csvFiltered ? (
                <button type="button" style={buttonSecondaryStyle} onClick={clearCsvFilter}>
                  Clear CSV filter
                </button>
              ) : null}
              {editable ? (
                <>
                  <button
                    type="button"
                    style={buttonSecondaryStyle}
                    disabled={aiBusy}
                    onClick={() => {
                      clearCsvFilter()
                      void ask(brief)
                    }}
                  >
                    <Sparkles size={14} /> Other questions
                  </button>
                  <button type="button" style={buttonPrimaryStyle} disabled={saving || aiBusy} onClick={() => void save()}>
                    {saving ? 'Saving…' : 'Save as a note'}
                  </button>
                </>
              ) : null}
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}
