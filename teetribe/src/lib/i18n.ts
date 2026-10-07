export type Locale = 'en' | 'ar'

export const copy = {
  en: {
    shop: 'Shop',
    drops: 'Drops',
    tribeMade: 'Tribe Made',
    family: 'Tribe Family',
    about: 'About',
    cart: 'Cart',
    addToCart: 'Add to bag',
    freeDelivery: 'Free UAE delivery over AED 200',
    whyTitle: 'Why Tee Tribe',
    memberCta: 'Join the Tribe — 10% off your first order',
    tayoHi: 'Hey, I’m Tayo. Need a size, a gift idea, or delivery scoop?',
  },
  ar: {
    shop: 'تسوق',
    drops: 'الإصدارات',
    tribeMade: 'صُنع للقبيلة',
    family: 'عائلة تي تريب',
    about: 'من نحن',
    cart: 'السلة',
    addToCart: 'أضف إلى الحقيبة',
    freeDelivery: 'توصيل مجاني داخل الإمارات فوق ٢٠٠ درهم',
    whyTitle: 'لماذا تي تريب',
    memberCta: 'انضم للقبيلة — خصم ١٠٪ على أول طلب',
    tayoHi: 'مرحباً، أنا تايو. مقاس؟ هدية؟ توصيل؟',
  },
} as const

export function t(locale: Locale, key: keyof (typeof copy)['en']): string {
  return copy[locale][key] || copy.en[key]
}
