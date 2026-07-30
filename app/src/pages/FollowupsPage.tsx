import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { addDays, differenceInCalendarDays, format, parseISO, startOfDay } from 'date-fns'
import { Bell, CalendarClock, Mail, MessageSquarePlus, MessageCircle } from 'lucide-react'
import { db } from '../lib/db'
import { NEXT_ACTIONS, PIPELINE_STAGES } from '../lib/config'
import type { CrmEntry } from '../lib/types'
import { useAuth } from '../contexts/AuthContext'
import { useSettings } from '../contexts/SettingsContext'
import { useToast } from '../contexts/ToastContext'
import Modal from '../components/Modal'
import EmptyState from '../components/EmptyState'
import EmailComposeModal from '../components/EmailComposeModal'
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
import {
  deleteZohoCalendarEvent,
  isZohoCalendarEnabled,
  isZohoMailEnabled,
  syncFollowUpToZohoCalendar,
} from '../lib/zoho'
import {
  buttonPrimaryStyle,
  buttonSecondaryStyle,
  cardStyle,
  colors,
  inputStyle,
  labelStyle,
  pageStyle,
  pageSubtitleStyle,
  pageTitleStyle,
  sectionTitleStyle,
} from '../lib/uiStyles'
import { logActivity } from '../lib/activity'

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
  const [entries, setEntries] = useState<CrmEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [updateTarget, setUpdateTarget] = useState<CrmEntry | null>(null)
  const [updateText, setUpdateText] = useState('')
  const [updateFollowDate, setUpdateFollowDate] = useState('')
  const [updateStage, setUpdateStage] = useState('')
  const [updateNextAction, setUpdateNextAction] = useState('')
  const [updateClearDate, setUpdateClearDate] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [emailTarget, setEmailTarget] = useState<CrmEntry | null>(null)

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
          `WhatsApp ready · ${doc.kind === 'quote' ? 'Quotation' : 'Invoice'} ${doc.ref}`,
          'success',
        )
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not prepare WhatsApp message', 'error')
    } finally {
      setBusyId(null)
    }
  }

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data, error: err } = await db
        .from('crm')
        .select('*')
        .not('follow_up_date', 'is', null)
        .order('follow_up_date', { ascending: true })
      if (err) throw err
      setEntries((data || []) as CrmEntry[])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load follow-ups')
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

      if (isZohoCalendarEnabled(settings)) {
        try {
          const contacts = hydrateContacts(entry)
          const p = primaryContact(contacts)
          const eventId = await syncFollowUpToZohoCalendar(settings, {
            company: entry.company_name,
            nextAction: entry.next_action,
            owner: entry.owner,
            contactName: p?.name,
            contactEmail: p?.email,
            followUpDate: next,
            existingEventId: entry.calendar_event_id || undefined,
          })
          if (eventId) patch.calendar_event_id = eventId
        } catch (calErr) {
          showToast(
            calErr instanceof Error
              ? `Snoozed locally; Zoho Calendar: ${calErr.message}`
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
      showToast(e instanceof Error ? e.message : 'Snooze failed', 'error')
    } finally {
      setBusyId(null)
    }
  }

  async function clearFollowUp(entry: CrmEntry) {
    setBusyId(entry.id)
    try {
      if (isZohoCalendarEnabled(settings) && entry.calendar_event_id) {
        try {
          await deleteZohoCalendarEvent(settings, entry.calendar_event_id)
        } catch (calErr) {
          showToast(
            calErr instanceof Error
              ? `Cleared locally; Zoho Calendar: ${calErr.message}`
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
      showToast(e instanceof Error ? e.message : 'Clear failed', 'error')
    } finally {
      setBusyId(null)
    }
  }

  async function saveUpdate() {
    if (!updateTarget || !updateText.trim()) return
    setBusyId(updateTarget.id)
    try {
      const { error: err } = await db.from('follow_up_updates').insert({
        crm_id: updateTarget.id,
        company: updateTarget.company_name,
        update_text: updateText.trim(),
        user_email: user?.email || '',
      })
      if (err) throw err

      const patch: Record<string, unknown> = {
        updated_by: user?.email || '',
        updated_at: new Date().toISOString(),
      }
      if (updateStage) patch.pipeline_stage = updateStage
      if (updateNextAction) patch.next_action = updateNextAction

      let nextDate: string | null | undefined
      if (updateClearDate) {
        nextDate = null
        patch.follow_up_date = null
      } else if (updateFollowDate) {
        nextDate = updateFollowDate
        patch.follow_up_date = updateFollowDate
      }

      if (isZohoCalendarEnabled(settings) && nextDate !== undefined) {
        try {
          const contacts = hydrateContacts(updateTarget)
          const p = primaryContact(contacts)
          if (nextDate) {
            const eventId = await syncFollowUpToZohoCalendar(settings, {
              company: updateTarget.company_name,
              nextAction: (patch.next_action as string) || updateTarget.next_action,
              owner: updateTarget.owner,
              contactName: p?.name,
              contactEmail: p?.email,
              followUpDate: nextDate,
              existingEventId: updateTarget.calendar_event_id || undefined,
            })
            if (eventId) patch.calendar_event_id = eventId
          } else if (updateTarget.calendar_event_id) {
            await deleteZohoCalendarEvent(settings, updateTarget.calendar_event_id)
            patch.calendar_event_id = ''
          }
        } catch (calErr) {
          showToast(
            calErr instanceof Error
              ? `Saved locally; Zoho Calendar: ${calErr.message}`
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
        updateText.trim().slice(0, 120),
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
      showToast(e instanceof Error ? e.message : 'Failed to save update', 'error')
    } finally {
      setBusyId(null)
    }
  }

  function renderCard(entry: CrmEntry, tone: 'overdue' | 'upcoming') {
    const accent = tone === 'overdue' ? colors.danger : colors.success
    const busy = busyId === entry.id
    const contacts = hydrateContacts(entry)
    const p = primaryContact(contacts)
    const contactLabel =
      contacts.length > 1
        ? `${p?.name || '—'} +${contacts.length - 1}`
        : p?.name || entry.primary_contact || '—'

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
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" style={buttonSecondaryStyle} disabled={busy} onClick={() => void snooze(entry)}>
            Snooze +7d
          </button>
          <button type="button" style={buttonSecondaryStyle} disabled={busy} onClick={() => void clearFollowUp(entry)}>
            Clear
          </button>
          <button
            type="button"
            style={buttonSecondaryStyle}
            disabled={busy}
            onClick={() => setEmailTarget(entry)}
          >
            <Mail size={14} /> Email
          </button>
          <button
            type="button"
            style={buttonSecondaryStyle}
            disabled={busy}
            onClick={() => void openFollowUpWhatsApp(entry)}
          >
            <MessageCircle size={14} /> WhatsApp
          </button>
          <button
            type="button"
            style={buttonSecondaryStyle}
            disabled={busy}
            onClick={() => {
              setUpdateTarget(entry)
              setUpdateText('')
              setUpdateFollowDate(entry.follow_up_date ? entry.follow_up_date.slice(0, 10) : '')
              setUpdateStage(entry.pipeline_stage || 'Lead')
              setUpdateNextAction(entry.next_action || '')
              setUpdateClearDate(false)
            }}
          >
            <MessageSquarePlus size={14} /> Add Update
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={pageStyle}>
      <h1 style={pageTitleStyle}>Follow-ups</h1>
      <p style={pageSubtitleStyle}>
        Overdue and upcoming CRM actions
        {isZohoCalendarEnabled(settings) ? ' · Zoho Calendar sync on' : ''}
      </p>

      {error ? (
        <div style={{ ...cardStyle, color: colors.danger, marginBottom: 16 }}>{error}</div>
      ) : null}

      {loading ? (
        <div style={{ ...cardStyle, color: colors.muted }}>Loading follow-ups…</div>
      ) : (
        <>
          <section style={{ marginBottom: 28 }}>
            <h2 style={{ ...sectionTitleStyle, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Bell size={16} color={colors.danger} /> Overdue ({overdue.length})
            </h2>
            {overdue.length === 0 ? (
              <EmptyState title="No overdue follow-ups" subtitle="You're caught up on past due items." />
            ) : (
              <div style={{ display: 'grid', gap: 12 }}>{overdue.map((e) => renderCard(e, 'overdue'))}</div>
            )}
          </section>

          <section>
            <h2 style={{ ...sectionTitleStyle, display: 'flex', alignItems: 'center', gap: 8 }}>
              <CalendarClock size={16} color={colors.success} /> Upcoming (14 days) ({upcoming.length})
            </h2>
            {upcoming.length === 0 ? (
              <EmptyState title="No upcoming follow-ups" subtitle="Nothing scheduled in the next two weeks." />
            ) : (
              <div style={{ display: 'grid', gap: 12 }}>{upcoming.map((e) => renderCard(e, 'upcoming'))}</div>
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
        zohoEnabled={isZohoMailEnabled(settings)}
        onClose={() => setEmailTarget(null)}
      />
    </div>
  )
}
