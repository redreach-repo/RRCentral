/**
 * Spreadsheet helpers — read/write existing RR Central sheets
 */

function getSpreadsheet_() {
  // Prefer configured spreadsheet so the web app always hits the RR Central data file
  if (CONFIG.SPREADSHEET_ID) {
    try {
      return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    } catch (e) { /* fall through */ }
  }
  try {
    var active = SpreadsheetApp.getActiveSpreadsheet();
    if (active) return active;
  } catch (e2) { /* standalone */ }
  throw new Error('Unable to open spreadsheet. Check CONFIG.SPREADSHEET_ID.');
}

function getSheet_(name, createIfMissing, headers) {
  var ss = getSpreadsheet_();
  var sheet = findSheetByName_(ss, name);
  if (!sheet && createIfMissing) {
    var lock = LockService.getDocumentLock();
    try {
      lock.waitLock(15000);
    } catch (e) { /* continue without lock */ }
    try {
      sheet = findSheetByName_(ss, name);
      if (!sheet) {
        try {
          sheet = ss.insertSheet(name);
        } catch (err) {
          // Another execution may have created it at the same time
          sheet = findSheetByName_(ss, name);
          if (!sheet) throw err;
        }
      }
      if (sheet && headers && headers.length && sheet.getLastRow() === 0) {
        sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
        sheet.setFrozenRows(1);
        sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
      }
    } finally {
      try { lock.releaseLock(); } catch (e2) {}
    }
  }
  return sheet;
}

function findSheetByName_(ss, name) {
  var target = String(name || '').trim().toLowerCase();
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (String(sheets[i].getName()).trim().toLowerCase() === target) {
      return sheets[i];
    }
  }
  return null;
}

var ENSURING_APP_SHEETS_ = false;

function ensureAppSheets_() {
  // Prevent re-entry (listUsers → ensureAppSheets → ensureKnownAdmins → listUsers …)
  if (ENSURING_APP_SHEETS_) return { ok: true, reentered: true };
  ENSURING_APP_SHEETS_ = true;
  try {
    getSheet_(CONFIG.SHEETS.LINE_ITEMS, true, LINE_ITEM_HEADERS);
    getSheet_(CONFIG.SHEETS.CLIENTS, true, CLIENT_HEADERS);
    getSheet_(CONFIG.SHEETS.SETTINGS, true, ['Key', 'Value']);
    getSheet_(CONFIG.SHEETS.CRM, true, CRM_HEADERS);
    getSheet_(CONFIG.SHEETS.QUOTES, true, QUOTE_HEADERS);
    getSheet_(CONFIG.SHEETS.INVOICES, true, INVOICE_HEADERS);
    getSheet_(CONFIG.SHEETS.TEMPLATES, true, TEMPLATE_HEADERS);
    getSheet_(CONFIG.SHEETS.ACTIVITY, true, ACTIVITY_HEADERS);
    getSheet_(CONFIG.SHEETS.CATALOG, true, CATALOG_HEADERS);
    getSheet_(CONFIG.SHEETS.USERS, true, USER_HEADERS);
    getSheet_(CONFIG.SHEETS.ATTACHMENTS, true, ATTACHMENT_HEADERS);
    getSheet_(CONFIG.SHEETS.FOLLOWUP_UPDATES, true, FOLLOWUP_UPDATE_HEADERS);
    getSheet_(CONFIG.SHEETS.PAYMENTS, true, PAYMENT_HEADERS);
    ensureSettingsDefaults_();
    ensureQuoteSchema_();
    ensureInvoiceSchema_();
    ensureLineItemSchema_();
    ensureCatalogSchema_();
    ensureUsersSchema_();
    ensureAttachmentsSchema_();
    ensureFollowUpUpdatesSchema_();
    ensurePaymentsSchema_();
    ensureCrmSchema_();
    // Data validation is expensive on large quote sheets — run at most once per hour
    try {
      var cache = CacheService.getScriptCache();
      if (!cache.get('quote_validation_ok')) {
        ensureQuoteValidation_();
        cache.put('quote_validation_ok', '1', 3600);
      }
    } catch (e) { /* skip */ }
    ensureKnownAdmins_();
    return { ok: true };
  } finally {
    ENSURING_APP_SHEETS_ = false;
  }
}

