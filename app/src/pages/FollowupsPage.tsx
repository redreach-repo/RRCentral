import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { addDays, differenceInCalendarDays, format, parseISO, startOfDay } from 'date-fns'
import { Bell, CalendarClock, MessageSquarePlus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { CrmEntry } from '../lib/types'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import Modal from '../components/Modal'
import EmptyState from '../components/EmptyState'
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
  const { showToast } = useToast()
  const [entries, setEntries] = useState<CrmEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [updateTarget, setUpdateTarget] = useState<CrmEntry | null>(null)
  const [updateText, setUpdateText] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data, error: err } = await supabase
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
      const { error: err } = await supabase
        .from('crm')
        .update({
          follow_up_date: next,
          updated_by: user?.email || '',
          updated_at: new Date().toISOString(),
        })
        .eq('id', entry.id)
      if (err) throw err
      await logActivity('snooze_followup', 'crm', entry.company_name, `Snoozed to ${next}`, user?.email || '')
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
      const { error: err } = await supabase
        .from('crm')
        .update({
          follow_up_date: null,
          updated_by: user?.email || '',
          updated_at: new Date().toISOString(),
        })
        .eq('id', entry.id)
      if (err) throw err
      await logActivity('clear_followup', 'crm', entry.company_name, 'Cleared follow-up date', user?.email || '')
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
      const { error: err } = await supabase.from('follow_up_updates').insert({
        crm_id: updateTarget.id,
        company: updateTarget.company_name,
        update_text: updateText.trim(),
        user_email: user?.email || '',
      })
      if (err) throw err
      await logActivity(
        'followup_update',
        'crm',
        updateTarget.company_name,
        updateText.trim().slice(0, 120),
        user?.email || '',
      )
      showToast('Update added', 'success')
      setUpdateTarget(null)
      setUpdateText('')
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to save update', 'error')
    } finally {
      setBusyId(null)
    }
  }

  function renderCard(entry: CrmEntry, tone: 'overdue' | 'upcoming') {
    const accent = tone === 'overdue' ? colors.danger : colors.success
    const busy = busyId === entry.id
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
              {entry.primary_contact || '—'} · {entry.next_action || 'No action'} · {entry.owner || 'Unassigned'}
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
            onClick={() => {
              setUpdateTarget(entry)
              setUpdateText('')
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
      <p style={pageSubtitleStyle}>Overdue and upcoming CRM actions</p>

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
        width={480}
      >
        <label style={labelStyle}>What happened?</label>
        <textarea
          style={{ ...inputStyle, minHeight: 110, resize: 'vertical', marginBottom: 16 }}
          value={updateText}
          onChange={(e) => setUpdateText(e.target.value)}
          placeholder="Called client, sent samples, awaiting reply…"
        />
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
          Saves to follow_up_updates. Use Clear if the follow-up is done.
        </p>
      </Modal>
    </div>
  )
}
