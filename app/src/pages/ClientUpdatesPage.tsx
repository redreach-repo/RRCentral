import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { addDays, format, parseISO } from 'date-fns'
import { useAuth } from '../contexts/AuthContext'
import { useI18n } from '../contexts/I18nContext'
import { useToast } from '../contexts/ToastContext'
import SavedViewsBar from '../components/SavedViewsBar'
import { runAi } from '../lib/aiAssistStore'
import { buildUpdateDrafts, loadUpdateQueue, saveUpdateBody, sendUpdate, setUpdateSkipped, type UpdateContact, type UpdateQueue } from '../lib/clientUpdatesStore'
import { errorMessage } from '../lib/errors'
import { csvRowsToObjects, exportListCsv, parseCsv } from '../lib/listIo'
import { roleAtLeast } from '../lib/permissions'
import { parseClientUpdateBody } from '../lib/schemas/clientUpdate'
import type { ClientUpdateDraft } from '../lib/types'
import {
  CLIENT_UPDATE_BODY_MAX,
  CLIENT_UPDATE_STATUSES,
  updateRecipients,
  weekLabelOf,
  weekStartFor,
  whatsAppLink,
  type ClientUpdateChannel,
  type ClientUpdateStatus,
} from '../lib/weeklyUpdates'
import {
  buttonPrimaryStyle,
  buttonSecondaryStyle,
  cardStyle,
  colors,
  inputStyle,
  selectStyle,
} from '../lib/uiStyles'
import docsStyles from '../styles/docsList.module.css'

const smallBtn = { ...buttonSecondaryStyle, padding: '6px 10px', fontSize: 13 }
const muted = { color: colors.muted, fontSize: 13 }

const CLIENT_UPDATES_CSV_HEADERS = [
  'account',
  'status',
  'week_start',
  'body',
  'sent_via',
  'sent_to',
  'sent_at',
  'sent_by',
] as const

function parseUpdateStatus(raw: string): ClientUpdateStatus | null {
  const token = raw.trim().toLowerCase()
  if (!token) return null
  const byValue = CLIENT_UPDATE_STATUSES.find((s) => s.value === token)
  if (byValue) return byValue.value
  const byLabel = CLIENT_UPDATE_STATUSES.find((s) => s.label.toLowerCase() === token)
  return byLabel?.value ?? null
}

/**
 * The Approve queue for weekly CTRM Next client updates. Every Thursday each
 * CTRM Next client with a signed deal gets a draft built from their issues and
 * sessions; nothing goes out until someone taps Send by email or WhatsApp.
 */