function ensureQuoteValidation_() {
  var sheet = getSheet_(CONFIG.SHEETS.QUOTES);
  if (!sheet) return;
  // Only apply to used rows (+ buffer), not the entire sheet max rows
  var last = Math.min(Math.max(sheet.getLastRow() + 50, 50), 500);
  var verticals = [
    'Uniform', 'Tours', 'Trading', 'Marketing Consultancy', 'Virtual Assistance', 'Medical Tourism',
    'RR Threads', 'RR Wanders', 'RR Marketing', 'RR Connect', 'RR Care', 'RR Trading'
  ];
  var statuses = [
    'Draft', 'Pending', 'Finalized', 'Sent', 'Awarded', 'Not awarded', 'Expired', 'Superseded'
  ];
  sheet.getRange(2, 3, last - 1, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(verticals, true).setAllowInvalid(true).build()
  );
  sheet.getRange(2, 8, last - 1, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(statuses, true).setAllowInvalid(true).build()
  );
}

function ensureQuoteSchema_() {
  ensureHeaderRow_(getSheet_(CONFIG.SHEETS.QUOTES), QUOTE_HEADERS);
}

function ensureInvoiceSchema_() {
  ensureHeaderRow_(getSheet_(CONFIG.SHEETS.INVOICES), INVOICE_HEADERS);
}

function ensureLineItemSchema_() {
  ensureHeaderRow_(getSheet_(CONFIG.SHEETS.LINE_ITEMS), LINE_ITEM_HEADERS);
}

function ensureCatalogSchema_() {
  ensureHeaderRow_(getSheet_(CONFIG.SHEETS.CATALOG), CATALOG_HEADERS);
}

function ensureUsersSchema_() {
  ensureHeaderRow_(getSheet_(CONFIG.SHEETS.USERS), USER_HEADERS);
}

function ensureAttachmentsSchema_() {
  ensureHeaderRow_(getSheet_(CONFIG.SHEETS.ATTACHMENTS), ATTACHMENT_HEADERS);
}

function ensureFollowUpUpdatesSchema_() {
  ensureHeaderRow_(getSheet_(CONFIG.SHEETS.FOLLOWUP_UPDATES), FOLLOWUP_UPDATE_HEADERS);
}

function ensurePaymentsSchema_() {
  ensureHeaderRow_(getSheet_(CONFIG.SHEETS.PAYMENTS), PAYMENT_HEADERS);
}

function ensureCrmSchema_() {
  ensureHeaderRow_(getSheet_(CONFIG.SHEETS.CRM), CRM_HEADERS);
}

function ensureHeaderRow_(sheet, headers) {
  if (!sheet || !headers || !headers.length) return;
  var lastCol = Math.max(sheet.getLastColumn(), 1);
  var current = sheet.getRange(1, 1, 1, Math.max(lastCol, headers.length)).getValues()[0];
  for (var i = 0; i < headers.length; i++) {
    if (!current[i] || String(current[i]).trim() === '') {
      sheet.getRange(1, i + 1).setValue(headers[i]).setFontWeight('bold');
    }
  }
}

/**
 * Keep alfredsv@gmail.com + redreachdxb@gmail.com as admins in Settings + App Users.
 */
