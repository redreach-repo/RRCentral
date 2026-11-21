import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Phone } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useI18n } from '../contexts/I18nContext'
import { useToast } from '../contexts/ToastContext'
import { errorMessage } from '../lib/errors'
import {
  CALL_OUTCOMES,
  QUICK_LEAD_PIPELINES,
  QUICK_MIN_DIGITS,
  cleanPhoneInput,
  quickCallBody,
  quickMatches,
  type CallOutcome,
  type QuickLeadPipeline,
  type QuickMatch,
} from '../lib/quickAdd'
import { loadQuickData, logQuickCall, saveQuickLead, type QuickData } from '../lib/quickAddStore'
import { parseQuickLeadForm } from '../lib/schemas/quickLead'
import { csvRowsToObjects, exportListCsv, parseCsv } from '../lib/listIo'
import { buttonPrimaryStyle, buttonSecondaryStyle, cardStyle, colors, inputStyle, labelStyle, pageStyle, pageTitleStyle, selectStyle } from '../lib/uiStyles'

const big: CSSProperties = { ...inputStyle, fontSize: 22, padding: '12px 14px', letterSpacing: 1 }
const chip = (on: boolean): CSSProperties => ({
  ...buttonSecondaryStyle,
  padding: '8px 12px',
  fontSize: 13,
  borderColor: on ? colors.accent : colors.border,
  color: on ? colors.text : colors.muted,
})

const SOURCES = ['Phone call', 'Referral', 'Walk in', 'Event', 'WhatsApp', 'Website', 'Other']

const QUICK_ADD_CSV_COLUMNS = [
  'kind',
  'phone',
  'name',
  'company',
  'email',
  'source',
  'pipeline',
  'note',
  'outcome',
  'account_or_company',
  'account_type_or_stage',
  'id',
] as const

function resolvePipeline(raw: string, fallback: QuickLeadPipeline): QuickLeadPipeline {
  const v = raw.trim().toLowerCase()
  if (!v) return fallback
  const byValue = QUICK_LEAD_PIPELINES.find((p) => p.value === v || p.value.toLowerCase() === v)
  if (byValue) return byValue.value
  const byLabel = QUICK_LEAD_PIPELINES.find((p) => p.label.toLowerCase() === v)
  return byLabel?.value ?? fallback
}

function resolveOutcome(raw: string, fallback: CallOutcome): CallOutcome {
  const v = raw.trim()
  if (!v) return fallback
  const hit = CALL_OUTCOMES.find((o) => o.toLowerCase() === v.toLowerCase())
  return hit ?? fallback
}

function resolveSource(raw: string, fallback: string): string {
  const v = raw.trim()
  if (!v) return fallback
  const hit = SOURCES.find((s) => s.toLowerCase() === v.toLowerCase())
  return hit ?? v
}

/**
 * Quick add: phone first. Type the number; a known contact or CRM lead shows
 * up and one tap logs the call. A new number becomes a lead with just a name.
 */
