/**
 * Web app entry + printable documents
 */

function doGet(e) {
  ensureAppSheets_();
  var params = (e && e.parameter) || {};
  var page = params.page || 'app';

  if (page === 'doc') {
    return serveDocument_(params);
  }

  // Dedicated Calendar OAuth page — visiting this as the app owner triggers Google's Allow screen
  if (page === 'calendar-connect' || page === 'calendar-auth') {
    return serveCalendarConnectPage_();
  }

  if (page === 'api') {
    return serveExternalApiPage_(params);
  }

  if (page === 'migrate' || page === 'migration') {
    return serveMigrationExport_(params);
  }

  var t = HtmlService.createTemplateFromFile('Index');
  t.bootstrap = JSON.stringify(getBootstrap());
  t.logoDataUri = (typeof LOGO_DATA_URI !== 'undefined') ? LOGO_DATA_URI : '';
  return t.evaluate()
    .setTitle('RED REACH Central')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function doPost(e) {
  ensureAppSheets_();
  var params = (e && e.parameter) || {};
  if (params.page === 'api' || (params.fn && params.reqId)) {
    return serveExternalApiPage_(params);
  }
  return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'Unknown POST' }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Opens in a new tab from Settings. Forces Calendar OAuth for the deploying Google account.
 */
function serveCalendarConnectPage_() {
  var owner = '';
  try { owner = Session.getEffectiveUser().getEmail(); } catch (e) {}
  var html = '';
  try {
    var cal = CalendarApp.getDefaultCalendar();
    var name = cal.getName();
    // Tiny probe so Calendar write scope is definitely granted
    var probe = cal.createEvent(
      'RED REACH Central — calendar OK',
      new Date(Date.now() + 86400000),
      new Date(Date.now() + 86400000 + 15 * 60000),
      { description: 'Safe to delete. Calendar permission is working.' }
    );
    try { probe.deleteEvent(); } catch (e2) {}
    try {
      var settingsSheet = getSheet_(CONFIG.SHEETS.SETTINGS, true, ['Key', 'Value']);
      var map = readKeyValues_(settingsSheet);
      map.calendarAuthorized = 'yes';
      map.calendarAuthorizedAt = new Date().toISOString();
      map.calendarAuthorizedAccount = owner || '';
      var rows = Object.keys(map).map(function (k) { return [k, map[k]]; });
      var output = [['Key', 'Value']].concat(rows);
      settingsSheet.clearContents();
      settingsSheet.getRange(1, 1, output.length, 2).setValues(output);
      settingsSheet.getRange(1, 1, 1, 2).setFontWeight('bold');
    } catch (e3) {}
    logActivity_('authorize_calendar', 'system', '', owner || name);
    html =
      '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>Calendar connected</title>' +
      '<style>body{font-family:DM Sans,system-ui,sans-serif;max-width:520px;margin:48px auto;padding:0 20px;color:#111}' +
      'h1{font-size:22px;margin:0 0 12px}.ok{color:#15803d}.muted{color:#6b7280;line-height:1.5}' +
      'a.btn{display:inline-block;margin-top:20px;background:#111;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px}</style></head><body>' +
      '<h1 class="ok">Google Calendar connected</h1>' +
      '<p>Account: <strong>' + escapeHtml_(owner || 'unknown') + '</strong></p>' +
      '<p>Calendar: <strong>' + escapeHtml_(name) + '</strong></p>' +
      '<p class="muted">You can close this tab and return to RED REACH Central → Settings → Sync follow-ups → Calendar.</p>' +
      '<a class="btn" href="' + escapeHtml_(ScriptApp.getService().getUrl() || '#') + '">Back to app</a>' +
      '</body></html>';
  } catch (err) {
    var authUrl = '';
    try {
      authUrl = ScriptApp.getAuthorizationInfo(ScriptApp.AuthMode.FULL).getAuthorizationUrl() || '';
    } catch (e4) {}
    html =
      '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>Calendar permission needed</title>' +
      '<style>body{font-family:DM Sans,system-ui,sans-serif;max-width:560px;margin:48px auto;padding:0 20px;color:#111}' +
      'h1{font-size:22px;margin:0 0 12px}.bad{color:#b91c1c}.muted{color:#6b7280;line-height:1.55}' +
      'ol{line-height:1.7}a.btn{display:inline-block;margin:8px 8px 0 0;background:#111;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px}' +
      'a.btn2{background:#fff;color:#111;border:1px solid #d1d5db}</style></head><body>' +
      '<h1 class="bad">Calendar permission still needed</h1>' +
      '<p>Signed in as app runner: <strong>' + escapeHtml_(owner || 'unknown') + '</strong></p>' +
      '<p class="muted">Error: ' + escapeHtml_(String(err.message || err)) + '</p>' +
      '<ol>' +
      '<li>Make sure you are signed into Chrome/Safari as <strong>alfredsv@gmail.com</strong> or <strong>redreachdxb@gmail.com</strong> (the Google account that owns this app).</li>' +
      '<li>Click <strong>Grant permission</strong> below and press Allow.</li>' +
      '<li>Then reload this page.</li>' +
      '</ol>' +
      (authUrl ? '<a class="btn" href="' + escapeHtml_(authUrl) + '" target="_blank" rel="noopener">Grant permission</a>' : '') +
      '<a class="btn btn2" href="javascript:location.reload()">Reload this page</a>' +
      '</body></html>';
  }
  return HtmlService.createHtmlOutput(html)
    .setTitle('Connect Google Calendar')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function escapeHtml_(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('RED REACH Central')
    .addItem('Open CRM Web App', 'openWebAppSidebar_')
    .addItem('Initialize app sheets', 'ensureAppSheets_')
    .addToUi();
}

function openWebAppSidebar_() {
  var html = HtmlService.createHtmlOutput(
    '<div style="font-family:sans-serif;padding:16px">' +
    '<p><b>RED REACH Central</b></p>' +
    '<p>Deploy this project as a Web App (Deploy → New deployment → Web app), then open the URL.</p>' +
    '<p>Run <code>ensureAppSheets_</code> once to create helper sheets and company defaults.</p>' +
    '</div>'
  ).setTitle('RED REACH Central');
  SpreadsheetApp.getUi().showSidebar(html);
}

function serveDocument_(params) {
  var type = params.type === 'invoice' ? 'invoice' : 'quote';
  var reference = params.ref || params.id || '';
  if (!reference) {
    return HtmlService.createHtmlOutput('<p>Missing document reference.</p>');
  }
  var data = type === 'invoice' ? getInvoice(reference) : getQuote(reference);
  var doc = type === 'invoice' ? data.invoice : data.quote;
  var division = getDivision_(doc.divisionCode || doc.vertical || doc.divisionBrand);
  var lang = String(params.lang || data.settings.bilingualDefault || 'en').toLowerCase();
  if (lang !== 'ar' && lang !== 'both') lang = 'en';
  var t = HtmlService.createTemplateFromFile('DocumentView');
  t.docType = type;
  t.lang = lang;
  t.L = getDocumentLabels_(type, lang);
  t.title = t.L.title;
  t.data = data;
  t.doc = doc;
  t.items = data.items;
  t.summary = data.summary;
  t.client = data.client || {};
  t.settings = data.settings;
  t.currency = data.settings.currency || 'AED';
  t.issueDate = formatDisplayDate_(doc.date);
  t.logoSrc = data.settings.logoUrl || ((typeof LOGO_DATA_URI !== 'undefined') ? LOGO_DATA_URI : '');
  t.divisionLabel = division.brand;
  t.divisionName = division.name;
  t.divisionCode = division.code;
  t.docUrl = getDocumentUrl(type, doc.reference || doc.quoteId || reference, lang);
  t.attachments = [];
  try {
    t.attachments = listAttachments(type === 'invoice' ? 'invoice' : 'quote', doc.quoteId || doc.reference || reference);
  } catch (e) { t.attachments = []; }
  t.validUntil = '';
  if (type === 'quote') {
    var d = parseDate_(doc.date) || new Date();
    var days = Number(data.settings.quoteValidityDays || 14);
    var until = new Date(d.getTime() + days * 86400000);
    t.validUntil = Utilities.formatDate(until, Session.getScriptTimeZone(), 'dd-MMM-yyyy');
  }
  var label = type === 'invoice' ? 'Invoice ' : 'Quotation ';
  var titleRef = doc.reference || doc.quoteId || reference;
  return t.evaluate()
    .setTitle(label + titleRef)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getDocumentLabels_(type, lang) {
  var en = {
    title: type === 'invoice' ? 'TAX INVOICE' : 'QUOTATION',
    billTo: 'Bill to',
    summary: 'Summary',
    description: 'Description',
    qty: 'Qty',
    unit: 'Unit',
    amount: 'Amount',
    subtotal: 'Subtotal',
    vat: 'VAT',
    total: 'Total',
    paymentDetails: 'Payment Details',
    paymentTerms: 'Payment Terms',
    delivery: 'Delivery',
    method: 'Method',
    remarks: 'Remarks',
    date: 'Date',
    validUntil: 'Valid until',
    revision: 'Revision',
    status: 'Status',
    approvedBy: 'Approved By',
    preparedBy: 'Prepared By',
    attachments: 'Attachments',
    draftBanner: 'DRAFT — reference number is assigned only when this quotation is finalized.'
  };
  var ar = {
    title: type === 'invoice' ? 'فاتورة ضريبية' : 'عرض سعر',
    billTo: 'فاتورة إلى',
    summary: 'الملخص',
    description: 'الوصف',
    qty: 'الكمية',
    unit: 'السعر',
    amount: 'المبلغ',
    subtotal: 'المجموع الفرعي',
    vat: 'ضريبة القيمة المضافة',
    total: 'الإجمالي',
    paymentDetails: 'تفاصيل الدفع',
    paymentTerms: 'شروط الدفع',
    delivery: 'التسليم',
    method: 'طريقة الدفع',
    remarks: 'ملاحظات',
    date: 'التاريخ',
    validUntil: 'صالح حتى',
    revision: 'مراجعة',
    status: 'الحالة',
    approvedBy: 'اعتماد',
    preparedBy: 'إعداد',
    attachments: 'مرفقات',
    draftBanner: 'مسودة — يتم تعيين رقم المرجع عند اعتماد عرض السعر.'
  };
  if (lang === 'ar') return ar;
  if (lang === 'both') {
    var both = {};
    Object.keys(en).forEach(function (k) {
      both[k] = en[k] + ' / ' + ar[k];
    });
    both.title = en.title + ' · ' + ar.title;
    return both;
  }
  return en;
}

function getDocumentUrl(type, reference, lang) {
  var base = ScriptApp.getService().getUrl();
  var q = '?page=doc&type=' + encodeURIComponent(type) + '&ref=' + encodeURIComponent(reference);
  if (lang) q += '&lang=' + encodeURIComponent(lang);
  if (!base) return q;
  return base + q;
}