function ensureKnownAdmins_() {
  var admins = (CONFIG.ADMIN_EMAILS || []).map(function (e) {
    return String(e || '').toLowerCase().trim();
  }).filter(Boolean);
  if (!admins.length) return;

  try {
    var sheet = getSheet_(CONFIG.SHEETS.SETTINGS, true, ['Key', 'Value']);
    var map = readKeyValues_(sheet);
    var merged = {};
    String(map.adminEmails || '').split(/[,;\s]+/).forEach(function (e) {
      e = String(e || '').toLowerCase().trim();
      if (e) merged[e] = true;
    });
    admins.forEach(function (e) { merged[e] = true; });
    var next = Object.keys(merged).sort().join(', ');
    if (String(map.adminEmails || '').trim() !== next) {
      map.adminEmails = next;
      var rows = Object.keys(map).map(function (k) { return [k, map[k]]; });
      var output = [['Key', 'Value']].concat(rows);
      sheet.clearContents();
      sheet.getRange(1, 1, output.length, 2).setValues(output);
      sheet.getRange(1, 1, 1, 2).setFontWeight('bold');
    }
  } catch (e) { /* non-blocking */ }

  try {
    var userSheet = getSheet_(CONFIG.SHEETS.USERS, true, USER_HEADERS);
    ensureHeaderRow_(userSheet, USER_HEADERS);
    var names = {
      'alfredsv@gmail.com': 'Alfred',
      'redreachdxb@gmail.com': 'RED REACH DXB',
      'alfred@redreach.ae': 'Alfred',
      'jacob@redreach.ae': 'Jacob'
    };
    // Read users directly — do NOT call listUsers() (it would re-enter ensureAppSheets_)
    var existing = sheetToObjects_(userSheet).map(function (r) {
      return {
        row: r._row,
        email: String(r.Email || '').toLowerCase().trim(),
        role: String(r.Role || 'sales').toLowerCase(),
        name: r.Name || '',
        active: String(r.Active == null || r.Active === '' ? 'yes' : r.Active).toLowerCase() !== 'no'
      };
    }).filter(function (u) { return u.email; });

    admins.forEach(function (email) {
      var found = null;
      for (var i = 0; i < existing.length; i++) {
        if (existing[i].email === email) { found = existing[i]; break; }
      }
      var row = [email, 'admin', (found && found.name) || names[email] || email.split('@')[0], 'yes'];
      if (found) {
        if (found.role !== 'admin' || !found.active) setRowValues_(userSheet, found.row, row);
      } else {
        appendRows_(userSheet, [row]);
        existing.push({ email: email, role: 'admin', name: row[2], active: true });
      }
    });
  } catch (e2) { /* non-blocking */ }
}

function ensureSettingsDefaults_() {
  var sheet = getSheet_(CONFIG.SHEETS.SETTINGS, true, ['Key', 'Value']);
  var existing = readKeyValues_(sheet);
  var defaults = {
    companyName: CONFIG.COMPANY.name,
    brand: CONFIG.COMPANY.brand,
    tagline: CONFIG.COMPANY.tagline,
    address: CONFIG.COMPANY.address,
    email: CONFIG.COMPANY.email,
    phone: CONFIG.COMPANY.phone,
    website: CONFIG.COMPANY.website,
    trn: CONFIG.COMPANY.trn,
    accountName: CONFIG.COMPANY.accountName,
    bankName: CONFIG.COMPANY.bankName,
    bankAccount: CONFIG.COMPANY.bankAccount,
    iban: CONFIG.COMPANY.iban,
    swift: CONFIG.COMPANY.swift,
    paymentTerms: CONFIG.COMPANY.paymentTerms,
    paymentMethod: CONFIG.COMPANY.paymentMethod,
    quoteClosing: CONFIG.COMPANY.quoteClosing,
    quoteTerms: CONFIG.COMPANY.quoteTerms,
    deliveryTerms: CONFIG.COMPANY.deliveryTerms,
    moqTerms: CONFIG.COMPANY.moqTerms,
    vatRate: String(CONFIG.VAT_RATE),
    currency: CONFIG.CURRENCY,
    quotePrefix: 'RR',
    invoicePrefix: 'RR',
    defaultPaymentTerms: CONFIG.COMPANY.paymentTerms,
    defaultDeliveryTerms: CONFIG.COMPANY.deliveryTerms,
    quoteValidityDays: '14',
    moqDefault: String(CONFIG.MOQ_DEFAULT || 50),
    logoUrl: '',
    portalBaseUrl: CONFIG.PORTAL_DEFAULT || 'https://crm.redreach.ae',
    bilingualDefault: 'en',
    adminEmails: 'alfredsv@gmail.com, redreachdxb@gmail.com, alfred@redreach.ae, jacob@redreach.ae',
    apiToken: CONFIG.API_TOKEN || 'rr-central-2026-change-me',
    whatsappCountryCode: '971',
    followUpDaysAfterQuote: '3',
    calendarSync: 'yes',
    calendarId: 'primary'
  };
  var forceIfBlankOrPlaceholder = {
    companyName: true,
    brand: true,
    address: true,
    email: true,
    website: true,
    accountName: true,
    bankName: true,
    bankAccount: true,
    iban: true,
    paymentTerms: true,
    paymentMethod: true,
    quoteClosing: true,
    quoteTerms: true,
    deliveryTerms: true,
    moqTerms: true,
    quoteValidityDays: true,
    moqDefault: true,
    defaultDeliveryTerms: true
  };
  var placeholders = {
    address: ['Umm Al Quwain Free Zone, UAE', ''],
    email: [''],
    quoteValidityDays: ['30']
  };

  var merged = {};
  Object.keys(defaults).forEach(function (key) {
    merged[key] = defaults[key];
  });
  Object.keys(existing).forEach(function (key) {
    merged[key] = existing[key];
  });
  Object.keys(forceIfBlankOrPlaceholder).forEach(function (key) {
    if (!(key in defaults)) return;
    var cur = merged[key];
    var blank = cur === '' || cur === null || cur === undefined;
    var isPlaceholder = placeholders[key] && placeholders[key].indexOf(String(cur)) >= 0;
    if (blank || isPlaceholder || !(key in existing)) {
      merged[key] = defaults[key];
    }
  });

  var rows = Object.keys(merged).map(function (k) { return [k, merged[k]]; });
  sheet.clearContents();
  var output = [['Key', 'Value']].concat(rows);
  sheet.getRange(1, 1, output.length, 2).setValues(output);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, 2).setFontWeight('bold');
}