export default function ClientUpdatesPage() {
  const { t } = useI18n()
  const { userRole, user, appUserId } = useAuth()
  const { showToast } = useToast()
  const weeks = useMemo(() => {
    const latest = parseISO(weekStartFor(new Date()))
    return Array.from({ length: 6 }, (_, i) => format(addDays(latest, -7 * i), 'yyyy-MM-dd'))
  }, [])
  const [week, setWeek] = useState(weeks[0])
  const [queue, setQueue] = useState<UpdateQueue | null>(null)
  const [building, setBuilding] = useState(false)
  const [statusFilter, setStatusFilter] = useState('all')
  const [importing, setImporting] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)
  const updatesViewFilters = useMemo(
    () => ({ status: statusFilter, week }),
    [statusFilter, week],
  )
  const canImport = userRole !== 'viewer' && !queue?.missingTable

  const load = useCallback(async () => {
    try {
      setQueue(await loadUpdateQueue(week))
    } catch (e) {
      showToast(errorMessage(e, 'Could not load the updates'), 'error')
      setQueue({ drafts: [], contacts: [], missingTable: false })
    }
  }, [week, showToast])

  useEffect(() => {
    void load()
  }, [load])

  async function build() {
    setBuilding(true)
    const r = await buildUpdateDrafts(week, user?.email || '')
    setBuilding(false)
    if (!r.ok) return showToast(r.message, 'error')
    const n = r.data.drafted.length
    const quiet = r.data.nothing_to_say.length
    showToast(
      n
        ? `${n} new ${n === 1 ? 'draft' : 'drafts'} to check`
        : quiet
          ? `Nothing to report this week for ${r.data.nothing_to_say.join(', ')}`
          : 'Every CTRM Next client already has a draft for this week',
      'success',
    )
    if (r.data.problems.length) showToast(`Not drafted: ${r.data.problems.join('; ')}`, 'error')
    await load()
  }

  async function importUpdatesCsv(file: File) {
    if (!canImport) return
    setImporting(true)
    try {
      const text = await file.text()
      const { headers, rows: csvRows } = parseCsv(text)
      if (!headers.length) {
        showToast('CSV has no header row', 'error')
        return
      }
      const objects = csvRowsToObjects(headers, csvRows)
      const remaining = [...(queue?.drafts || [])]
      const byAccount = new Map(
        remaining.map((d) => [d.accountName.trim().toLowerCase(), d] as const),
      )
      let saved = 0
      let skipped = 0
      for (const row of objects) {
        const account = String(row.account || '').trim()
        if (!account) {
          skipped += 1
          continue
        }
        const weekStart = String(row.week_start || '').trim()
        if (weekStart && weekStart !== week) {
          skipped += 1
          continue
        }
        const draft = byAccount.get(account.toLowerCase())
        if (!draft || draft.status === 'sent') {
          skipped += 1
          continue
        }

        let changed = false
        const bodyRaw = String(row.body ?? '')
        if (bodyRaw.trim() && bodyRaw.trim() !== draft.body.trim()) {
          const parsed = parseClientUpdateBody({ body: bodyRaw })
          if (!parsed.ok) {
            skipped += 1
            continue
          }
          await saveUpdateBody(draft.id, parsed.data.body)
          draft.body = parsed.data.body
          changed = true
        }

        const nextStatus = parseUpdateStatus(String(row.status || ''))
        if (nextStatus === 'skipped' && draft.status === 'draft') {
          await setUpdateSkipped(draft.id, true)
          draft.status = 'skipped'
          changed = true
        } else if (nextStatus === 'draft' && draft.status === 'skipped') {
          await setUpdateSkipped(draft.id, false)
          draft.status = 'draft'
          changed = true
        } else if (nextStatus === 'sent' && !changed) {
          skipped += 1
          continue
        }

        if (changed) saved += 1
        else skipped += 1
      }

      if (!saved) {
        showToast(skipped ? 'No matching client update rows in CSV' : 'CSV has no data rows', 'error')
        return
      }
      const skipNote = skipped ? ` · ${skipped} row(s) skipped` : ''
      showToast(`Imported ${saved} client update(s)${skipNote}`, 'success')
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Client updates CSV import failed'), 'error')
    } finally {
      setImporting(false)
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

  const waiting = queue?.drafts.filter((d) => d.status === 'draft').length ?? 0
  const sent = queue?.drafts.filter((d) => d.status === 'sent').length ?? 0
  const visibleDrafts = useMemo(() => {
    const rows = queue?.drafts || []
    if (statusFilter === 'all') return rows
    return rows.filter((d) => d.status === statusFilter)
  }, [queue, statusFilter])

  return (
    <div className={docsStyles.page}>
      <header className={docsStyles.hero}>
        <div>
          <p className={docsStyles.kicker}>{t('page.clients.kicker')}</p>
          <h1 className={docsStyles.title}>{t('page.clientUpdates.title')}</h1>
          <p className={docsStyles.subtitle}>{t('page.clientUpdates.subtitle')}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            ref={importInputRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void importUpdatesCsv(file)
            }}
          />
          {canImport ? (
            <button
              type="button"
              className={docsStyles.newBtn}
              style={{ background: 'transparent', color: 'inherit', border: '1px solid var(--border)' }}
              disabled={importing || building}
              onClick={() => importInputRef.current?.click()}
            >
              {importing ? 'Importing…' : 'Import CSV'}
            </button>
          ) : null}
          <button
            type="button"
            className={docsStyles.newBtn}
            style={{ background: 'transparent', color: 'inherit', border: '1px solid var(--border)' }}
            disabled={!queue?.drafts.length}
            onClick={() => {
              if (!queue?.drafts.length) return
              exportListCsv(
                `client-updates-${week}.csv`,
                [...CLIENT_UPDATES_CSV_HEADERS],
                queue.drafts.map((d) => ({
                  account: d.accountName,
                  status: d.status,
                  week_start: d.week_start || week,
                  body: d.body || '',
                  sent_via: d.sent_via || '',
                  sent_to: d.sent_to || '',
                  sent_at: d.sent_at || '',
                  sent_by: d.sent_by || '',
                })),
              )
              showToast('Client updates CSV downloaded', 'success')
            }}
          >
            Export CSV
          </button>
        </div>
      </header>

      <SavedViewsBar
        moduleId="client_updates"
        filters={updatesViewFilters}
        ownerUserId={appUserId}
        canWrite={userRole !== 'viewer'}
        applyDefaultOnLoad={false}
        onApply={(f) => {
          const nextWeek = String(f.week || '')
          if (nextWeek && weeks.includes(nextWeek)) setWeek(nextWeek)
          setStatusFilter(String(f.status || 'all'))
        }}
        onToast={showToast}
        filtersEqual={(a, b) =>
          String(a.status || 'all') === String(b.status || 'all') &&
          String(a.week || '') === String(b.week || '')
        }
      />

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', margin: '12px 0 16px' }}>
        <select aria-label="Week" style={{ ...selectStyle, width: 'auto' }} value={week} onChange={(e) => setWeek(e.target.value)}>
          {weeks.map((w) => (
            <option key={w} value={w}>
              {weekLabelOf(w)}
            </option>
          ))}
        </select>
        <select
          aria-label="Status filter"
          style={{ ...selectStyle, width: 'auto' }}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="all">All statuses</option>
          {CLIENT_UPDATE_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <span style={muted}>
          {queue
            ? t('page.clientUpdates.queueStatus')
                .replace('{waiting}', String(waiting))
                .replace('{sent}', String(sent))
            : t('page.clientUpdates.loading')}
        </span>
        {roleAtLeast(userRole, 'manager') && !queue?.missingTable ? (
          <button type="button" style={smallBtn} disabled={building} onClick={() => void build()}>
            {building ? t('page.clientUpdates.building') : t('page.clientUpdates.buildDrafts')}
          </button>
        ) : null}
      </div>

      {queue?.missingTable ? (
        <p style={{ color: colors.warn }}>{t('page.clientUpdates.missingTable')}</p>
      ) : queue && queue.drafts.length === 0 ? (
        <section style={cardStyle}>
          <p style={{ ...muted, margin: 0 }}>
            {t('page.clientUpdates.empty').replace('{week}', weekLabelOf(week))}
          </p>
        </section>
      ) : visibleDrafts.length === 0 ? (
        <section style={cardStyle}>
          <p style={{ ...muted, margin: 0 }}>No updates match this status filter.</p>
        </section>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {visibleDrafts.map((d) => (
            <DraftCard
              key={d.id}
              draft={d}
              contacts={queue!.contacts.filter((c) => c.account_id === d.account_id)}
              canSend={roleAtLeast(userRole, 'sales')}
              canEdit={userRole !== 'viewer'}
              onChanged={load}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function DraftCard({
  draft,
  contacts,
  canSend,
  canEdit,
  onChanged,
}: {
  draft: ClientUpdateDraft & { accountName: string }
  contacts: UpdateContact[]
  canSend: boolean
  canEdit: boolean
  onChanged: () => Promise<void>
}) {
  const { t } = useI18n()
  const { user, appUserId } = useAuth()
  const { showToast } = useToast()
  const [body, setBody] = useState(draft.body)
  const [busy, setBusy] = useState('')
  const [showFacts, setShowFacts] = useState(false)
  const to = updateRecipients(contacts)
  const status = CLIENT_UPDATE_STATUSES.find((s) => s.value === draft.status)?.label ?? draft.status
  const open = draft.status === 'draft'
  const changed = body.trim() !== draft.body.trim()

  async function save() {
    const parsed = parseClientUpdateBody({ body })
    if (!parsed.ok) {
      showToast(parsed.error, 'error')
      return
    }
    setBusy('save')
    try {
      await saveUpdateBody(draft.id, parsed.data.body)
      showToast('Update saved', 'success')
      await onChanged()
    } catch (e) {
      showToast(errorMessage(e, 'Could not save the update'), 'error')
    } finally {
      setBusy('')
    }
  }

  async function tidy() {
    setBusy('tidy')
    try {
      const r = await runAi(draft.account_id, { feature: 'update_tidy', accountName: draft.accountName, text: body })
      setBody(r.text)
      showToast('Wording tidied. Check it, then send or save.', 'success')
    } catch (e) {
      showToast(errorMessage(e, 'AI help could not tidy the wording'), 'error')
    } finally {
      setBusy('')
    }
  }

  async function send(channel: ClientUpdateChannel) {
    const parsed = parseClientUpdateBody({ body })
    if (!parsed.ok) {
      showToast(parsed.error, 'error')
      return
    }
    // Open the WhatsApp tab on the tap itself, so the browser does not block it.
    const tab = channel === 'whatsapp' ? window.open('', '_blank') : null
    setBusy(channel)
    const r = await sendUpdate(draft, channel, parsed.data.body, { appUserId, email: user?.email || '' })
    setBusy('')
    if (!r.ok) {
      tab?.close()
      showToast(r.message, 'error')
    } else if (channel === 'whatsapp') {
      const link = whatsAppLink(r.data.to, parsed.data.body)
      if (tab) tab.location.href = link
      else window.location.href = link
      showToast('WhatsApp is open with the update typed in. Press send there.', 'success')
    } else {
      showToast(`Emailed to ${r.data.to}`, 'success')
    }
    await onChanged()
  }

  async function skip(skipped: boolean) {
    setBusy('skip')
    try {
      await setUpdateSkipped(draft.id, skipped)
      await onChanged()
    } catch (e) {
      showToast(errorMessage(e, 'Could not change the update'), 'error')
    } finally {
      setBusy('')
    }
  }

  return (
    <section style={cardStyle} aria-label={`${draft.accountName} update`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'baseline' }}>
        <h2 style={{ fontSize: 16, margin: 0 }}>
          <Link to={`/accounts/${draft.account_id}`} style={{ color: colors.text }}>
            {draft.accountName}
          </Link>
        </h2>
        <span style={{ fontSize: 13, color: draft.status === 'sent' ? colors.success : draft.status === 'skipped' ? colors.muted : colors.warn }}>
          {status}
          {draft.status === 'sent' && draft.sent_at ? `, ${format(new Date(draft.sent_at), 'd MMM HH:mm')} by ${draft.sent_by}` : ''}
        </span>
      </div>
      <p style={{ ...muted, margin: '4px 0 10px' }}>
        {draft.status === 'sent'
          ? `${draft.sent_via === 'email' ? 'Email' : 'WhatsApp'}: ${draft.sent_to}`
          : `To ${to.email ? to.email.contact.name || to.email.to : 'nobody by email'}${to.whatsapp ? `, WhatsApp ${to.whatsapp.to}` : ', no WhatsApp number'}`}
      </p>

      {draft.error ? <p style={{ color: colors.warn, fontSize: 13, margin: '0 0 8px' }}>{draft.error}</p> : null}

      {open && canEdit ? (
        <textarea
          aria-label={t('page.clientUpdates.body')}
          style={{ ...inputStyle, minHeight: 220, resize: 'vertical', lineHeight: 1.5, fontFamily: 'inherit' }}
          maxLength={CLIENT_UPDATE_BODY_MAX}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      ) : (
        <p style={{ fontSize: 14, whiteSpace: 'pre-wrap', margin: 0 }}>
          {draft.body || t('page.clientUpdates.noText')}
        </p>
      )}

      <button type="button" onClick={() => setShowFacts((v) => !v)} style={{ ...smallBtn, marginTop: 8, border: 'none', paddingLeft: 0 }}>
        {showFacts ? t('page.clientUpdates.hideFacts') : t('page.clientUpdates.showFacts')}
      </button>
      {showFacts ? (
        <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 13, lineHeight: 1.6 }}>
          {(draft.facts || []).map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      ) : null}

      {open && canEdit ? (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
          {canSend ? (
            <>
              {to.email ? (
                <button type="button" style={buttonPrimaryStyle} disabled={!!busy || !body.trim()} onClick={() => void send('email')}>
                  {busy === 'email' ? t('page.clientUpdates.sending') : t('page.clientUpdates.sendEmail')}
                </button>
              ) : null}
              {to.whatsapp ? (
                <button
                  type="button"
                  style={to.email ? smallBtn : buttonPrimaryStyle}
                  disabled={!!busy || !body.trim()}
                  onClick={() => void send('whatsapp')}
                >
                  {busy === 'whatsapp' ? t('page.clientUpdates.opening') : t('page.clientUpdates.sendWhatsApp')}
                </button>
              ) : null}
            </>
          ) : (
            <span style={muted}>{t('page.clientUpdates.sendRestricted')}</span>
          )}
          <button type="button" style={smallBtn} disabled={!!busy || body.trim().length < 20} onClick={() => void tidy()}>
            {busy === 'tidy' ? t('page.clientUpdates.tidying') : t('page.clientUpdates.tidy')}
          </button>
          {changed ? (
            <button type="button" style={smallBtn} disabled={!!busy} onClick={() => void save()}>
              {t('page.clientUpdates.save')}
            </button>
          ) : null}
          <button type="button" style={smallBtn} disabled={!!busy} onClick={() => void skip(true)}>
            {t('page.clientUpdates.skipWeek')}
          </button>
        </div>
      ) : null}
      {open && canEdit ? (
        <p style={{ ...muted, margin: '8px 0 0' }}>{t('page.clientUpdates.tidyHint')}</p>
      ) : null}
      {draft.status === 'skipped' && canEdit ? (
        <button type="button" style={{ ...smallBtn, marginTop: 10 }} disabled={!!busy} onClick={() => void skip(false)}>
          {t('page.clientUpdates.putBack')}
        </button>
      ) : null}
    </section>
  )
}
