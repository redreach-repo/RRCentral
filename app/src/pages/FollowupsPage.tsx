import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { addDays, differenceInCalendarDays, format, parseISO, startOfDay } from 'date-fns'
import { Bell, CalendarClock, Settings } from 'lucide-react'
import FollowUpCardActions from '../components/followups/FollowUpCardActions'
import { useCompactCrm } from '../hooks/useMediaQuery'
import resp from '../styles/crmResponsive.module.css'
import { db } from '../lib/db'
import { NEXT_ACTIONS, PIPELINE_STAGES } from '../lib/config'
import type { AppUser, CrmEntry } from '../lib/types'
import { parseFollowupUpdateForm } from '../lib/schemas/followupUpdate'
import { resolveOwnerEmails } from '../lib/calendarAttendees'
import { useAuth } from '../contexts/AuthContext'
import { useSettings } from '../contexts/SettingsContext'
import { useToast } from '../contexts/ToastContext'
import Modal from '../components/Modal'
import EmptyState from '../components/EmptyState'
import EmailComposeModal from '../components/EmailComposeModal'
import CalendarSettingsModal from '../components/CalendarSettingsModal'
import { hydrateContacts, primaryContact } from '../lib/contacts'
import { buildWhatsAppUrl } from '../lib/whatsapp'
import {
  applyMessageTemplate,
  DEFAULT_EMAIL_CRM_BODY,
  DEFAULT_EMAIL_CRM_SUBJECT,
  DEFAULT_WHATSAPP_CRM,
} from '../lib/templates'
import {
  buildFollowUpWhatsAppMessage,
  DEFAULT_WHATSAPP_FOLLOWUP_INVOICE,
  DEFAULT_WHATSAPP_FOLLOWUP_QUOTE,
  loadFollowUpDocument,
} from '../lib/followUpMessage'
import { getCalendarProvider, getMailProvider } from '../lib/mailCalendar'
import {
  buttonPrimaryStyle,
  buttonSecondaryStyle,
  cardStyle,
  colors,
  inputStyle,
  labelStyle,
  sectionTitleStyle,
} from '../lib/uiStyles'
import docsStyles from '../styles/docsList.module.css'
import { logActivity } from '../lib/activity'
import { errorMessage } from '../lib/errors'

function daysLabel(dateStr: string, today: Date): string {
  const d = startOfDay(parseISO(dateStr.slice(0, 10)))
  const diff = differenceInCalendarDays(d, today)
  if (diff < 0) return `${Math.abs(diff)}d overdue`
  if (diff === 0) return 'Due today'
  if (diff === 1) return 'Tomorrow'
  return `In ${diff}d`
}