function readKeyValues_(sheet) {
  var last = sheet.getLastRow();
  var map = {};
  if (last < 2) return map;
  var values = sheet.getRange(2, 1, last, 2).getValues();
  values.forEach(function (row) {
    if (row[0]) map[String(row[0])] = row[1];
  });
  return map;
}

function getSettings() {
  ensureAppSheets_();
  var sheet = getSheet_(CONFIG.SHEETS.SETTINGS);
  var map = readKeyValues_(sheet);
  return {
    companyName: map.companyName || CONFIG.COMPANY.name,
    brand: map.brand || CONFIG.COMPANY.brand,
    tagline: map.tagline || CONFIG.COMPANY.tagline,
    address: map.address || CONFIG.COMPANY.address,
    email: map.email || CONFIG.COMPANY.email,
    phone: map.phone || '',
    website: map.website || CONFIG.COMPANY.website,
    trn: map.trn || '',
    accountName: map.accountName || CONFIG.COMPANY.accountName,
    bankName: map.bankName || CONFIG.COMPANY.bankName,
    bankAccount: map.bankAccount || CONFIG.COMPANY.bankAccount,
    iban: map.iban || CONFIG.COMPANY.iban,
    swift: map.swift || '',
    paymentTerms: map.paymentTerms || CONFIG.COMPANY.paymentTerms,
    paymentMethod: map.paymentMethod || CONFIG.COMPANY.paymentMethod,
    quoteClosing: map.quoteClosing || CONFIG.COMPANY.quoteClosing,
    quoteTerms: map.quoteTerms || CONFIG.COMPANY.quoteTerms,
    deliveryTerms: map.deliveryTerms || CONFIG.COMPANY.deliveryTerms,
    moqTerms: map.moqTerms || CONFIG.COMPANY.moqTerms,
    vatRate: Number(map.vatRate != null ? map.vatRate : CONFIG.VAT_RATE),
    currency: map.currency || CONFIG.CURRENCY,
    quotePrefix: map.quotePrefix || 'RR',
    invoicePrefix: map.invoicePrefix || 'RR',
    defaultPaymentTerms: map.defaultPaymentTerms || map.paymentTerms || CONFIG.COMPANY.paymentTerms,
    defaultDeliveryTerms: map.defaultDeliveryTerms || map.deliveryTerms || CONFIG.COMPANY.deliveryTerms,
    quoteValidityDays: Number(map.quoteValidityDays || 14),
    moqDefault: Number(map.moqDefault != null && map.moqDefault !== '' ? map.moqDefault : (CONFIG.MOQ_DEFAULT || 50)),
    logoUrl: map.logoUrl || '',
    portalBaseUrl: map.portalBaseUrl || CONFIG.PORTAL_DEFAULT || 'https://crm.redreach.ae',
    bilingualDefault: map.bilingualDefault || 'en',
    adminEmails: map.adminEmails || '',
    apiToken: map.apiToken || CONFIG.API_TOKEN || '',
    whatsappCountryCode: map.whatsappCountryCode || '971',
    followUpDaysAfterQuote: Number(map.followUpDaysAfterQuote != null && map.followUpDaysAfterQuote !== '' ? map.followUpDaysAfterQuote : 3),
    calendarSync: map.calendarSync == null || map.calendarSync === '' ? 'yes' : String(map.calendarSync),
    calendarId: map.calendarId || 'primary'
  };
}

