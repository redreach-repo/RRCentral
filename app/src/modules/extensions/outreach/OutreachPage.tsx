import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../../contexts/AuthContext'
import { useToast } from '../../../contexts/ToastContext'
import { isSupabaseConfigured } from '../../../lib/supabaseConfig'
import { readXlsxRows, writeXlsxRows } from '../../../lib/xlsxSheet'
import {
  RESULT_LABEL,
  REVIEW_FILTERS,
  REVIEW_FILTER_LABEL,
  SHEET_COLUMNS,
  STATUS_LABEL,
  allowedActions,
  blocklistRows,
  filterStatuses,
  footerPreview,
  parseCsvCells,
  safeHttpUrl,
  sheetToRows,
  statusTone,
  type ImportBatch,
  type ImportResult,
  type ImportRow,
  type OutreachMessage,
  type OutreachSender,
  type OutreachSettings,
  type ReviewFilter,
  type SheetRow,
} from '../../../lib/outreach/outreach'
import {
  blocklistCounts,
  commitImport,
  companyAddressFromSettings,
  decideOutreach,
  editOutreach,
  getOutreachSettings,
  listImportRows,
  listOutreachMessages,
  loadBlocklist,
  myOutreachSender,
  outreachToday,
  releaseStuckSend,
  saveOutreachSender,
  saveOutreachSettings,
  sendOutreach,
  stageImport,
  suppressAddress,
} from '../../../lib/outreach/outreachStore'
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
} from '../../../lib/uiStyles'
import SetupNotice from '../_shared/SetupNotice'

const DOC = 'docs/modules/outreach.md'
type Tab = 'review' | 'import' | 'settings'

const row: CSSProperties = { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }
const toneColor = { good: colors.success, warn: colors.warn, bad: colors.danger, neutral: colors.muted } as const
const resultColor: Record<ImportResult, string> = {
  new: colors.success,
  needs_enrichment: colors.warn,
  duplicate: colors.muted,
  blocked: colors.danger,
  error: colors.danger,
}

function Pill({ text, color }: { text: string; color: string }) {
  return (
    <span style={{ fontSize: 12, fontWeight: 600, color, border: `1px solid ${color}`, borderRadius: 999, padding: '1px 8px', whiteSpace: 'nowrap' }}>
      {text}
    </span>
  )
}

async function readCells(file: File): Promise<string[][]> {
  const name = file.name.toLowerCase()
  if (name.endsWith('.xlsx')) return readXlsxRows(new Uint8Array(await file.arrayBuffer()))
  if (name.endsWith('.csv') || name.endsWith('.txt')) return parseCsvCells(await file.text())
  throw new Error('Upload an .xlsx or .csv file')
}

