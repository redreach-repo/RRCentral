import { useEffect } from 'react'
import { listAccounts } from '../lib/accountsStore'
import { listContracts, listTimeEntries } from '../lib/deliveryStore'
import {
  clientsWithoutHoursThisWeek,
  fridayReminderMessage,
  markFridayReminderSent,
  shouldSendFridayReminder,
  weekStartKey,
} from '../lib/timeTracking'

const CHECK_MS = 30 * 60 * 1000

/**
 * From Friday, one desktop notification a week listing AI CRM clients with
 * no hours logged since Monday. Uses the same permission as the follow-up
 * reminders. The dashboard shows the same list for people without it.
 */
export function useFridayHoursReminder(enabled: boolean, permission: string) {
  useEffect(() => {
    if (!enabled) return
    let alive = true
    const check = async () => {
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
      if (!shouldSendFridayReminder()) return
      try {
        const now = new Date()
        const [{ rows: accounts }, contracts, entries] = await Promise.all([
          listAccounts(),
          listContracts(),
          listTimeEntries(undefined, weekStartKey(now)),
        ])
        if (!alive) return
        const missing = clientsWithoutHoursThisWeek({ accounts, contracts, entries, today: now })
        const message = fridayReminderMessage(missing.map((a) => a.name))
        if (message) new Notification('RED REACH Central: hours this week', { body: message, tag: 'rr-friday-hours' })
        markFridayReminderSent(now)
      } catch {
        // Best effort; the dashboard shows the list too.
      }
    }
    void check()
    const id = window.setInterval(() => void check(), CHECK_MS)
    return () => {
      alive = false
      window.clearInterval(id)
    }
  }, [enabled, permission])
}
