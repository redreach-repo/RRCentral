import { useCallback, useEffect, useState } from 'react'
import { db } from '../lib/db'
import { resolveSalesOwnerName } from '../lib/crmWorkQueue'
import {
  markNotifiedToday,
  reminderCounts,
  reminderMessage,
  shouldNotifyToday,
  type ReminderCounts,
} from '../lib/followUpReminders'
import type { CrmEntry } from '../lib/types'

const REFRESH_MS = 10 * 60 * 1000

type NotificationState = 'unsupported' | NotificationPermission

function notificationState(): NotificationState {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
}

/**
 * Due follow-up counts for the sidebar badge, refreshed every 10 minutes and
 * when the tab regains focus. With permission, shows one desktop notification
 * per day when anything is overdue or due today.
 */
export function useFollowUpReminders(userEmail: string | undefined) {
  const [counts, setCounts] = useState<ReminderCounts>({ overdue: 0, today: 0, mine: 0 })
  const [permission, setPermission] = useState<NotificationState>(notificationState)

  const refresh = useCallback(async () => {
    if (!userEmail) return
    try {
      const [{ data: deals }, { data: users }] = await Promise.all([
        db
          .from('crm')
          .select('id, company_name, follow_up_date, owner, pipeline_stage')
          .not('follow_up_date', 'is', null),
        db.from('app_users').select('email, name'),
      ])
      const owner = resolveSalesOwnerName(userEmail, (users || []) as { email: string; name: string }[])
      const next = reminderCounts((deals || []) as CrmEntry[], owner)
      setCounts(next)

      const message = reminderMessage(next)
      if (message && notificationState() === 'granted' && shouldNotifyToday()) {
        new Notification('RED REACH Central', { body: message, tag: 'rr-followups' })
        markNotifiedToday()
      }
    } catch {
      // Reminders are best-effort; the Follow-ups page shows real errors.
    }
  }, [userEmail])

  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => void refresh(), REFRESH_MS)
    const onFocus = () => void refresh()
    window.addEventListener('focus', onFocus)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [refresh])

  const enableNotifications = useCallback(async () => {
    if (typeof Notification === 'undefined') return
    const result = await Notification.requestPermission()
    setPermission(result)
    if (result === 'granted') void refresh()
  }, [refresh])

  return { counts, due: counts.overdue + counts.today, permission, enableNotifications, refresh }
}