function downloadTemplate() {
  const bytes = writeXlsxRows([SHEET_COLUMNS.map((c) => c.header)], 'Prospects')
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const a = document.createElement('a')
  a.href = url
  a.download = 'outreach-prospects-template.xlsx'
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function OutreachPage() {
  const { appUserId } = useAuth()
  const localMode = !isSupabaseConfigured()
  const [tab, setTab] = useState<Tab>('review')
  const [missing, setMissing] = useState(false)
  const [settings, setSettings] = useState<OutreachSettings | null>(null)
  const [sender, setSender] = useState<OutreachSender | null>(null)
  const [today, setToday] = useState<{ sent_today: number; daily_cap: number } | null>(null)

  const loadBasics = useCallback(async () => {
    if (localMode) return
    const [s, t] = await Promise.all([getOutreachSettings(), outreachToday()])
    setSettings(s)
    setToday(t)
    try {
      setSender(await myOutreachSender())
    } catch {
      setSender(null)
    }
  }, [localMode])

  useEffect(() => {
    void loadBasics()
  }, [loadBasics])

  return (
    <div style={pageStyle}>
      <h1 style={pageTitleStyle}>Prospect outreach</h1>
      <p style={pageSubtitleStyle}>
        Import CTRM Next prospects, review each email, approve it, then send it yourself from your own mailbox, one at a time.
        {today ? ` Sent today: ${today.sent_today} of ${today.daily_cap}.` : ''}
      </p>
      <SetupNotice localMode={localMode} missingTable={missing} doc={DOC} />
      {!localMode && !missing && (
        <>
          <div role="tablist" aria-label="Outreach" style={{ ...row, margin: '12px 0 16px' }}>
            {(['review', 'import', 'settings'] as Tab[]).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                style={tab === t ? buttonPrimaryStyle : buttonSecondaryStyle}
              >
                {t === 'review' ? 'Review and send' : t === 'import' ? 'Import prospects' : 'Settings'}
              </button>
            ))}
          </div>
          {tab === 'review' && (
            <ReviewPanel
              myUserId={appUserId}
              settings={settings}
              sender={sender}
              onMissing={() => setMissing(true)}
              onSent={() => void loadBasics()}
            />
          )}
          {tab === 'import' && <ImportPanel onImported={() => setTab('review')} />}
          {tab === 'settings' && <SettingsPanel key={`${settings?.id || ''}-${sender?.id || ''}`} settings={settings} sender={sender} onSaved={() => void loadBasics()} />}
        </>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Review                                                              */
/* ------------------------------------------------------------------ */

function ReviewPanel({
  myUserId,
  settings,
  sender,
  onMissing,
  onSent,
}: {
  myUserId: string | null
  settings: OutreachSettings | null
  sender: OutreachSender | null
  onMissing: () => void
  onSent: () => void
}) {
  const { showToast } = useToast()
  const [filter, setFilter] = useState<ReviewFilter>('to_review')
  const [rows, setRows] = useState<OutreachMessage[]>([])
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [q, setQ] = useState('')

  const load = useCallback(async () => {
    const r = await listOutreachMessages(filterStatuses(filter))
    if (r.missing) onMissing()
    setRows(r.rows)
    setError(r.missing ? '' : r.error)
    setSelectedId((id) => (r.rows.some((m) => m.id === id) ? id : r.rows[0]?.id || ''))
  }, [filter, onMissing])

  useEffect(() => {
    void load()
  }, [load])

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return rows
    return rows.filter((m) => [m.company, m.to_name, m.to_email, m.subject].some((v) => v.toLowerCase().includes(needle)))
  }, [rows, q])
  const selected = shown.find((m) => m.id === selectedId) || null

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 16, alignItems: 'start' }}>
      <section style={cardStyle} aria-label="Outreach emails">
        <div style={{ ...row, marginBottom: 10 }}>
          <label style={{ ...labelStyle, margin: 0 }} htmlFor="outreach-filter">
            Show
          </label>
          <select id="outreach-filter" style={{ ...selectStyle, width: 'auto' }} value={filter} onChange={(e) => setFilter(e.target.value as ReviewFilter)}>
            {REVIEW_FILTERS.map((f) => (
              <option key={f} value={f}>
                {REVIEW_FILTER_LABEL[f]}
              </option>
            ))}
          </select>
          <input aria-label="Search" placeholder="Search company, person, subject" style={{ ...inputStyle, flex: '1 1 160px', width: 'auto' }} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {error && <p style={{ color: colors.danger }}>{error}</p>}
        {!shown.length && !error && <p style={{ color: colors.muted }}>Nothing here. Import a sheet of prospects to start.</p>}
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
          {shown.map((m) => (
            <li key={m.id}>
              <button
                onClick={() => setSelectedId(m.id)}
                aria-current={m.id === selectedId}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  background: m.id === selectedId ? 'var(--surface-2, var(--bg))' : 'transparent',
                  border: `1px solid ${m.id === selectedId ? colors.accent : colors.border}`,
                  borderRadius: 8,
                  padding: '8px 10px',
                  color: colors.text,
                  cursor: 'pointer',
                  display: 'grid',
                  gap: 2,
                }}
              >
                <span style={{ ...row, justifyContent: 'space-between' }}>
                  <strong>{m.company}</strong>
                  <Pill text={STATUS_LABEL[m.status]} color={toneColor[statusTone(m.status)]} />
                </span>
                <span style={{ fontSize: 13, color: colors.muted }}>
                  {m.to_name || 'No name'} · {m.to_email || 'no email'}
                  {m.needs_enrichment ? ' · needs enrichment' : ''}
                </span>
                <span style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.subject || '(no subject)'}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
      {selected ? (
        <MessageDetail
          key={selected.id + selected.updated_at}
          m={selected}
          myUserId={myUserId}
          settings={settings}
          sender={sender}
          onChanged={async (msg) => {
            if (msg) showToast(msg)
            await load()
          }}
          onSent={onSent}
        />
      ) : (
        <section style={cardStyle}>
          <p style={{ color: colors.muted, margin: 0 }}>Pick an email to review it.</p>
        </section>
      )}
    </div>
  )
}

