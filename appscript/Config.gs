/**
 * REDREACH Central — configuration & sheet schema
 * Bound to: RR Central file for accounting and Sales
 */

var CONFIG = {
  SPREADSHEET_ID: '1TEM8AaVxzJBE1puZFbfxZBJQbrMHNNjhcRVVjc1kbro',
  CURRENCY: 'AED',
  VAT_RATE: 0.05,
  COMPANY: {
    name: 'Red Reach Middle East FZE',
    brand: 'RED REACH',
    tagline: 'Multi-division commerce · UAE',
    address: 'P.O. Box 6641, Dubai, UAE',
    email: 'info@redreach.ae',
    phone: '',
    website: 'www.redreach.ae',
    trn: '',
    accountName: 'Red Reach Middle East FZE',
    bankName: 'Mashreq Bank',
    bankAccount: '019100599735',
    iban: 'AE230330000019100599735',
    swift: '',
    paymentTerms: 'Immediate upon delivery',
    paymentMethod: 'Cheque or Bank Transfer',
    quoteClosing: 'Thanking you and looking forward to your valued order',
    quoteTerms: 'Prices valid for quantities mentioned. Any deviation makes this quote void.',
    deliveryTerms: '2 weeks once the advance payment is done',
    moqTerms: 'Unit prices are based on a minimum order quantity (MOQ) of 50 pcs per item. Prices subject to change for quantities below MOQ.'
  },
  SHEETS: {
    DASHBOARD: 'Dashboard',
    STATEMENT: 'Statement',
    INCOME: 'Income',
    EXPENSES: 'Expenses',
    CRM: 'CRM & Sales Visits',
    QUOTES: 'Quotation Tracker',
    INVOICES: 'Invoice tracker',
    LINE_ITEMS: 'Line Items',
    SETTINGS: 'App Settings',
    CLIENTS: 'Clients',
    TEMPLATES: 'Quote Templates',
    ACTIVITY: 'Activity Log',
    CATALOG: 'Product Catalog',
    USERS: 'App Users',
    ATTACHMENTS: 'Attachments',
    FOLLOWUP_UPDATES: 'Follow-up Updates',
    PAYMENTS: 'Payment Log'
  },
  MOQ_DEFAULT: 50,
  /**
   * Always-admin Google accounts (personal Gmail — not Zoho).
   */
  ADMIN_EMAILS: [
    'alfredsv@gmail.com',
    'redreachdxb@gmail.com'
  ],
  /** Shared secret for GitHub Pages → Apps Script API (override in App Settings key apiToken) */
  API_TOKEN: 'rr-central-2026-change-me',
  ROLES: ['admin', 'sales'],
  FABRIC_OPTIONS: ['', 'GB', 'PV', 'TW'],
  PORTAL_DEFAULT: 'https://crm.redreach.ae',
  NEXT_ACTIONS: [
    'Call',
    'WhatsApp',
    'Email',
    'Visit / meeting',
    'Send quotation',
    'Follow up on quote',
    'Collect payment',
    'Send samples',
    'Awaiting client',
    'Other'
  ],
  /**
   * Division codes used in finalized reference numbers: RR-{code}-{YY}{seq}
   * 01 RR Threads, 02 RR Wanders, …
   */
  DIVISIONS: [
    { code: '01', brand: 'RR Threads', name: 'Uniforms', aliases: ['Uniform', 'Uniforms', 'RR Threads'] },
    { code: '02', brand: 'RR Wanders', name: 'Tours', aliases: ['Tours', 'Tour', 'RR Wanders'] },
    { code: '03', brand: 'RR Marketing', name: 'SEO and Marketing', aliases: ['Marketing Consultancy', 'Marketing', 'SEO', 'SEO and Marketing', 'RR Marketing'] },
    { code: '04', brand: 'RR Connect', name: 'Virtual Assistance', aliases: ['Virtual Assistance', 'Virtual assistance', 'RR Connect'] },
    { code: '05', brand: 'RR Care', name: 'Medical Tours / Care', aliases: ['Medical Tourism', 'Medical tours', 'Medical Care', 'RR Care'] },
    { code: '06', brand: 'RR Trading', name: 'Trading', aliases: ['Trading', 'RR Trading'] }
  ],
  // Backward-compatible alias used by older helpers
  VERTICALS: [],
  QUOTE_STATUSES: ['Draft', 'Finalized', 'Sent', 'Awarded', 'Not awarded', 'Expired', 'Superseded'],
  INVOICE_STATUSES: ['Draft', 'Sent', 'Awarded', 'Cancelled'],
  PAYMENT_STATUSES: ['Pending', 'Partial', 'Paid', 'Overdue'],
  PAYMENT_METHODS: ['Bank Transfer', 'Cash', 'Card', 'Cheque', 'Cheque or Bank Transfer', 'Other'],
  PAYMENT_TERMS: [
    'Immediate upon delivery',
    'Advance 50%, upon delivery 50%',
    'Advance 30%, upon delivery 70%',
    'Advance 70%, upon delivery 30%',
    '100% advance',
    'Cash on delivery (COD)',
    'Net 7 days',
    'Net 15 days',
    'Net 30 days',
    '50% advance, balance against L/C',
    'As per agreement'
  ],
  DELIVERY_TERMS: [
    '2 weeks once the advance payment is done',
    '1 week once the advance payment is done',
    '3 weeks once the advance payment is done',
    '4 weeks once the advance payment is done',
    'Ex-stock subject to prior sale',
    '7–10 working days after confirmation',
    '2–3 weeks after confirmation',
    'Immediate / ready stock',
    'As per agreed schedule',
    'To be confirmed upon order'
  ]
};

