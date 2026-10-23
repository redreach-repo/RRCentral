import { useCallback, useEffect, useState } from 'react'
import { TIMER_EVENT, clearTimer, readTimer, saveTimer, type RunningTimer } from '../lib/timeTracking'

/**
 * The person's running timer, shared by the client page and the top bar.
 * Kept in this browser, so it survives a reload or a closed tab. `now`
 * ticks every 15 seconds while a timer runs.
 */
export function useRunningTimer(email: string | undefined) {
  const [timer, setTimer] = useState<RunningTimer | null>(() => readTimer(email || ''))
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const sync = () => setTimer(readTimer(email || ''))
    sync()
    window.addEventListener(TIMER_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(TIMER_EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [email])

  useEffect(() => {
    if (!timer) return
    setNow(new Date())
    const id = window.setInterval(() => setNow(new Date()), 15_000)
    return () => window.clearInterval(id)
  }, [timer])

  const start = useCallback(
    (next: Omit<RunningTimer, 'startedAt'>) => {
      if (!email) return
      saveTimer(email, { ...next, startedAt: new Date().toISOString() })
    },
    [email],
  )

  const clear = useCallback(() => {
    if (email) clearTimer(email)
  }, [email])

  return { timer, now, start, clear }
}
