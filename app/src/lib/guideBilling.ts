/** Second in-app guide content pack: billing and money paths (EN ids; copy via i18n). */

import type { GuideCrmSection } from './guideCrm'

export type GuideBillingSection = GuideCrmSection

export const GUIDE_BILLING_SECTIONS: GuideBillingSection[] = [
  {
    id: 'invoices',
    titleKey: 'guide.billing.invoices.title',
    bodyKey: 'guide.billing.invoices.body',
    to: '/invoices',
    linkKey: 'guide.billing.invoices.link',
  },
  {
    id: 'payments',
    titleKey: 'guide.billing.payments.title',
    bodyKey: 'guide.billing.payments.body',
    to: '/payments',
    linkKey: 'guide.billing.payments.link',
  },
  {
    id: 'deliveryNotes',
    titleKey: 'guide.billing.deliveryNotes.title',
    bodyKey: 'guide.billing.deliveryNotes.body',
    to: '/delivery-notes',
    linkKey: 'guide.billing.deliveryNotes.link',
  },
  {
    id: 'expenses',
    titleKey: 'guide.billing.expenses.title',
    bodyKey: 'guide.billing.expenses.body',
    to: '/expenses',
    linkKey: 'guide.billing.expenses.link',
  },
  {
    id: 'digest',
    titleKey: 'guide.billing.digest.title',
    bodyKey: 'guide.billing.digest.body',
    to: '/delivery-settings',
    linkKey: 'guide.billing.digest.link',
  },
]