function saveSettings(payload) {
  requireAdmin_('change settings');
  ensureAppSheets_();
  var sheet = getSheet_(CONFIG.SHEETS.SETTINGS);
  var existing = readKeyValues_(sheet);
  Object.keys(payload || {}).forEach(function (key) {
    existing[key] = payload[key];
  });
  if (payload && payload.paymentTerms) {
    existing.defaultPaymentTerms = payload.paymentTerms;
  }
  if (payload && payload.deliveryTerms) {
    existing.defaultDeliveryTerms = payload.deliveryTerms;
  }
  var rows = Object.keys(existing).map(function (k) { return [k, existing[k]]; });
  var output = [['Key', 'Value']].concat(rows);
  sheet.clearContents();
  sheet.getRange(1, 1, output.length, 2).setValues(output);
  sheet.getRange(1, 1, 1, 2).setFontWeight('bold');
  return getSettings();
}

function sheetVerticalName_(division) {
  var d = typeof division === 'string' ? getDivision_(division) : division;
  // Quotation Tracker column C has data validation on legacy names
  var legacy = {
    '01': 'Uniform',
    '02': 'Tours',
    '03': 'Marketing Consultancy',
    '04': 'Virtual Assistance',
    '05': 'Medical Tourism',
    '06': 'Trading'
  };
  return legacy[d.code] || d.aliases[0] || d.name;
}

function nextEmptyRow_(sheet, col) {
  col = col || 1;
  var last = Math.max(sheet.getLastRow(), 1);
  var values = sheet.getRange(1, col, last, col).getValues();
  for (var i = 1; i < values.length; i++) { // skip header
    if (values[i][0] === '' || values[i][0] === null) return i + 1;
  }
  // Prefer extending contiguously rather than jumping to max-row formatting
  var solid = 1;
  for (var j = 1; j < values.length; j++) {
    if (values[j][0] !== '' && values[j][0] !== null) solid = j + 1;
  }
  return solid + 1;
}

function appendRows_(sheet, rows) {
  if (!sheet || !rows || !rows.length) return;
  var width = rows[0].length;
  var rowIndex = nextEmptyRow_(sheet, 1);
  rows.forEach(function (row, idx) {
    var copy = row.slice();
    while (copy.length < width) copy.push('');
    if (copy.length > width) copy.length = width;
    setRowValues_(sheet, rowIndex + idx, copy);
  });
}

function setRowValues_(sheet, rowIndex, values) {
  if (!sheet || rowIndex < 1 || !values || !values.length) return;
  for (var i = 0; i < values.length; i++) {
    sheet.getRange(rowIndex, i + 1).setValue(values[i]);
  }
}

function sheetToObjects_(sheet, headerRow, maxCols) {
  if (!sheet) return [];
  headerRow = headerRow || 1;
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (maxCols) lastCol = Math.min(lastCol, maxCols);
  if (lastRow < headerRow || lastCol < 1) return [];
  var values = sheet.getRange(headerRow, 1, lastRow, lastCol).getValues();
  var headers = values[0].map(function (h) { return String(h || '').trim(); });
  var rows = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    if (isEmptyRow_(row)) continue;
    var obj = { _row: headerRow + i };
    headers.forEach(function (h, idx) {
      if (!h) return;
      // Keep first occurrence of a header name (Invoice tracker has duplicate lookup headers)
      if (Object.prototype.hasOwnProperty.call(obj, h)) return;
      obj[h] = normalizeCell_(row[idx]);
    });
    rows.push(obj);
  }
  return rows;
}

function isEmptyRow_(row) {
  return !row.some(function (c) {
    return c !== '' && c !== null && c !== undefined;
  });
}