CONFIG.VERTICALS = CONFIG.DIVISIONS.map(function (d) {
  return { code: d.code, name: d.brand, category: d.name };
});

var CRM_HEADERS = [
  'Sl no', 'Company Name', 'Primary Contact', 'Email/Phone',
  'Mobile Number', 'Office number', 'Notes/Outcome', 'Follow-up Date',
  'Next Action', 'Owner', 'Quote Ref', 'Calendar Event Id',
  'Created By', 'Updated By'
];

var QUOTE_HEADERS = [
  'Sl no', 'Client', 'Vertical', 'Reference number',
  'Date', 'Description', 'Amount', 'Status',
  'Division Code', 'Base Reference', 'Revision', 'Quote ID',
  'Payment Terms', 'MOQ', 'Notes', 'Delivery Terms',
  'Outcome Reason', 'Created By', 'Updated By'
];

var INVOICE_HEADERS = [
  'Sl no', 'Client', 'Vertical', 'Reference number',
  'Date', 'Description', 'Amount', 'Status', 'Payment Status',
  'Payment Terms', 'MOQ', 'Notes', 'Delivery Terms',
  'Created By', 'Updated By'
];

var INCOME_HEADERS = [
  'Sl no', 'Client/Source', 'Category (Service/Product)', 'Reference Number',
  'Date', 'Description', 'Bill Amount', 'VAT', 'Total Amount',
  'Status', 'Payment Method', 'Payment Status'
];

var EXPENSE_HEADERS = [
  'Date', 'Vendor', 'Category (Travel/Rent/Ads)', 'Amount',
  'Payment Method', 'References', 'Notes'
];

var LINE_ITEM_HEADERS = [
  'Doc Type', 'Reference', 'Line No', 'Description',
  'Qty', 'Unit Price', 'VAT Rate', 'Amount', 'VAT Amount', 'Line Total',
  'Remarks'
];

var CLIENT_HEADERS = [
  'Client ID', 'Company Name', 'Primary Contact', 'Email',
  'Mobile', 'Office', 'Address', 'TRN', 'Notes', 'Created At'
];

var TEMPLATE_HEADERS = [
  'Template ID', 'Name', 'Division Code', 'Description', 'Items JSON', 'Created At'
];

var ACTIVITY_HEADERS = [
  'Timestamp', 'Action', 'Entity', 'Reference', 'Details', 'User'
];

var CATALOG_HEADERS = [
  'SKU', 'Name', 'Division Code', 'Unit Price', 'MOQ',
  'Fabric', 'Unit', 'Active', 'Notes', 'Updated At'
];

var USER_HEADERS = [
  'Email', 'Role', 'Name', 'Active'
];

var ATTACHMENT_HEADERS = [
  'Attachment ID', 'Entity Type', 'Entity Ref', 'File Name',
  'Drive File Id', 'Url', 'Uploaded At', 'Uploaded By'
];

var FOLLOWUP_UPDATE_HEADERS = [
  'Timestamp', 'Company', 'CRM Row', 'Update', 'User'
];

var PAYMENT_HEADERS = [
  'Timestamp', 'Invoice Ref', 'Client', 'Amount', 'Method', 'Notes', 'User', 'Balance After'
];
