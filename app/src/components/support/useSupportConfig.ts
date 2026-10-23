import { useEffect, useMemo, useState } from 'react'
import { useSettings } from '../../contexts/SettingsContext'
import { calendarFromSettings } from '../../lib/sla'
import { listPolicies } from '../../lib/supportStore'
import type { SlaPolicy } from '../../lib/types'

/** SLA policies and the working week, for opening tickets. */
export function useSupportConfig() {
  const { settings } = useSettings()
  const calendar = useMemo(() => calendarFromSettings(settings), [settings])
  const [policies, setPolicies] = useState<SlaPolicy[]>([])
  useEffect(() => {
    let alive = true
    listPolicies()
      .then((p) => alive && setPolicies(p))
      .catch(() => alive && setPolicies([]))
    return () => {
      alive = false
    }
  }, [])
  return { calendar, policies }
}