function normalizeCell_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value)) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  if (typeof value === 'number' && !isFinite(value)) return '';
  return value;
}

function parseDate_(value) {
  if (!value) return null;
  if (Object.prototype.toString.call(value) === '[object Date]') return value;
  var s = String(value).trim();
  if (!s) return null;
  // yyyy-MM-dd
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  var d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function formatDisplayDate_(value) {
  var d = parseDate_(value);
  if (!d) return value || '';
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'dd-MMM-yyyy');
}

function toNumber_(value) {
  if (value === '' || value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  var n = Number(String(value).replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? 0 : n;
}

function nextSerial_(sheet, colIndex) {
  if (!sheet) return 1;
  var last = sheet.getLastRow();
  if (last < 2) return 1;
  var values = sheet.getRange(2, colIndex, last, colIndex).getValues();
  var max = 0;
  values.forEach(function (r) {
    var n = Number(r[0]);
    if (!isNaN(n) && n > max) max = n;
  });
  return max + 1;
}

function findHeaderColumn_(sheet, headerName) {
  if (!sheet || !headerName) return -1;
  var lastCol = Math.max(sheet.getLastColumn(), 1);
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var want = String(headerName).trim().toLowerCase();
  for (var i = 0; i < headers.length; i++) {
    if (String(headers[i] || '').trim().toLowerCase() === want) return i + 1;
  }
  return -1;
}

function findRowByReference_(sheet, refCol, reference) {
  var last = sheet.getLastRow();
  if (last < 2) return -1;
  // Prefer header-named reference column when possible
  var col = refCol;
  var named = findHeaderColumn_(sheet, 'Reference number');
  if (named < 0) named = findHeaderColumn_(sheet, 'Reference Number');
  if (named > 0) col = named;
  var values = sheet.getRange(2, col, last, col).getValues();
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0]).trim() === String(reference).trim()) {
      return i + 2;
    }
  }
  return -1;
}

function getDivision_(value) {
  var raw = String(value || '').trim();
  if (!raw) return CONFIG.DIVISIONS[0];
  var lower = raw.toLowerCase();
  for (var i = 0; i < CONFIG.DIVISIONS.length; i++) {
    var d = CONFIG.DIVISIONS[i];
    if (d.code === raw || d.code === raw.padStart(2, '0')) return d;
    if (d.brand.toLowerCase() === lower || d.name.toLowerCase() === lower) return d;
    for (var a = 0; a < d.aliases.length; a++) {
      if (String(d.aliases[a]).toLowerCase() === lower) return d;
    }
  }
  return CONFIG.DIVISIONS[0];
}

function getVerticalByName_(name) {
  var d = getDivision_(name);
  return { code: d.code, name: d.brand, category: d.name };
}

function getVerticalByCode_(code) {
  var d = getDivision_(code);
  return { code: d.code, name: d.brand, category: d.name };
}

function newQuoteId_() {
  return 'Q-' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmmss') +
    '-' + String(Math.floor(Math.random() * 900) + 100);
}

function parseBaseReference_(reference) {
  var ref = String(reference || '').trim();
  if (!ref) return '';
  var m = ref.match(/^(.*)_revision\s+\d+$/i);
  return m ? m[1] : ref;
}

function formatRevisionReference_(baseReference, revision) {
  var rev = Number(revision || 0);
  if (!rev) return baseReference;
  return baseReference + '_revision ' + rev;
}

/**
 * Finalized reference format: RR-{divisionCode}-{YY}{seq3}
 * e.g. RR-01-26103 (RR Threads)
 * Revisions: RR-01-26103_revision 1
 */
