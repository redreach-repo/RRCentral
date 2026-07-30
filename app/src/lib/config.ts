export const DIVISIONS = [
  { code: '01', brand: 'RR Threads', category: 'Uniforms' },
  { code: '02', brand: 'RR Wanders', category: 'Tours' },
  { code: '03', brand: 'RR Marketing', category: 'SEO and Marketing' },
  { code: '04', brand: 'RR Connect', category: 'Virtual Assistance' },
  { code: '05', brand: 'RR Care', category: 'Medical Tours / Care' },
  { code: '06', brand: 'RR Trading', category: 'Trading' },
] as const

export const QUOTE_STATUSES = [
  'Draft',
  'Finalized',
  'Sent',
  'Awarded',
  'Not awarded',
  'Expired',
  'Superseded',
] as const

export const INVOICE_STATUSES = ['Draft', 'Sent', 'Awarded', 'Cancelled'] as const

export const PAYMENT_STATUSES = ['Pending', 'Partial', 'Paid', 'Overdue'] as const

export const NEXT_ACTIONS = [
  'Call',
  'WhatsApp',
  'Email',
  'Visit/meeting',
  'Send quotation',
  'Follow up on quote',
  'Collect payment',
  'Send samples',
  'Awaiting client',
  'Other',
] as const

/** CRM sales pipeline stages (company-level). */
export const PIPELINE_STAGES = [
  'Lead',
  'Contacted',
  'Quoted',
  'Negotiation',
  'Won',
  'Lost',
] as const

export const CRM_OUTCOME_REASONS = [
  'Price',
  'Competitor won',
  'Timing / budget',
  'Scope mismatch',
  'No response',
  'Relationship',
  'Other',
] as const

export const PAYMENT_TERMS = [
  'Immediate upon delivery',
  '50% Advance, 50% on delivery',
  '30% Advance, 70% on delivery',
  '70% Advance, 30% on delivery',
  '100% Advance',
  'Cash on Delivery',
  'Net 7 days',
  'Net 15 days',
  'Net 30 days',
  'Letter of Credit',
  'As per agreement',
] as const

export const DELIVERY_TERMS = [
  '1 week',
  '2 weeks',
  '3 weeks',
  '4 weeks',
  'Ex-stock',
  '7-10 working days',
  '2-3 weeks',
  'Immediate',
  'As agreed',
  'TBC',
] as const

export const PAYMENT_METHODS = [
  'Bank Transfer',
  'Cash',
  'Card',
  'Cheque',
  'Cheque or Bank Transfer',
  'Other',
] as const

export const FABRIC_OPTIONS = ['', 'GB', 'PV', 'TW'] as const

export const VAT_RATE = 0.05
