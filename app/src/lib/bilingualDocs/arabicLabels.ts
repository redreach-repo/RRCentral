/**
 * Arabic bilingual PDFs (docs/modules/arabic-bilingual-pdfs.md).
 *
 * Fixed document labels in English with their Arabic. Only labels are
 * translated: names, descriptions, terms and notes print as typed (type them
 * in Arabic too if you need them in Arabic). Amounts keep Western digits,
 * which is normal on UAE invoices.
 *
 * NEEDS REVIEW: these translations were written by the build, not by a
 * native speaker or a tax adviser. Have them checked before sending a
 * bilingual tax invoice to a client.
 */

export const ARABIC_DOC_LABELS: Record<string, string> = {
  // Titles
  'tax invoice': 'فاتورة ضريبية',
  'proforma invoice': 'فاتورة مبدئية',
  'quotation': 'عرض سعر',
  'delivery note': 'إشعار تسليم',
  'travel proposal & quotation': 'عرض سفر وعرض سعر',
  'marketing proposal': 'عرض تسويقي',
  'virtual assistance quotation': 'عرض سعر للمساعدة الافتراضية',
  'care / medical travel quotation': 'عرض سعر للرعاية والسفر العلاجي',
  'trading quotation': 'عرض سعر تجاري',
  // Meta
  'date': 'التاريخ',
  'valid until': 'صالح حتى',
  'delivery': 'التسليم',
  'payment': 'الدفع',
  'status': 'الحالة',
  'trn': 'الرقم الضريبي',
  'attn': 'عناية',
  'tel': 'هاتف',
  // Section headings (division formats)
  'bill to': 'فاتورة إلى',
  'billing': 'الفوترة',
  'buyer': 'المشتري',
  'client': 'العميل',
  'prepared for': 'مُعد لـ',
  'deliver to': 'التسليم إلى',
  'against quotation': 'مقابل عرض السعر',
  'goods delivered': 'البضائع المسلّمة',
  'order summary': 'ملخص الطلب',
  'trip overview': 'نظرة عامة على الرحلة',
  'engagement overview': 'نظرة عامة على الارتباط',
  'care overview': 'نظرة عامة على الرعاية',
  'requirement': 'المتطلبات',
  'service arrangement': 'ترتيب الخدمة',
  'uniform line items': 'بنود الزي الموحد',
  'package & services': 'الباقة والخدمات',
  'services & retainers': 'الخدمات والاشتراكات',
  'hours & services': 'الساعات والخدمات',
  'items / lots': 'البنود / الدفعات',
  'services': 'الخدمات',
  'payment & delivery': 'الدفع والتسليم',
  'deposit, balance & payment': 'العربون والرصيد والدفع',
  'fees & payment': 'الرسوم والدفع',
  'notes / terms': 'ملاحظات / شروط',
  'notes': 'ملاحظات',
  'scope notes': 'ملاحظات النطاق',
  'service notes': 'ملاحظات الخدمة',
  'trading notes': 'ملاحظات تجارية',
  'rr wanders terms': 'شروط RR Wanders',
  // Columns
  'description': 'الوصف',
  'sku': 'رمز الصنف',
  'sizes': 'المقاسات',
  'qty': 'الكمية',
  'unit': 'الوحدة',
  'unit price': 'سعر الوحدة',
  'amount': 'المبلغ',
  'vat': 'ضريبة القيمة المضافة',
  'total': 'الإجمالي',
  'hours': 'الساعات',
  'rate/hr': 'السعر/ساعة',
  'period': 'الفترة',
  // Totals
  'subtotal': 'المجموع الفرعي',
  'discount': 'الخصم',
  'total qty': 'إجمالي الكمية',
  'payment terms': 'شروط الدفع',
  'no line items': 'لا توجد بنود',
  'moq': 'الحد الأدنى للطلب',
}

const norm = (s: string) => s.trim().replace(/\s+/g, ' ').replace(/:$/, '').toLowerCase()

/**
 * Arabic for an English label, or '' when there is none (custom titles and
 * headings typed in Settings stay English only). For "VAT (5%)" or
 * "Total (AED)" it returns the Arabic for the words only: the English half
 * already shows the rate or currency.
 */
export function arabicFor(english: string): string {
  if (!english) return ''
  const direct = ARABIC_DOC_LABELS[norm(english)]
  if (direct) return direct
  const m = english.match(/^(.*?)\s*(\([^)]*\))\s*$/)
  if (m) {
    const head = ARABIC_DOC_LABELS[norm(m[1])]
    if (head) return head
  }
  return ''
}

export const BILINGUAL_STORAGE_KEY = 'rr.documents.bilingual'

export function readBilingualPreference(): boolean {
  try {
    return globalThis.localStorage?.getItem(BILINGUAL_STORAGE_KEY) === 'yes'
  } catch {
    return false
  }
}

export function saveBilingualPreference(on: boolean): void {
  try {
    globalThis.localStorage?.setItem(BILINGUAL_STORAGE_KEY, on ? 'yes' : 'no')
  } catch {
    /* private window: the toggle still works for this visit */
  }
}

/** Fonts that shape Arabic well in the browser (the PDF is drawn from the page). */
export const ARABIC_FONT_STACK =
  "'Noto Naskh Arabic', 'Noto Sans Arabic', 'Geeza Pro', 'Segoe UI', Tahoma, 'Arial Unicode MS', sans-serif"