function MessageDetail({
  m,
  myUserId,
  settings,
  sender,
  onChanged,
  onSent,
}: {
  m: OutreachMessage
  myUserId: string | null
  settings: OutreachSettings | null
  sender: OutreachSender | null
  onChanged: (toast?: string) => Promise<void>
  onSent: () => void
}) {
  const [toEmail, setToEmail] = useState(m.to_email)
  const [subject, setSubject] = useState(m.subject)
  const [body, setBody] = useState(m.body)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const dirty = toEmail.trim().toLowerCase() !== m.to_email || subject !== m.subject || body !== m.body
  const can = allowedActions(m, myUserId)
  const signal = safeHttpUrl(m.signal_url)
  const footer = footerPreview(sender?.signature || '', settings)
  const stuck = m.status === 'sending' && m.updated_at && Date.now() - new Date(m.updated_at).getTime() > 10 * 60_000

  async function run(label: string, fn: () => Promise<unknown>, toast: string) {
    setBusy(label)
    setErr('')
    try {
      await fn()
      await onChanged(toast)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy('')
    }
  }

  return (
    <section style={{ ...cardStyle, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 12, minWidth: 0 }} aria-label="Email detail">
      <div style={{ ...row, justifyContent: 'space-between' }}>
        <h2 style={{ ...sectionTitleStyle, margin: 0 }}>{m.company}</h2>
        <Pill text={STATUS_LABEL[m.status]} color={toneColor[statusTone(m.status)]} />
      </div>
      <div style={{ fontSize: 13, color: colors.muted, display: 'grid', gap: 2 }}>
        <span>
          {m.to_name || 'No contact name'}
          {m.country ? ` · ${m.country}` : ''}
          {m.account_id && (
            <>
              {' · '}
              <Link to={`/accounts/${m.account_id}`}>Open the account</Link>
            </>
          )}
        </span>
        <span>
          Signal: {m.signal_used || 'none given'}
          {signal && (
            <>
              {' · '}
              <a href={signal} target="_blank" rel="noopener noreferrer">
                Open the signal
              </a>
            </>
          )}
        </span>
        {m.checks_note && <span>Checks before sending: {m.checks_note}</span>}
        <span>Source: {m.data_source || 'not recorded'}</span>
      </div>
      {m.needs_enrichment && (
        <p role="status" style={{ margin: 0, color: colors.warn }}>
          Needs enrichment: add a named person&apos;s email address before approving.
        </p>
      )}
      {m.blocked_reason && (m.status === 'approved' || m.status === 'ready') && (
        <p role="status" style={{ margin: 0, color: colors.warn }}>
          Approved but blocked: {m.blocked_reason}
        </p>
      )}
      {m.last_error && <p style={{ margin: 0, color: colors.danger }}>Last try: {m.last_error}</p>}

      <div style={fieldStyle}>
        <label style={labelStyle} htmlFor="o-to">
          To
        </label>
        <input id="o-to" style={inputStyle} value={toEmail} disabled={!can.edit} onChange={(e) => setToEmail(e.target.value)} />
      </div>
      <div style={fieldStyle}>
        <label style={labelStyle} htmlFor="o-subject">
          Subject
        </label>
        <input id="o-subject" style={inputStyle} value={subject} disabled={!can.edit} onChange={(e) => setSubject(e.target.value)} />
      </div>
      <div style={fieldStyle}>
        <label style={labelStyle} htmlFor="o-body">
          Body
        </label>
        <textarea id="o-body" style={{ ...inputStyle, minHeight: 200, fontFamily: 'inherit', resize: 'vertical' }} value={body} disabled={!can.edit} onChange={(e) => setBody(e.target.value)} />
      </div>
      <details>
        <summary style={{ cursor: 'pointer', fontSize: 13 }}>Added under every email (signature, address, opt-out)</summary>
        <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 13, color: colors.muted, margin: '8px 0 0' }}>{footer.text}</pre>
        {footer.missing.length > 0 && <p style={{ color: colors.danger, fontSize: 13 }}>Missing: {footer.missing.join(', ')} (Settings tab).</p>}
      </details>

      {err && (
        <p role="alert" style={{ margin: 0, color: colors.danger }}>
          {err}
        </p>
      )}
      {dirty && (
        <p style={{ margin: 0, fontSize: 13, color: colors.muted }}>
          Saving a change sends the email back to awaiting approval.
        </p>
      )}
      <div style={row}>
        {can.edit && (
          <button style={buttonSecondaryStyle} disabled={!dirty || Boolean(busy)} onClick={() => void run('save', () => editOutreach(m.id, toEmail, subject, body), 'Saved. Approve it again before sending.')}>
            {busy === 'save' ? 'Saving…' : 'Save changes'}
          </button>
        )}
        {can.approve && (
          <button style={buttonPrimaryStyle} disabled={dirty || Boolean(busy)} title={dirty ? 'Save your changes first' : ''} onClick={() => void run('approve', () => decideOutreach(m.id, 'approve'), 'Approved')}>
            {busy === 'approve' ? 'Approving…' : 'Approve'}
          </button>
        )}
        {can.send && (
          <button
            style={buttonPrimaryStyle}
            disabled={dirty || Boolean(busy)}
            onClick={() =>
              void run(
                'send',
                async () => {
                  const r = await sendOutreach(m.id)
                  onSent()
                  if (!r.recorded) throw new Error('Sent, but the send was not recorded. Check the email in your Sent folder.')
                },
                `Sent to ${m.to_email}`,
              )
            }
          >
            {busy === 'send' ? 'Sending…' : `Send from ${sender?.email || 'my mailbox'}`}
          </button>
        )}
        {can.approvedByOther && <span style={{ fontSize: 13, color: colors.muted }}>Approved by someone else: only they can send it.</span>}
        {stuck && (
          <button style={buttonSecondaryStyle} disabled={Boolean(busy)} onClick={() => void run('release', () => releaseStuckSend(m.id), 'Released. Check your Zoho Sent folder before sending again.')}>
            Release stuck send
          </button>
        )}
      </div>
      {(can.reject || can.pass || can.reopen) && (
        <div style={row}>
          {(can.reject || can.pass) && (
            <input aria-label="Reason (optional)" placeholder="Reason (optional)" style={{ ...inputStyle, flex: '1 1 160px', width: 'auto' }} value={reason} onChange={(e) => setReason(e.target.value)} />
          )}
          {can.pass && (
            <button style={buttonSecondaryStyle} disabled={Boolean(busy)} onClick={() => void run('pass', () => decideOutreach(m.id, 'pass', reason), 'Passed for now')}>
              Pass
            </button>
          )}
          {can.reject && (
            <button style={buttonDangerStyle} disabled={Boolean(busy)} onClick={() => void run('reject', () => decideOutreach(m.id, 'reject', reason), 'Rejected')}>
              Reject
            </button>
          )}
          {can.reopen && (
            <button style={buttonSecondaryStyle} disabled={Boolean(busy)} onClick={() => void run('reopen', () => decideOutreach(m.id, 'reopen'), 'Back to review')}>
              Review again
            </button>
          )}
        </div>
      )}
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Import                                                              */
/* ------------------------------------------------------------------ */