function generateReference_(divisionValue, kind) {
  var settings = getSettings();
  var prefix = kind === 'invoice' ? (settings.invoicePrefix || 'RR') : (settings.quotePrefix || 'RR');
  var division = getDivision_(divisionValue);
  var year = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yy');
  var sheetName = kind === 'invoice' ? CONFIG.SHEETS.INVOICES : CONFIG.SHEETS.QUOTES;
  var sheet = getSheet_(sheetName);
  var last = sheet.getLastRow();
  var seq = 1;
  var re = new RegExp('^' + prefix + '-' + division.code + '-' + year + '(\\d{3})(?:_revision\\s+\\d+)?$', 'i');
  if (last >= 2) {
    var refs = sheet.getRange(2, 4, last, 4).getValues();
    refs.forEach(function (r) {
      var m = String(r[0] || '').match(re);
      if (m) {
        var n = Number(m[1]);
        if (n >= seq) seq = n + 1;
      }
    });
    // Also scan Base Reference column for quotes
    if (kind !== 'invoice' && sheet.getLastColumn() >= 10) {
      var bases = sheet.getRange(2, 10, last, 10).getValues();
      bases.forEach(function (r) {
        var m = String(r[0] || '').match(new RegExp('^' + prefix + '-' + division.code + '-' + year + '(\\d{3})$'));
        if (m) {
          var n = Number(m[1]);
          if (n >= seq) seq = n + 1;
        }
      });
    }
  }
  var seqStr = ('000' + seq).slice(-3);
  return prefix + '-' + division.code + '-' + year + seqStr;
}

function previewNextReference(divisionValue, kind) {
  return generateReference_(divisionValue, kind || 'quote');
}

function money_(amount) {
  var n = toNumber_(amount);
  return n.toFixed(2);
}

function clearLineItems_(docType, reference) {
  var sheet = getSheet_(CONFIG.SHEETS.LINE_ITEMS, true, LINE_ITEM_HEADERS);
  var last = sheet.getLastRow();
  if (last < 2) return;
  var values = sheet.getRange(2, 1, last, 2).getValues();
  for (var i = values.length - 1; i >= 0; i--) {
    if (String(values[i][0]) === docType && String(values[i][1]) === String(reference)) {
      sheet.deleteRow(i + 2);
    }
  }
}

function saveLineItems_(docType, reference, items, vatRate) {
  clearLineItems_(docType, reference);
  var sheet = getSheet_(CONFIG.SHEETS.LINE_ITEMS, true, LINE_ITEM_HEADERS);
  var rate = vatRate != null ? Number(vatRate) : getSettings().vatRate;
  var rows = [];
  (items || []).forEach(function (item, idx) {
    var qty = toNumber_(item.qty || 1);
    var unit = toNumber_(item.unitPrice);
    var amount = qty * unit;
    var vatAmt = amount * rate;
    var total = amount + vatAmt;
    rows.push([
      docType,
      reference,
      idx + 1,
      item.description || '',
      qty,
      unit,
      rate,
      amount,
      vatAmt,
      total,
      item.remarks || item.notes || ''
    ]);
  });
  appendRows_(sheet, rows);
  return summarizeItems_(items, rate);
}

function summarizeItems_(items, vatRate) {
  var rate = vatRate != null ? Number(vatRate) : getSettings().vatRate;
  var subtotal = 0;
  var normalized = (items || []).map(function (item) {
    var qty = toNumber_(item.qty || 1);
    var unit = toNumber_(item.unitPrice);
    var amount = qty * unit;
    subtotal += amount;
    return {
      description: item.description || '',
      qty: qty,
      unitPrice: unit,
      amount: amount,
      vatAmount: amount * rate,
      lineTotal: amount * (1 + rate),
      remarks: item.remarks || item.notes || ''
    };
  });
  var vat = subtotal * rate;
  return {
    items: normalized,
    subtotal: subtotal,
    vat: vat,
    total: subtotal + vat,
    vatRate: rate
  };
}

function getLineItems_(docType, reference) {
  var sheet = getSheet_(CONFIG.SHEETS.LINE_ITEMS, true, LINE_ITEM_HEADERS);
  var all = sheetToObjects_(sheet);
  return all
    .filter(function (r) {
      return String(r['Doc Type']) === docType && String(r.Reference) === String(reference);
    })
    .sort(function (a, b) { return toNumber_(a['Line No']) - toNumber_(b['Line No']); })
    .map(function (r) {
      return {
        description: r.Description || '',
        qty: toNumber_(r.Qty || 1),
        unitPrice: toNumber_(r['Unit Price']),
        vatRate: toNumber_(r['VAT Rate']),
        amount: toNumber_(r.Amount),
        vatAmount: toNumber_(r['VAT Amount']),
        lineTotal: toNumber_(r['Line Total']),
        remarks: r.Remarks || ''
      };
    });
}