export default function FollowupsPage() {
  const { user } = useAuth()
  const { settings } = useSettings()
  const { showToast } = useToast()
  const compact = useCompactCrm()
  const [entries, setEntries] = useState<CrmEntry[]>([])
  const [team, setTeam] = useState<AppUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [updateTarget, setUpdateTarget] = useState<CrmEntry | null>(null)
  const [updateText, setUpdateText] = useState('')
  const [updateFollowDate, setUpdateFollowDate] = useState('')
  const [updateStage, setUpdateStage] = useState('')
  const [updateNextAction, setUpdateNextAction] = useState('')
  const [updateClearDate, setUpdateClearDate] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionsOpenId, setActionsOpenId] = useState<string | null>(null)
  const [emailTarget, setEmailTarget] = useState<CrmEntry | null>(null)
  const [calendarSettingsOpen, setCalendarSettingsOpen] = useState(false)

  async function openFollowUpWhatsApp(entry: CrmEntry) {
    const contacts = hydrateContacts(entry)
    const p = primaryContact(contacts)
    const phone = p?.phone || entry.mobile_number || ''
    if (!phone) {
      showToast('No phone number on this company', 'error')
      return
    }
    setBusyId(entry.id)
    try {
      const doc = await loadFollowUpDocument(entry)
      const text = buildFollowUpWhatsAppMessage({
        entry,
        contactName: p?.name,
        companyName: settings.companyName || 'Red Reach Middle East FZE',
        doc,
        quoteTemplate: settings.whatsappFollowUpQuoteMessage || DEFAULT_WHATSAPP_FOLLOWUP_QUOTE,
        invoiceTemplate: settings.whatsappFollowUpInvoiceMessage || DEFAULT_WHATSAPP_FOLLOWUP_INVOICE,
        genericTemplate: settings.whatsappCrmMessage || DEFAULT_WHATSAPP_CRM,
      })
      window.open(
        buildWhatsAppUrl(phone, text, settings.whatsappCountryCode || '971'),
        '_blank',
        'noopener,noreferrer',
      )
      if (doc) {
        showToast(
          `WhatsApp ready · ${doc.title} ${doc.ref}`,
          'success',
        )
      }
    } catch (e) {
      showToast(errorMessage(e, 'Could not prepare WhatsApp message'), 'error')
    } finally {
      setBusyId(null)
    }
  }

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [crmRes, usersRes] = await Promise.all([
        db.from('crm').select('*').not('follow_up_date', 'is', null).order('follow_up_date', { ascending: true }),
        db.from('app_users').select('*').eq('active', true).order('name'),
      ])
      if (crmRes.error) throw crmRes.error
      setEntries((crmRes.data || []) as CrmEntry[])
      if (!usersRes.error && usersRes.data) setTeam(usersRes.data as AppUser[])
    } catch (e) {
      setError(errorMessage(e, 'Failed to load follow-ups'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const today = startOfDay(new Date())
  const upcomingEnd = addDays(today, 14)

  const { overdue, upcoming } = useMemo(() => {
    const od: CrmEntry[] = []
    const up: CrmEntry[] = []
    for (const e of entries) {
      if (!e.follow_up_date) continue
      try {
        const d = startOfDay(parseISO(e.follow_up_date.slice(0, 10)))
        if (d < today) od.push(e)
        else if (d <= upcomingEnd) up.push(e)
      } catch {
        /* skip bad dates */
      }
    }
    return { overdue: od, upcoming: up }
  }, [entries, today, upcomingEnd])

  async function snooze(entry: CrmEntry) {
    if (!entry.follow_up_date) return
    setBusyId(entry.id)
    try {
      const next = format(addDays(parseISO(entry.follow_up_date.slice(0, 10)), 7), 'yyyy-MM-dd')
      const patch: Record<string, unknown> = {
        follow_up_date: next,
        updated_by: user?.email || '',
        updated_at: new Date().toISOString(),
      }

      if (getCalendarProvider(settings).isEnabled(settings)) {
        try {
          const contacts = hydrateContacts(entry)
          const p = primaryContact(contacts)
          const eventId = await getCalendarProvider(settings).syncFollowUp(settings, {
            company: entry.company_name,
            nextAction: entry.next_action,
            owner: entry.owner,
            contactName: p?.name,
            contactEmail: p?.email,
            teamAttendeeEmails: resolveOwnerEmails(
              entry.owner,
              team.map((u) => ({ email: u.email, name: u.name, active: u.active })),
            ),
            followUpDate: next,
            existingEventId: entry.calendar_event_id || undefined,
          })
          if (eventId) patch.calendar_event_id = eventId
        } catch (calErr) {
          showToast(
            calErr instanceof Error
              ? `Snoozed locally; calendar: ${calErr.message}`
              : 'Snoozed locally; calendar sync failed',
            'error',
          )
        }
      }

      const { error: err } = await db.from('crm').update(patch).eq('id', entry.id)
      if (err) throw err
      await logActivity('snooze_followup', 'crm', entry.company_name, `Snoozed to ${next}`, user?.email || '', entry.id)
      showToast('Follow-up snoozed +7 days', 'success')
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Snooze failed'), 'error')
    } finally {
      setBusyId(null)
    }
  }

  async function clearFollowUp(entry: CrmEntry) {
    setBusyId(entry.id)
    try {
      if (getCalendarProvider(settings).isEnabled(settings) && entry.calendar_event_id) {
        try {
          await getCalendarProvider(settings).deleteEvent(settings, entry.calendar_event_id)
        } catch (calErr) {
          showToast(
            calErr instanceof Error
              ? `Cleared locally; calendar: ${calErr.message}`
              : 'Cleared locally; calendar delete failed',
            'error',
          )
        }
      }

      const { error: err } = await db
        .from('crm')
        .update({
          follow_up_date: null,
          calendar_event_id: '',
          updated_by: user?.email || '',
          updated_at: new Date().toISOString(),
        })
        .eq('id', entry.id)
      if (err) throw err
      await logActivity('clear_followup', 'crm', entry.company_name, 'Cleared follow-up date', user?.email || '', entry.id)
      showToast('Follow-up cleared', 'success')
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Clear failed'), 'error')
    } finally {
      setBusyId(null)
    }
  }

  async function saveUpdate() {
    if (!updateTarget) return
    const parsed = parseFollowupUpdateForm({
      update_text: updateText,
      pipeline_stage: updateStage,
      next_action: updateNextAction,
      follow_up_date: updateFollowDate,
      clearDate: updateClearDate,
      entry: updateTarget,
    })
    if (!parsed.ok) {
      showToast(parsed.error, 'error')
      return
    }
    const upd = parsed.data
    setBusyId(updateTarget.id)
    try {
      const { error: err } = await db.from('follow_up_updates').insert({
        crm_id: updateTarget.id,
        company: updateTarget.company_name,
        update_text: upd.update_text,
        user_email: user?.email || '',
      })
      if (err) throw err

      const patch: Record<string, unknown> = {
        updated_by: user?.email || '',
        updated_at: new Date().toISOString(),
      }
      if (upd.pipeline_stage) patch.pipeline_stage = upd.pipeline_stage
      if (upd.next_action) patch.next_action = upd.next_action

      let nextDate: string | null | undefined
      if (upd.clearDate) {
        nextDate = null
        patch.follow_up_date = null
      } else if (upd.follow_up_date) {
        nextDate = upd.follow_up_date
        patch.follow_up_date = upd.follow_up_date
      }

      if (getCalendarProvider(settings).isEnabled(settings) && nextDate !== undefined) {
        try {
          const contacts = hydrateContacts(updateTarget)
          const p = primaryContact(contacts)
          if (nextDate) {
            const eventId = await getCalendarProvider(settings).syncFollowUp(settings, {
              company: updateTarget.company_name,
              nextAction: (patch.next_action as string) || updateTarget.next_action,
              owner: updateTarget.owner,
              contactName: p?.name,
              contactEmail: p?.email,
              teamAttendeeEmails: resolveOwnerEmails(
                updateTarget.owner,
                team.map((u) => ({ email: u.email, name: u.name, active: u.active })),
              ),
              followUpDate: nextDate,
              existingEventId: updateTarget.calendar_event_id || undefined,
            })
            if (eventId) patch.calendar_event_id = eventId
          } else if (updateTarget.calendar_event_id) {
            await getCalendarProvider(settings).deleteEvent(settings, updateTarget.calendar_event_id)
            patch.calendar_event_id = ''
          }
        } catch (calErr) {
          showToast(
            calErr instanceof Error
              ? `Saved locally; calendar: ${calErr.message}`
              : 'Saved locally; calendar sync failed',
            'error',
          )
        }
      }

      if (Object.keys(patch).length > 2) {
        const { error: crmErr } = await db.from('crm').update(patch).eq('id', updateTarget.id)
        if (crmErr) throw crmErr
      }

      await logActivity(
        'followup_update',
        'crm',
        updateTarget.company_name,
        upd.update_text.slice(0, 120),
        user?.email || '',
        updateTarget.id,
      )
      showToast('Update saved', 'success')
      setUpdateTarget(null)
      setUpdateText('')
      setUpdateFollowDate('')
      setUpdateStage('')
      setUpdateNextAction('')
      setUpdateClearDate(false)
      await load()
    } catch (e) {
      showToast(errorMessage(e, 'Failed to save update'), 'error')
    } finally {
      setBusyId(null)
    }
  }

  function renderCard(entry: CrmEntry, tone: 'overdue' | 'upcoming') {
    const accent = tone === 'overdue' ? colors.danger : colors.success
    const busy = busyId === entry.id
    const contacts = hydrateContacts(entry)
    const p = primaryContact(contacts)
    const phone = p?.phone || entry.mobile_number || entry.office_number || ''
    const contactLabel =
      contacts.length > 1
        ? `${p?.name || '—'} +${contacts.length - 1}`
        : p?.name || entry.primary_contact || '—'

    const openUpdate = () => {
      setUpdateTarget(entry)
      setUpdateText('')
      setUpdateFollowDate(entry.follow_up_date ? entry.follow_up_date.slice(0, 10) : '')
      setUpdateStage(entry.pipeline_stage || 'Lead')
      setUpdateNextAction(entry.next_action || '')
      setUpdateClearDate(false)
    }

    const actions = (
      <FollowUpCardActions
        entry={entry}
        expanded={actionsOpenId === entry.id}
        onToggle={() => setActionsOpenId((id) => (id === entry.id ? null : entry.id))}
        busy={busy}
        onSnooze={(row) => void snooze(row)}
        onClear={(row) => void clearFollowUp(row)}
        onEmail={(row) => setEmailTarget(row)}
        onWhatsApp={(row) => void openFollowUpWhatsApp(row)}
        onUpdate={() => openUpdate()}
      />
    )

    if (compact) {
      return (
        <article
          key={entry.id}
          className={resp.card}
          style={{ borderLeft: `3px solid ${accent}` }}
        >
          <div className={resp.cardTop}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <Link
                to={`/crm?edit=${entry.id}`}
                className={resp.cardTitle}
                style={{ textDecoration: 'none', display: 'inline-block' }}
              >
                {entry.company_name}
              </Link>
              <div className={resp.cardMeta}>
                {contactLabel} · {entry.next_action || 'No action'}
                {entry.owner ? ` · ${entry.owner}` : ''}
                {phone ? ` · ${phone}` : ''}
              </div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: accent }}>
                {entry.follow_up_date
                  ? format(parseISO(entry.follow_up_date.slice(0, 10)), 'dd MMM')
                  : '—'}
              </div>
              <div className={resp.cardMeta}>
                {entry.follow_up_date ? daysLabel(entry.follow_up_date, today) : ''}
              </div>
            </div>
          </div>
          <div className={resp.cardActions}>{actions}</div>
        </article>
      )
    }

    return (
      <div
        key={entry.id}
        style={{
          ...cardStyle,
          borderLeft: `3px solid ${accent}`,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <Link
              to={`/crm?edit=${entry.id}`}
              style={{ color: colors.text, fontWeight: 700, fontSize: 15, textDecoration: 'none' }}
            >
              {entry.company_name}
            </Link>
            <div style={{ fontSize: 13, color: colors.muted, marginTop: 4 }}>
              {contactLabel} · {entry.next_action || 'No action'}
              {entry.company_owner ? ` · Owner: ${entry.company_owner}` : ''}
              {' · '}
              {entry.owner ? `Sales: ${entry.owner}` : 'Unassigned'}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: accent }}>
              {entry.follow_up_date
                ? format(parseISO(entry.follow_up_date.slice(0, 10)), 'dd MMM yyyy')
                : '—'}
            </div>
            <div style={{ fontSize: 12, color: colors.muted2 }}>
              {entry.follow_up_date ? daysLabel(entry.follow_up_date, today) : ''}
            </div>
          </div>
        </div>
        {actions}
      </div>
    )
  }

  return (
    <div className={docsStyles.page}>
      <header className={docsStyles.hero}>
        <div>
          <p className={docsStyles.kicker}>Sales · Work</p>
          <h1 className={docsStyles.title}>Follow-ups</h1>
          <p className={docsStyles.subtitle}>
            Overdue and upcoming CRM actions
            {getCalendarProvider(settings).isEnabled(settings) ? ` · ${getCalendarProvider(settings).label} Calendar sync on` : ''}
            . Click Actions on a card for snooze, clear, or outreach.
          </p>
        </div>
        <button type="button" className={docsStyles.newBtn} style={{ background: 'rgba(255,255,255,0.08)' }} onClick={() => setCalendarSettingsOpen(true)}>
          <Settings size={16} /> Calendar
        </button>
      </header>

      {error ? (
        <div style={{ ...cardStyle, color: colors.danger, marginBottom: 16 }}>{error}</div>
      ) : null}

      {loading ? (
        <div className={docsStyles.loading}>Loading follow-ups…</div>
      ) : (
        <>
          <section style={{ marginBottom: 28 }}>
            <h2 style={{ ...sectionTitleStyle, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Bell size={16} color={colors.danger} /> Overdue ({overdue.length})
            </h2>
            {overdue.length === 0 ? (
              <div className={docsStyles.empty}>
                <EmptyState title="No overdue follow-ups" subtitle="You're caught up on past due items." />
              </div>
            ) : (
              <div className={compact ? resp.listStack : undefined} style={compact ? undefined : { display: 'grid', gap: 12 }}>
                {overdue.map((e) => renderCard(e, 'overdue'))}
              </div>
            )}
          </section>

          <section>
            <h2 style={{ ...sectionTitleStyle, display: 'flex', alignItems: 'center', gap: 8 }}>
              <CalendarClock size={16} color={colors.success} /> Upcoming (14 days) ({upcoming.length})
            </h2>
            {upcoming.length === 0 ? (
              <div className={docsStyles.empty}>
                <EmptyState title="No upcoming follow-ups" subtitle="Nothing scheduled in the next two weeks." />
              </div>
            ) : (
              <div className={compact ? resp.listStack : undefined} style={compact ? undefined : { display: 'grid', gap: 12 }}>
                {upcoming.map((e) => renderCard(e, 'upcoming'))}
              </div>
            )}
          </section>
        </>
      )}

      <Modal
        open={!!updateTarget}
        title={`Update — ${updateTarget?.company_name || ''}`}
        onClose={() => setUpdateTarget(null)}
        width={520}
      >
        <label style={labelStyle}>What happened?</label>
        <textarea
          style={{ ...inputStyle, minHeight: 90, resize: 'vertical', marginBottom: 12 }}
          value={updateText}
          onChange={(e) => setUpdateText(e.target.value)}
          placeholder="Called client, sent samples, awaiting reply…"
        />
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: 10,
            marginBottom: 12,
          }}
        >
          <div>
            <label style={labelStyle}>Pipeline stage</label>
            <select
              style={inputStyle}
              value={updateStage}
              onChange={(e) => setUpdateStage(e.target.value)}
            >
              {PIPELINE_STAGES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Next action</label>
            <select
              style={inputStyle}
              value={updateNextAction}
              onChange={(e) => setUpdateNextAction(e.target.value)}
            >
              <option value="">—</option>
              {NEXT_ACTIONS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Follow-up date</label>
            <input
              type="date"
              style={inputStyle}
              value={updateClearDate ? '' : updateFollowDate}
              disabled={updateClearDate}
              onChange={(e) => {
                setUpdateClearDate(false)
                setUpdateFollowDate(e.target.value)
              }}
            />
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                marginTop: 8,
                fontSize: 12,
                color: colors.muted,
              }}
            >
              <input
                type="checkbox"
                checked={updateClearDate}
                onChange={(e) => setUpdateClearDate(e.target.checked)}
              />
              Clear follow-up date
            </label>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" style={buttonSecondaryStyle} onClick={() => setUpdateTarget(null)}>
            Cancel
          </button>
          <button
            type="button"
            style={buttonPrimaryStyle}
            disabled={!updateText.trim() || busyId === updateTarget?.id}
            onClick={() => void saveUpdate()}
          >
            Save update
          </button>
        </div>
        <p style={{ margin: '12px 0 0', fontSize: 12, color: colors.muted2 }}>
          Saves a note and optionally updates stage, next action, and follow-up date.
        </p>
      </Modal>

      <EmailComposeModal
        open={!!emailTarget}
        companyName={emailTarget?.company_name || ''}
        contacts={emailTarget ? hydrateContacts(emailTarget) : []}
        defaultSubject={applyMessageTemplate(settings.emailCrmSubject || DEFAULT_EMAIL_CRM_SUBJECT, {
          client: emailTarget?.company_name || '',
          company: settings.companyName || 'Red Reach Middle East FZE',
          contact: emailTarget ? primaryContact(hydrateContacts(emailTarget))?.name || 'team' : 'team',
        })}
        defaultBody={applyMessageTemplate(settings.emailCrmBody || DEFAULT_EMAIL_CRM_BODY, {
          client: emailTarget?.company_name || '',
          company: settings.companyName || 'Red Reach Middle East FZE',
          contact: emailTarget ? primaryContact(hydrateContacts(emailTarget))?.name || 'team' : 'team',
        })}
        zohoEnabled={getMailProvider(settings).isEnabled(settings)}
        onClose={() => setEmailTarget(null)}
      />

      <CalendarSettingsModal
        open={calendarSettingsOpen}
        onClose={() => setCalendarSettingsOpen(false)}
      />
    </div>
  )
}
