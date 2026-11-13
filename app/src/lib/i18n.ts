/** M1 i18n skeleton — EN default, AR RTL ready. Full catalogs land later. */

export type Locale = 'en' | 'ar'

export const LOCALES: { id: Locale; label: string; dir: 'ltr' | 'rtl' }[] = [
  { id: 'en', label: 'English', dir: 'ltr' },
  { id: 'ar', label: 'العربية', dir: 'rtl' },
]

const STRINGS: Record<Locale, Record<string, string>> = {
  en: {
    'shell.company': 'Company',
    'shell.signOut': 'Sign out',
    'guide.title': 'Guide',
    'guide.body': 'In-app guide for RR Central. Content packs arrive with later milestones.',
    'guide.back': 'Back to app',
  },
  ar: {
    'shell.company': 'الشركة',
    'shell.signOut': 'تسجيل الخروج',
    'guide.title': 'الدليل',
    'guide.body': 'دليل داخل التطبيق لـ RR Central. ستصل حزم المحتوى في المراحل اللاحقة.',
    'guide.back': 'العودة إلى التطبيق',
  },
}

export function t(locale: Locale, key: string): string {
  return STRINGS[locale]?.[key] ?? STRINGS.en[key] ?? key
}

export function localeDir(locale: Locale): 'ltr' | 'rtl' {
  return LOCALES.find((l) => l.id === locale)?.dir ?? 'ltr'
}

export const LOCALE_STORAGE_KEY = 'rrcentral_locale'
