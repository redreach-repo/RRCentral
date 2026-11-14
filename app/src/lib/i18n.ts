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
      'Short paths for the sales day and for money: My Day, Pipeline, quotations, support, NDAs, then invoices, payments, delivery notes, expenses, and the morning digest.',
    'guide.back': 'Back to app',
    'guide.pack.crm': 'Sales day',
    'guide.pack.billing': 'Billing and money',
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
    'guide.billing.invoices.title': 'Invoices',
    'guide.billing.invoices.body':
      'Raise from a quote or by hand, finalize for an RR number, send pay links, and mark paid when the money lands.',
    'guide.billing.invoices.link': 'Open invoices',
    'guide.billing.payments.title': 'Payments',
    'guide.billing.payments.body':
      'Record bank transfers and card settlements against invoices so reports and the digest stay honest.',
    'guide.billing.payments.link': 'Open payments',
    'guide.billing.deliveryNotes.title': 'Delivery notes',
    'guide.billing.deliveryNotes.body':
      'Issue a DN from a quote or invoice, get it signed, and file the copy under the client in Google Drive.',
    'guide.billing.deliveryNotes.link': 'Open delivery notes',
    'guide.billing.expenses.title': 'Expenses',
    'guide.billing.expenses.body':
      'Log supplier bills and costs, optionally against a quote, so gross profit on deals stays visible.',
    'guide.billing.expenses.link': 'Open expenses',
    'guide.billing.digest.title': 'Morning digest',
    'guide.billing.digest.body':
      'On Packages and rates, add who gets the morning email or WhatsApp of what needs attention (tickets, renewals, outbox activity).',
    'guide.billing.digest.link': 'Open Packages and rates',
  },
  ar: {
    'shell.company': 'الشركة',
    'shell.signOut': 'تسجيل الخروج',
    'guide.title': 'كيف نعمل في RR Central',
    'guide.body':
      'مسارات قصيرة ليوم المبيعات والمال: يومي، لوحة الصفقات، عروض الأسعار، الدعم، اتفاقيات السرية، ثم الفواتير والمدفوعات ومذكرات التسليم والمصروفات والملخص الصباحي.',
    'guide.back': 'العودة إلى التطبيق',
    'guide.pack.crm': 'يوم المبيعات',
    'guide.pack.billing': 'الفوترة والمال',
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
    'guide.billing.invoices.title': 'الفواتير',
    'guide.billing.invoices.body':
      'أنشئ من عرض أو يدوياً، اعتمد رقم RR، أرسل رابط الدفع، وعلّم مدفوعاً عند وصول المال.',
    'guide.billing.invoices.link': 'فتح الفواتير',
    'guide.billing.payments.title': 'المدفوعات',
    'guide.billing.payments.body':
      'سجّل التحويلات البنكية ومدفوعات البطاقة على الفواتير حتى تبقى التقارير والملخص صادقة.',
    'guide.billing.payments.link': 'فتح المدفوعات',
    'guide.billing.deliveryNotes.title': 'مذكرات التسليم',
    'guide.billing.deliveryNotes.body':
      'أصدر مذكرة من عرض أو فاتورة، احصل على التوقيع، واحفظ النسخة تحت العميل في Google Drive.',
    'guide.billing.deliveryNotes.link': 'فتح مذكرات التسليم',
    'guide.billing.expenses.title': 'المصروفات',
    'guide.billing.expenses.body':
      'سجّل فواتير الموردين والتكاليف، اختيارياً مقابل عرض، حتى يبقى إجمالي ربح الصفقات واضحاً.',
    'guide.billing.expenses.link': 'فتح المصروفات',
    'guide.billing.digest.title': 'الملخص الصباحي',
    'guide.billing.digest.body':
      'في الحزم والأسعار، أضف من يتلقى بريد أو واتساب الصباح بما يحتاج انتباهاً (التذاكر والتجديدات ونشاط الصندوق).',
    'guide.billing.digest.link': 'فتح الحزم والأسعار',
  },
}

export function t(locale: Locale, key: string): string {
  return STRINGS[locale]?.[key] ?? STRINGS.en[key] ?? key
}

export function localeDir(locale: Locale): 'ltr' | 'rtl' {
  return LOCALES.find((l) => l.id === locale)?.dir ?? 'ltr'
}

export const LOCALE_STORAGE_KEY = 'rrcentral_locale'
