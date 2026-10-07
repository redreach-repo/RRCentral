'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { Locale } from '@/lib/i18n'
import { copy, t } from '@/lib/i18n'

const STORAGE_KEY = 'teetribe-locale'

type LocaleContextValue = {
  locale: Locale
  dir: 'ltr' | 'rtl'
  setLocale: (locale: Locale) => void
  t: (key: keyof (typeof copy)['en']) => string
}

const LocaleContext = createContext<LocaleContextValue | null>(null)

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('en')

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as Locale | null
      if (stored === 'en' || stored === 'ar') setLocaleState(stored)
    } catch {
      /* ignore */
    }
  }, [])

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next)
    localStorage.setItem(STORAGE_KEY, next)
    document.documentElement.lang = next
    document.documentElement.dir = next === 'ar' ? 'rtl' : 'ltr'
  }, [])

  useEffect(() => {
    document.documentElement.lang = locale
    document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr'
  }, [locale])

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      dir: locale === 'ar' ? ('rtl' as const) : ('ltr' as const),
      setLocale,
      t: (key: keyof (typeof copy)['en']) => t(locale, key),
    }),
    [locale, setLocale],
  )

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}

export function useLocale() {
  const ctx = useContext(LocaleContext)
  if (!ctx) throw new Error('useLocale must be used within LocaleProvider')
  return ctx
}