export default function QuickAddPage() {
  const { t } = useI18n()
  const { user, appUserId, userRole } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()
  const phoneRef = useRef<HTMLInputElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const noteRef = useRef<HTMLInputElement>(null)
  const importInputRef = useRef<HTMLInputElement>(null)
  const [data, setData] = useState<QuickData | null>(null)
  const [phone, setPhone] = useState('')
  const [picked, setPicked] = useState<QuickMatch | null>(null)
  const [outcome, setOutcome] = useState<CallOutcome>('Spoke to them')
  const [note, setNote] = useState('')
  const [lead, setLead] = useState({ name: '', company: '', email: '', source: 'Phone call', pipeline: 'ai_crm' as QuickLeadPipeline })
  const [busy, setBusy] = useState(false)
  const [importing, setImporting] = useState(false)
  const author = { appUserId, email: user?.email || '', name: '' }

  useEffect(() => {
    loadQuickData()
      .then(setData)
      .catch((e) => showToast(errorMessage(e, 'Could not load contacts'), 'error'))
    phoneRef.current?.focus()
  }, [showToast])

  const digits = phone.replace(/\D/g, '').length
  const ready = digits >= QUICK_MIN_DIGITS
  const matches = useMemo(() => (data && ready ? quickMatches(phone, data, data.countryCode) : []), [data, phone, ready])
  const current = picked && matches.some((m) => m.id === picked.id) ? picked : matches[0] ?? null

  function reset() {
    setPhone('')
    setPicked(null)
    setNote('')
    setOutcome('Spoke to them')
    setLead((l) => ({ ...l, name: '', company: '', email: '' }))
    phoneRef.current?.focus()
  }

  function draftCsvRows() {
    const draft = {
      kind: 'draft',
      phone,
      name: lead.name,
      company: lead.company,
      email: lead.email,
      source: lead.source,
      pipeline: lead.pipeline,
      note,
      outcome,
      account_or_company: '',
      account_type_or_stage: '',
      id: '',
    }
    const matchRows = matches.map((m) =>
      m.kind === 'contact'
        ? {
            kind: 'contact',
            phone: m.phone,
            name: m.name,
            company: '',
            email: '',
            source: '',
            pipeline: '',
            note: '',
            outcome: '',
            account_or_company: m.accountName,
            account_type_or_stage: m.accountType,
            id: m.id,
          }
        : {
            kind: 'crm',
            phone: m.phone,
            name: m.name,
            company: m.company,
            email: '',
            source: '',
            pipeline: '',
            note: '',
            outcome: '',
            account_or_company: m.company,
            account_type_or_stage: m.stage,
            id: m.id,
          },
    )
    return [draft, ...matchRows]
  }

  function exportQuickAddCsv() {
    exportListCsv(
      `quick-add-${cleanPhoneInput(phone) || 'draft'}.csv`,
      [...QUICK_ADD_CSV_COLUMNS],
      draftCsvRows(),
    )
    showToast('Quick-add CSV downloaded', 'success')
  }

  async function importQuickAddCsv(file: File) {
    setImporting(true)
    try {
      const text = await file.text()
      const { headers, rows } = parseCsv(text)
      if (!headers.length) {
        showToast('CSV has no header row', 'error')
        return
      }
      const objects = csvRowsToObjects(headers, rows)
      if (!objects.length) {
        showToast('No quick-add rows in CSV', 'error')
        return
      }

      const draftRow =
        objects.find((r) => String(r.kind || '').trim().toLowerCase() === 'draft') ||
        objects.find(
          (r) =>
            String(r.phone || '').trim() ||
            String(r.name || '').trim() ||
            String(r.company || '').trim() ||
            String(r.email || '').trim() ||
            String(r.note || '').trim(),
        ) ||
        null

      if (!draftRow) {
        showToast('CSV had no matching quick-add fields', 'error')
        return
      }

      const nextPhone = String(draftRow.phone || '').trim()
      const hasName = draftRow.name != null
      const hasCompany = draftRow.company != null
      const hasEmail = draftRow.email != null
      const hasSource = draftRow.source != null && String(draftRow.source).trim() !== ''
      const hasPipeline = draftRow.pipeline != null && String(draftRow.pipeline).trim() !== ''
      const hasNote = draftRow.note != null
      const hasOutcome = draftRow.outcome != null && String(draftRow.outcome).trim() !== ''
      const applied =
        (nextPhone ? 1 : 0) +
        (hasName ? 1 : 0) +
        (hasCompany ? 1 : 0) +
        (hasEmail ? 1 : 0) +
        (hasSource ? 1 : 0) +
        (hasPipeline ? 1 : 0) +
        (hasNote ? 1 : 0) +
        (hasOutcome ? 1 : 0)

      if (!applied) {
        showToast('CSV had no matching quick-add fields', 'error')
        return
      }

      if (nextPhone) {
        setPhone(cleanPhoneInput(nextPhone))
        setPicked(null)
      }
      if (hasName || hasCompany || hasEmail || hasSource || hasPipeline) {
        setLead((l) => ({
          ...l,
          name: hasName ? String(draftRow.name).trim() : l.name,
          company: hasCompany ? String(draftRow.company).trim() : l.company,
          email: hasEmail ? String(draftRow.email).trim() : l.email,
          source: hasSource ? resolveSource(String(draftRow.source), l.source) : l.source,
          pipeline: hasPipeline ? resolvePipeline(String(draftRow.pipeline), l.pipeline) : l.pipeline,
        }))
      }
      if (hasNote) setNote(String(draftRow.note))
      if (hasOutcome) setOutcome((o) => resolveOutcome(String(draftRow.outcome), o))
      showToast('Quick-add draft imported', 'success')
      // Focus the next useful field after phone is filled.
      window.setTimeout(() => {
        if (cleanPhoneInput(nextPhone || phone).replace(/\D/g, '').length >= QUICK_MIN_DIGITS) {
          nameRef.current?.focus()
        } else {
          phoneRef.current?.focus()
        }
      }, 0)
    } catch (e) {
      showToast(errorMessage(e, 'Quick-add CSV import failed'), 'error')
    } finally {
      setImporting(false)
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

  async function logCall() {
    if (!current) return
    setBusy(true)
    try {
      await logQuickCall(current, quickCallBody(outcome, note), author)
      showToast(`Call logged on ${current.kind === 'contact' ? current.accountName : current.company}`, 'success')
      reset()
    } catch (e) {
      showToast(errorMessage(e, 'Could not log the call'), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function addLead(open: boolean) {
    const parsed = parseQuickLeadForm({
      phone,
      name: lead.name,
      company: lead.company,
      email: lead.email,
      source: lead.source,
      pipeline: lead.pipeline,
      note,
      countryCode: data?.countryCode,
    })
    if (!parsed.ok) return showToast(parsed.error, 'error')
    setBusy(true)
    try {
      const refs = (data?.accounts || []).map((a) => a.reference)
      const r = await saveQuickLead(
        {
          name: parsed.data.name,
          company: parsed.data.company,
          email: parsed.data.email,
          source: parsed.data.source,
          pipeline: parsed.data.pipeline,
          phone: parsed.data.phone,
          note: parsed.data.note,
        },
        refs,
        author,
      )
      showToast(`Lead added: ${lead.company.trim() || lead.name.trim()}`, 'success')
      if (open) navigate(r.path)
      else {
        reset()
        setData(await loadQuickData())
      }
    } catch (e) {
      showToast(errorMessage(e, 'Could not add the lead'), 'error')
    } finally {
      setBusy(false)
    }
  }

  if (userRole === 'viewer' || userRole === 'staff') {
    return (
      <div style={pageStyle}>
        <h1 style={pageTitleStyle}>{t('page.quickAdd.title')}</h1>
        <p style={{ color: colors.muted }}>{t('page.quickAdd.restricted')}</p>
      </div>
    )
  }

  return (
    <div style={{ ...pageStyle, maxWidth: 620 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <h1 style={{ ...pageTitleStyle, margin: 0 }}>{t('page.quickAdd.title')}</h1>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            ref={importInputRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void importQuickAddCsv(file)
            }}
          />
          <button
            type="button"
            style={buttonSecondaryStyle}
            disabled={busy || importing}
            onClick={() => importInputRef.current?.click()}
          >
            {importing ? 'Importing…' : 'Import CSV'}
          </button>
          <button type="button" style={buttonSecondaryStyle} disabled={busy || importing} onClick={exportQuickAddCsv}>
            Export CSV
          </button>
        </div>
      </div>
      <section style={{ ...cardStyle, marginTop: 12 }}>
        <label style={labelStyle} htmlFor="quick-phone">
          Phone number
        </label>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Phone size={20} color={colors.muted} />
          <input
            id="quick-phone"
            ref={phoneRef}
            type="tel"
            inputMode="tel"
            autoComplete="off"
            placeholder="050 123 4567"
            style={big}
            value={phone}
            onChange={(e) => {
              setPhone(cleanPhoneInput(e.target.value))
              setPicked(null)
            }}
            // Enter moves on: to the note for a known number, to the name for a new one.
            onKeyDown={(e) => e.key === 'Enter' && (matches.length ? noteRef : nameRef).current?.focus()}
          />
        </div>
        {!data ? <p style={{ color: colors.muted, fontSize: 13 }}>Loading contacts…</p> : null}
        {data && !ready ? <p style={{ color: colors.muted, fontSize: 13, marginBottom: 0 }}>Type at least {QUICK_MIN_DIGITS} digits.</p> : null}
      </section>

      {ready && data ? (
        <section style={{ ...cardStyle, marginTop: 12 }}>
          {matches.length ? (
            <>
              <div style={{ fontSize: 13, color: colors.muted, marginBottom: 8 }}>
                {matches.length === 1 ? 'Known number' : `${matches.length} matches, pick one`}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {matches.map((m) => (
                  <button key={`${m.kind}-${m.id}`} type="button" style={chip(current?.id === m.id)} onClick={() => setPicked(m)}>
                    {m.kind === 'contact' ? `${m.name || 'Contact'}, ${m.accountName}` : `${m.name || m.company} (CRM, ${m.stage})`}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                {CALL_OUTCOMES.map((o) => (
                  <button key={o} type="button" style={chip(outcome === o)} onClick={() => setOutcome(o)}>
                    {o}
                  </button>
                ))}
              </div>
              <input
                style={{ ...inputStyle, marginTop: 12 }}
                ref={noteRef}
                placeholder="Note (optional)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void logCall()}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <button type="button" style={buttonPrimaryStyle} disabled={busy || importing} onClick={() => void logCall()}>
                  {busy ? 'Saving…' : 'Log the call'}
                </button>
                {current?.kind === 'contact' ? (
                  <Link to={`/accounts/${current.accountId}`} style={{ color: colors.accentText, fontSize: 13 }}>
                    Open the account
                  </Link>
                ) : null}
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 13, color: colors.muted, marginBottom: 8 }}>New number. Add it as a lead.</div>
              <div style={{ display: 'grid', gap: 10 }}>
                <input
                  style={inputStyle}
                  ref={nameRef}
                  placeholder="Name"
                  value={lead.name}
                  onChange={(e) => setLead({ ...lead, name: e.target.value })}
                />
                <input style={inputStyle} placeholder="Company (optional)" value={lead.company} onChange={(e) => setLead({ ...lead, company: e.target.value })} />
                <input
                  style={inputStyle}
                  type="email"
                  placeholder="Email (optional)"
                  value={lead.email}
                  onChange={(e) => setLead({ ...lead, email: e.target.value })}
                />
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {QUICK_LEAD_PIPELINES.map((p) => (
                    <button key={p.value} type="button" style={chip(lead.pipeline === p.value)} onClick={() => setLead({ ...lead, pipeline: p.value })}>
                      {p.label}
                    </button>
                  ))}
                  <select
                    aria-label="Source"
                    style={{ ...selectStyle, width: 'auto', padding: '8px 10px', fontSize: 13 }}
                    value={lead.source}
                    onChange={(e) => setLead({ ...lead, source: e.target.value })}
                  >
                    {SOURCES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <input
                  style={inputStyle}
                  placeholder="Note (optional)"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void addLead(false)}
                />
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                <button type="button" style={buttonPrimaryStyle} disabled={busy || importing || lead.name.trim().length < 2} onClick={() => void addLead(false)}>
                  {busy ? 'Saving…' : 'Add lead'}
                </button>
                <button type="button" style={buttonSecondaryStyle} disabled={busy || importing || lead.name.trim().length < 2} onClick={() => void addLead(true)}>
                  Add and open
                </button>
              </div>
            </>
          )}
        </section>
      ) : null}
    </div>
  )
}