function ImportPanel({ onImported }: { onImported: () => void }) {
  const { showToast } = useToast()
  const [parsed, setParsed] = useState<{ name: string; rows: SheetRow[]; missing: string[]; ignored: string[] } | null>(null)
  const [batch, setBatch] = useState<ImportBatch | null>(null)
  const [staged, setStaged] = useState<ImportRow[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function pick(file: File | undefined) {
    if (!file) return
    setErr('')
    setBatch(null)
    setStaged([])
    try {
      const p = sheetToRows(await readCells(file))
      if (p.error) throw new Error(p.error)
      setParsed({ name: file.name, rows: p.rows, missing: p.missing, ignored: p.ignored })
    } catch (e) {
      setParsed(null)
      setErr(e instanceof Error ? e.message : String(e))
    }
  }

  async function check() {
    if (!parsed) return
    setBusy(true)
    setErr('')
    try {
      const b = await stageImport(parsed.name, parsed.rows)
      setBatch(b)
      setStaged(await listImportRows(b.id))
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function create() {
    if (!batch) return
    setBusy(true)
    setErr('')
    try {
      const n = await commitImport(batch.id)
      showToast(`${n} prospects added with draft emails`)
      onImported()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const toMake = batch ? batch.new_count + batch.enrichment_count : 0

  return (
    <section style={{ ...cardStyle, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 12, minWidth: 0 }} aria-label="Import prospects">
      <h2 style={{ ...sectionTitleStyle, margin: 0 }}>Import prospects</h2>
      <p style={{ margin: 0, color: colors.muted, fontSize: 14 }}>
        Columns: {SHEET_COLUMNS.map((c) => c.header).join(', ')}. Rows are checked first against your clients and prospects, the CompMan and
        CTRM Next lists, and the do-not-email list. Nothing is created until you press Create.
      </p>
      <div style={row}>
        <input aria-label="Prospect sheet (.xlsx or .csv)" type="file" accept=".xlsx,.csv,.txt" onChange={(e) => void pick(e.target.files?.[0])} />
        <button style={buttonSecondaryStyle} onClick={downloadTemplate}>
          Download the template
        </button>
      </div>
      {parsed && !batch && (
        <div style={{ display: 'grid', gap: 6 }}>
          <span>
            <strong>{parsed.rows.length}</strong> rows in {parsed.name}.
            {parsed.missing.length > 0 && ` Columns not found: ${parsed.missing.join(', ')}.`}
            {parsed.ignored.length > 0 && ` Ignored: ${parsed.ignored.join(', ')}.`}
          </span>
          <div>
            <button style={buttonPrimaryStyle} disabled={busy} onClick={() => void check()}>
              {busy ? 'Checking…' : 'Check for duplicates'}
            </button>
          </div>
        </div>
      )}
      {batch && (
        <>
          <div style={row} aria-label="Check results">
            <Pill text={`${batch.new_count} new`} color={colors.success} />
            <Pill text={`${batch.enrichment_count} need${batch.enrichment_count === 1 ? 's' : ''} enrichment`} color={colors.warn} />
            <Pill text={`${batch.duplicate_count} duplicate${batch.duplicate_count === 1 ? '' : 's'}`} color={colors.muted} />
            <Pill text={`${batch.blocked_count} blocked`} color={colors.danger} />
            <Pill text={`${batch.error_count} problem${batch.error_count === 1 ? '' : 's'}`} color={colors.danger} />
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  {['Row', 'Company', 'Contact', 'Email', 'Country', 'Result', 'Why'].map((h) => (
                    <th key={h} style={{ textAlign: 'left', padding: '6px 8px', borderBottom: `1px solid ${colors.border}`, color: colors.muted, fontWeight: 600 }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {staged.map((r) => (
                  <tr key={r.id}>
                    <td style={{ padding: '6px 8px' }}>{r.row_number}</td>
                    <td style={{ padding: '6px 8px' }}>{r.company}</td>
                    <td style={{ padding: '6px 8px' }}>{[r.contact_name, r.title].filter(Boolean).join(', ')}</td>
                    <td style={{ padding: '6px 8px' }}>{r.email}</td>
                    <td style={{ padding: '6px 8px' }}>{r.country}</td>
                    <td style={{ padding: '6px 8px' }}>
                      <Pill text={RESULT_LABEL[r.result]} color={resultColor[r.result]} />
                    </td>
                    <td style={{ padding: '6px 8px', color: colors.muted }}>{r.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={row}>
            <button style={buttonPrimaryStyle} disabled={busy || toMake === 0} onClick={() => void create()}>
              {busy ? 'Creating…' : `Create ${toMake} prospects with draft emails`}
            </button>
            <span style={{ fontSize: 13, color: colors.muted }}>Each gets a CTRM prospect account, a contact, a CTRM Next deal and a draft email.</span>
          </div>
        </>
      )}
      {err && (
        <p role="alert" style={{ margin: 0, color: colors.danger }}>
          {err}
        </p>
      )}
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

function SettingsPanel({ settings, sender, onSaved }: { settings: OutreachSettings | null; sender: OutreachSender | null; onSaved: () => void }) {
  const { showToast } = useToast()
  const [cap, setCap] = useState(String(settings?.daily_cap ?? 10))
  const [legal, setLegal] = useState(settings?.company_legal_name || '')
  const [address, setAddress] = useState(settings?.company_address || '')
  const [optOut, setOptOut] = useState(settings?.opt_out_text || '')
  const [name, setName] = useState(sender?.display_name || '')
  const [signature, setSignature] = useState(sender?.signature || '')
  const [counts, setCounts] = useState<{ compman: number; ctrm_next: number; suppressed: number } | null>(null)
  const [source, setSource] = useState<'compman' | 'ctrm_next'>('compman')
  const [suppress, setSuppress] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void blocklistCounts().then(setCounts).catch(() => setCounts(null))
  }, [])

  async function act(fn: () => Promise<unknown>, toast: string) {
    setBusy(true)
    setErr('')
    try {
      await fn()
      showToast(toast)
      onSaved()
      setCounts(await blocklistCounts())
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', alignItems: 'start' }}>
      <section style={{ ...cardStyle, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 10, minWidth: 0 }} aria-label="Company and limits">
        <h2 style={{ ...sectionTitleStyle, margin: 0 }}>Company line and limits</h2>
        <div style={fieldStyle}>
          <label style={labelStyle} htmlFor="o-cap">
            Emails per day (whole company)
          </label>
          <input id="o-cap" type="number" min={1} max={200} style={inputStyle} value={cap} onChange={(e) => setCap(e.target.value)} />
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle} htmlFor="o-legal">
            Company legal name
          </label>
          <input id="o-legal" style={inputStyle} value={legal} onChange={(e) => setLegal(e.target.value)} />
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle} htmlFor="o-address">
            Postal address (shown in every email)
          </label>
          <textarea id="o-address" style={{ ...inputStyle, minHeight: 70, fontFamily: 'inherit' }} value={address} onChange={(e) => setAddress(e.target.value)} />
          <button
            style={{ ...buttonSecondaryStyle, justifySelf: 'start', marginTop: 6 }}
            onClick={() =>
              void companyAddressFromSettings().then((a) => (a ? setAddress(a) : setErr('No address is saved in Settings yet. Type it here.')))
            }
          >
            Use the address from Settings
          </button>
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle} htmlFor="o-optout">
            Opt-out line (the unsubscribe link goes after it)
          </label>
          <textarea id="o-optout" style={{ ...inputStyle, minHeight: 70, fontFamily: 'inherit' }} value={optOut} onChange={(e) => setOptOut(e.target.value)} />
        </div>
        <div>
          <button
            style={buttonPrimaryStyle}
            disabled={busy}
            onClick={() =>
              void act(
                () => saveOutreachSettings({ daily_cap: Number(cap), company_legal_name: legal, company_address: address, opt_out_text: optOut }),
                'Outreach settings saved',
              )
            }
          >
            Save
          </button>
        </div>
      </section>

      <section style={{ ...cardStyle, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 10, minWidth: 0 }} aria-label="My signature">
        <h2 style={{ ...sectionTitleStyle, margin: 0 }}>My sender and signature</h2>
        <p style={{ margin: 0, fontSize: 13, color: colors.muted }}>
          Emails go from your own connected mailbox: {sender?.email || 'connect it on the Mail page'}.
        </p>
        <div style={fieldStyle}>
          <label style={labelStyle} htmlFor="o-name">
            Name
          </label>
          <input id="o-name" style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle} htmlFor="o-sig">
            Signature
          </label>
          <textarea id="o-sig" style={{ ...inputStyle, minHeight: 110, fontFamily: 'inherit' }} value={signature} onChange={(e) => setSignature(e.target.value)} />
        </div>
        <div>
          <button style={buttonPrimaryStyle} disabled={busy || !sender} onClick={() => sender && void act(() => saveOutreachSender(sender.id, name, signature), 'Signature saved')}>
            Save signature
          </button>
        </div>
      </section>

      <section style={{ ...cardStyle, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 10, minWidth: 0 }} aria-label="Lists">
        <h2 style={{ ...sectionTitleStyle, margin: 0 }}>Known companies and do not email</h2>
        <p style={{ margin: 0, fontSize: 13, color: colors.muted }}>
          CompMan: {counts?.compman ?? '…'} · CTRM Next: {counts?.ctrm_next ?? '…'} · Do not email: {counts?.suppressed ?? '…'}
        </p>
        <div style={row}>
          <select aria-label="List" style={{ ...selectStyle, width: 'auto' }} value={source} onChange={(e) => setSource(e.target.value as 'compman' | 'ctrm_next')}>
            <option value="compman">CompMan companies</option>
            <option value="ctrm_next">CTRM Next companies</option>
          </select>
          <input
            aria-label="Company list CSV"
            type="file"
            accept=".csv,.txt,.xlsx"
            style={{ maxWidth: '100%' }}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (!f) return
              void act(async () => {
                const rows = blocklistRows(await readCells(f))
                if (!rows.length) throw new Error('No Company or Domain column was found in that file.')
                await loadBlocklist(source, rows)
              }, 'List loaded')
            }}
          />
        </div>
        <div style={{ display: 'grid', gap: 8, justifyItems: 'start' }}>
          <input aria-label="Email or domain to never email" placeholder="name@company.com or company.com" style={{ ...inputStyle, width: '100%', minWidth: 0, boxSizing: 'border-box' }} value={suppress} onChange={(e) => setSuppress(e.target.value)} />
          <button style={buttonSecondaryStyle} disabled={busy || !suppress.trim()} onClick={() => void act(() => suppressAddress(suppress).then(() => setSuppress('')), 'Added to do not email')}>
            Never email
          </button>
        </div>
      </section>
      {err && (
        <p role="alert" style={{ margin: 0, color: colors.danger }}>
          {err}
        </p>
      )}
    </div>
  )
}
