import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  LOCALE_STORAGE_KEY,
  localeDir,
  t as translate,
  type Locale,
} from '../lib/i18n'

type I18nValue = {
  locale: Locale
  dir: 'ltr' | 'rtl'
  setLocale: (next: Locale) => void
  t: (key: string) => string
}

const I18nContext = createContext<I18nValue | undefined>(undefined)

function readStoredLocale(): Locale {
  try {
    const raw = localStorage.getItem(LOCALE_STORAGE_KEY)
    if (raw === 'ar' || raw === 'en') return raw
  } catch {
    /* ignore */
  }
  return 'en'
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => readStoredLocale())

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next)
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, next)
    } catch {
      /* ignore */
    }
  }, [])

  const dir = localeDir(locale)

  useEffect(() => {
    document.documentElement.lang = locale
    document.documentElement.dir = dir
  }, [locale, dir])

  const t = useCallback((key: string) => translate(locale, key), [locale])

  const value = useMemo(
    () => ({ locale, dir, setLocale, t }),
    [locale, dir, setLocale, t],
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used within an I18nProvider')
  return ctx
}
