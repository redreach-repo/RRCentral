import type { ExtensionStrings } from '../types'

/** Strings for masked sensitive values and the Reveal action (A1 field-level encryption). */
const strings: ExtensionStrings = {
  en: {
    'fle.section': 'Protected details',
    'fle.hint': 'Hidden by default. Revealing is logged, needs manager or admin rights, and is limited per 10 minutes.',
    'fle.reveal': 'Reveal',
    'fle.hide': 'Hide',
    'fle.revealing': 'Revealing…',
    'fle.reason': 'Why do you need to see it?',
    'fle.denied': 'You do not have permission to see this.',
    'fle.rateLimited': 'Too many reveals. Try again in a few minutes.',
    'fle.empty': 'Not set',
    'fle.notReady': 'Protected fields are not set up on this database yet.',
    'fle.field.hr.basic_salary': 'Basic salary',
    'fle.field.hr.iban': 'IBAN',
    'fle.field.hr.emirates_id': 'Emirates ID',
    'fle.field.hr.passport_no': 'Passport number',
    'fle.field.hr.national_id': 'National ID',
  },
  ar: {
    'fle.section': 'بيانات محمية',
    'fle.hint': 'مخفية افتراضياً. يتم تسجيل كل كشف، ويتطلب صلاحية مدير أو مسؤول، وله حد خلال 10 دقائق.',
    'fle.reveal': 'كشف',
    'fle.hide': 'إخفاء',
    'fle.revealing': 'جارٍ الكشف…',
    'fle.reason': 'لماذا تحتاج إلى رؤيتها؟',
    'fle.denied': 'ليست لديك صلاحية لرؤية هذه البيانات.',
    'fle.rateLimited': 'عدد كبير من طلبات الكشف. حاول مرة أخرى بعد بضع دقائق.',
    'fle.empty': 'غير محدد',
    'fle.notReady': 'الحقول المحمية غير مُعدّة في قاعدة البيانات بعد.',
    'fle.field.hr.basic_salary': 'الراتب الأساسي',
    'fle.field.hr.iban': 'رقم الآيبان',
    'fle.field.hr.emirates_id': 'رقم الهوية الإماراتية',
    'fle.field.hr.passport_no': 'رقم جواز السفر',
    'fle.field.hr.national_id': 'رقم الهوية الوطنية',
  },
}

export default strings
