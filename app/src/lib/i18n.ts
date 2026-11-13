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
    'guide.title': 'How we work in RR Central',
    'guide.body':
      'Short paths for the sales day: My Day briefing, Pipeline board, quotations, support tickets, and NDAs in the vault.',
    'guide.back': 'Back to app',
    'guide.crm.myday.title': 'My Day',
    'guide.crm.myday.body':
      'Start here each morning. Log touches, set the next action and follow-up date, and mark Won or Lost with a reason.',
    'guide.crm.myday.link': 'Open My Day',
    'guide.crm.pipeline.title': 'Pipeline',
    'guide.crm.pipeline.body':
      'One board for CRM, sales, and CTRM deals. Move stages and edit next step, owner, and notes without leaving the board.',
    'guide.crm.pipeline.link': 'Open Pipeline',
    'guide.crm.quotes.title': 'Quotations',
    'guide.crm.quotes.body':
      'Draft with a client and lines, finalize for a reference, then convert to invoice or delivery note when ready.',
    'guide.crm.quotes.link': 'Open quotations',
    'guide.crm.support.title': 'Support',
    'guide.crm.support.body':
      'Open tickets against an account, reply or add an internal note, and keep SLA packages honest.',
    'guide.crm.support.link': 'Open support',
    'guide.crm.contracts.title': 'Contracts vault',
    'guide.crm.contracts.body':
      'From a My Day company, create an NDA draft for the right signer, send for signature, and track obligations after sign.',
    'guide.crm.contracts.link': 'Open My Day (vault on the company)',
  },
  ar: {
    'shell.company': 'الشركة',
    'shell.signOut': 'تسجيل الخروج',
    'guide.title': 'كيف نعمل في RR Central',
    'guide.body':
      'مسارات قصيرة ليوم المبيعات: ملخص يومي، لوحة الصفقات، عروض الأسعار، تذاكر الدعم، واتفاقيات السرية في الخزنة.',
    'guide.back': 'العودة إلى التطبيق',
    'guide.crm.myday.title': 'يومي',
    'guide.crm.myday.body':
      'ابدأ من هنا كل صباح. سجّل التواصل، حدّد الخطوة التالية وتاريخ المتابعة، وعلّم ربح أو خسارة مع السبب.',
    'guide.crm.myday.link': 'فتح يومي',
    'guide.crm.pipeline.title': 'خط الأنابيب',
    'guide.crm.pipeline.body':
      'لوحة واحدة لصفقات CRM والمبيعات وCTRM. انقل المراحل وعدّل الخطوة التالية والمالك والملاحظات دون مغادرة اللوحة.',
    'guide.crm.pipeline.link': 'فتح خط الأنابيب',
    'guide.crm.quotes.title': 'عروض الأسعار',
    'guide.crm.quotes.body':
      'صغ العرض مع العميل والبنود، ثم اعتمد المرجع، ثم حوّل إلى فاتورة أو مذكرة تسليم عند الجاهزية.',
    'guide.crm.quotes.link': 'فتح عروض الأسعار',
    'guide.crm.support.title': 'الدعم',
    'guide.crm.support.body':
      'افتح تذاكر على الحساب، أرسل رداً أو ملاحظة داخلية، وحافظ على حزم اتفاقية مستوى الخدمة.',
    'guide.crm.support.link': 'فتح الدعم',
    'guide.crm.contracts.title': 'خزنة العقود',
    'guide.crm.contracts.body':
      'من شركة في يومي، أنشئ مسودة NDA للموقّع الصحيح، أرسل للتوقيع، وتابع الالتزامات بعد التوقيع.',
    'guide.crm.contracts.link': 'فتح يومي (الخزنة على الشركة)',
  },
}

export function t(locale: Locale, key: string): string {
  return STRINGS[locale]?.[key] ?? STRINGS.en[key] ?? key
}

export function localeDir(locale: Locale): 'ltr' | 'rtl' {
  return LOCALES.find((l) => l.id === locale)?.dir ?? 'ltr'
}

export const LOCALE_STORAGE_KEY = 'rrcentral_locale'
