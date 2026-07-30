import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { db } from '../lib/db'
import type { AppSetting } from '../lib/types'

interface SettingsContextValue {
  settings: Record<string, string>
  updateSetting: (key: string, value: string) => Promise<void>
  refresh: () => Promise<void>
  loading: boolean
}

const SettingsContext = createContext<SettingsContextValue | undefined>(undefined)

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const { data, error } = await db.from('app_settings').select('key, value')
    if (!error && data) {
      const map: Record<string, string> = {}
      for (const row of data as AppSetting[]) {
        map[row.key] = row.value
      }
      setSettings(map)
    }
  }, [])

  useEffect(() => {
    let mounted = true

    async function loadSettings() {
      await refresh()
      if (mounted) setLoading(false)
    }

    void loadSettings()

    return () => {
      mounted = false
    }
  }, [refresh])

  const updateSetting = useCallback(async (key: string, value: string) => {
    const { error } = await db
      .from('app_settings')
      .upsert({ key, value }, { onConflict: 'key' })

    if (error) throw error

    setSettings((prev) => ({ ...prev, [key]: value }))
  }, [])

  const value = useMemo(
    () => ({ settings, updateSetting, refresh, loading }),
    [settings, updateSetting, refresh, loading],
  )

  return (
    <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
  )
}

export function useSettings() {
  const context = useContext(SettingsContext)
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider')
  }
  return context
}
